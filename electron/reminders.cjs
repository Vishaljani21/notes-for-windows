const fs = require("node:fs/promises");
const path = require("node:path");

const MAX_REMINDER_DATE = Date.UTC(2100, 0, 1);
const validTime = (value) =>
  Number.isSafeInteger(value) && value > 0 && value <= MAX_REMINDER_DATE;
const validId = (id) =>
  typeof id === "string" && /^[a-z0-9_-]{1,100}$/i.test(id);

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
          validId(receipt.noteId) &&
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

  function schedule(retry = false) {
    if (timer !== undefined) clearTimer(timer);
    timer = undefined;
    if (stopped) return;
    let earliest = Infinity;
    for (const note of notes.values())
      if (!receiptFor(note)) earliest = Math.min(earliest, note.reminderAt);
    if (!Number.isFinite(earliest)) return;
    // Recheck at least once a minute: sleeping PCs and clock changes must not
    // leave a reminder waiting for a stale long timeout.
    timer = setTimer(
      () => {
        timer = undefined;
        checkDue().catch(onError);
      },
      retry ? 60000 : Math.min(60000, Math.max(0, earliest - now())),
    );
    timer?.unref?.();
  }

  function checkDue() {
    return enqueue(async () => {
      if (stopped) return;
      let retry = false;
      for (const note of notes.values()) {
        if (note.reminderAt > now() || receiptFor(note)) continue;
        const receipt = {
          noteId: note.id,
          reminderAt: note.reminderAt,
          deliveredAt: Math.max(note.reminderAt, now()),
        };
        delivered.set(note.id, receipt);
        try {
          // Commit before showing the notification to avoid repeated alerts
          // when the app closes before its renderer has saved the receipt.
          await persist();
        } catch (error) {
          delivered.delete(note.id);
          onError(error);
          retry = true;
          continue;
        }
        try {
          await notify(note, receipt);
        } catch (error) {
          onError(error);
        }
      }
      schedule(retry);
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
          if (
            Number.isSafeInteger(note.reminderNotifiedAt) &&
            note.reminderNotifiedAt >= note.reminderAt &&
            !receiptFor(note)
          )
            delivered.set(note.id, {
              noteId: note.id,
              reminderAt: note.reminderAt,
              deliveredAt: note.reminderNotifiedAt,
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
      if (pruned) await persist().catch(onError);
      schedule();
      return {
        ...library,
        notes: library.notes.map((note) => {
          const receipt = receiptFor(note);
          return receipt
            ? { ...note, reminderNotifiedAt: receipt.deliveredAt }
            : note;
        }),
      };
    });
  }

  return {
    ready,
    replaceLibrary,
    checkDue,
    flush: () => queue,
    stop() {
      stopped = true;
      if (timer !== undefined) clearTimer(timer);
      timer = undefined;
    },
  };
}

module.exports = { createReminderScheduler };
