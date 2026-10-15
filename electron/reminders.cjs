const fs = require("node:fs/promises");
const path = require("node:path");

const MAX_REMINDER_DATE = Date.UTC(2100, 0, 1);
const validTime = (value) =>
  Number.isSafeInteger(value) && value > 0 && value <= MAX_REMINDER_DATE;
const validId = (id) =>
  typeof id === "string" && /^[a-z0-9_-]{1,100}$/i.test(id);
const RETRY_DELAY = 60000;

// Keep delivery receipts separate from the library so a renderer save cannot
// overwrite them. Receipts contain identifiers and dates, never note contents.
function createReminderScheduler({
  deliveryPath,
  notify,
  now = Date.now,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  onError = console.error,
}) {
  let notes = new Map();
  let delivered = new Map();
  let retryAfter = new Map();
  let receiptsDirty = false;
  let receiptRetryAt;
  let timer;
  let stopped = false;
  let queue = Promise.resolve();
  const enqueue = (operation) => {
    const next = queue.then(operation);
    queue = next.catch(onError);
    return next;
  };
  const ready = enqueue(async () => {
    try {
      const data = JSON.parse(await fs.readFile(deliveryPath, "utf8"));
      if (data.version !== 1 || !Array.isArray(data.deliveries)) return;
      for (const receipt of data.deliveries.slice(0, 10000)) {
        if (
          validId(receipt?.noteId) &&
          validTime(receipt.reminderAt) &&
          Number.isSafeInteger(receipt.deliveredAt) &&
          receipt.deliveredAt >= receipt.reminderAt
        )
          delivered.set(receipt.noteId, receipt);
      }
    } catch (error) {
      if (error.code !== "ENOENT") onError(error);
    }
  });

  function receiptFor(note) {
    const receipt = delivered.get(note.id);
    return receipt?.reminderAt === note.reminderAt ? receipt : null;
  }

  async function persist() {
    await fs.mkdir(path.dirname(deliveryPath), { recursive: true });
    await fs.writeFile(
      deliveryPath + ".tmp",
      JSON.stringify({ version: 1, deliveries: [...delivered.values()] }),
      "utf8",
    );
    await fs.rename(deliveryPath + ".tmp", deliveryPath);
  }

  async function commitReceipts() {
    try {
      await persist();
      receiptsDirty = false;
      receiptRetryAt = undefined;
      return true;
    } catch (error) {
      // A confirmed notification must not be shown again merely because its
      // receipt could not be written. Retain it in memory and retry the write.
      receiptsDirty = true;
      receiptRetryAt = now() + RETRY_DELAY;
      onError(error);
      return false;
    }
  }

  function schedule() {
    if (timer !== undefined) clearTimer(timer);
    timer = undefined;
    if (stopped) return;
    let earliest = Infinity;
    for (const note of notes.values()) {
      if (receiptFor(note)) continue;
      const retry = retryAfter.get(note.id);
      earliest = Math.min(
        earliest,
        Math.max(
          note.reminderAt,
          retry?.reminderAt === note.reminderAt ? retry.at : 0,
        ),
      );
    }
    if (receiptsDirty) earliest = Math.min(earliest, receiptRetryAt);
    if (!Number.isFinite(earliest)) return;
    // Recheck at least once a minute: sleeping PCs and clock changes must not
    // leave a reminder waiting for a stale long timeout.
    timer = setTimer(
      () => {
        timer = undefined;
        checkDue().catch(onError);
      },
      Math.min(60000, Math.max(0, earliest - now())),
    );
    timer?.unref?.();
  }

  function checkDue() {
    return enqueue(async () => {
      if (stopped) return;
      if (receiptsDirty && receiptRetryAt <= now()) await commitReceipts();
      for (const note of notes.values()) {
        if (note.reminderAt > now() || receiptFor(note)) continue;
        const retry = retryAfter.get(note.id);
        if (retry?.reminderAt === note.reminderAt && retry.at > now()) continue;
        const receipt = {
          noteId: note.id,
          reminderAt: note.reminderAt,
          deliveredAt: Math.max(note.reminderAt, now()),
        };
        try {
          // notify resolves only after Windows confirms display, or after a
          // visible app-owned fallback. An attempted alert is not a delivery.
          await notify(note, receipt);
        } catch (error) {
          onError(error);
          retryAfter.set(note.id, {
            reminderAt: note.reminderAt,
            at: now() + RETRY_DELAY,
          });
          continue;
        }
        delivered.set(note.id, receipt);
        retryAfter.delete(note.id);
        receiptsDirty = true;
        await commitReceipts();
      }
      schedule();
    });
  }

  async function replaceLibrary(library) {
    await ready;
    return enqueue(async () => {
      const next = new Map();
      for (const note of library.notes || []) {
        if (
          !note.deletedAt &&
          validId(note.id) &&
          validTime(note.reminderAt)
        ) {
          next.set(note.id, {
            id: note.id,
            title: note.title,
            locked: note.locked,
            reminderAt: note.reminderAt,
          });
        }
      }
      notes = next;
      let pruned = false;
      for (const [id, receipt] of delivered) {
        if (notes.get(id)?.reminderAt !== receipt.reminderAt) {
          delivered.delete(id);
          pruned = true;
        }
      }
      for (const [id, retry] of retryAfter)
        if (notes.get(id)?.reminderAt !== retry.reminderAt) retryAfter.delete(id);
      if (pruned) {
        receiptsDirty = true;
        await commitReceipts();
      }
      schedule();
      return {
        ...library,
        notes: library.notes.map((note) => {
          const receipt = receiptFor(note);
          // Renderer state can be stale, including the old implementation's
          // premature delivery markers. Only native receipts acknowledge it.
          return { ...note, reminderNotifiedAt: receipt?.deliveredAt ?? null };
        }),
      };
    });
  }

  async function retryReminder(noteId) {
    await ready;
    return enqueue(async () => {
      const note = notes.get(noteId);
      if (stopped || !validId(noteId) || !note || note.reminderAt > now())
        return false;
      const previousReceipt = delivered.get(noteId);
      const previousRetry = retryAfter.get(noteId);
      delivered.delete(noteId);
      retryAfter.delete(noteId);
      receiptsDirty = true;
      // Make the explicit reset durable before permitting a second alert for
      // the same scheduled time. A failed reset leaves the old receipt intact.
      if (!(await commitReceipts())) {
        if (previousReceipt) delivered.set(noteId, previousReceipt);
        if (previousRetry) retryAfter.set(noteId, previousRetry);
        schedule();
        return false;
      }
      schedule();
      return true;
    });
  }

  return {
    ready,
    replaceLibrary,
    checkDue,
    retryReminder,
    flush: () => queue,
    stop() {
      stopped = true;
      if (timer !== undefined) clearTimer(timer);
      timer = undefined;
    },
  };
}

module.exports = { createReminderScheduler };
