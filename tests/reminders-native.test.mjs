import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
const { createReminderScheduler } = createRequire(import.meta.url)(
  "../electron/reminders.cjs",
);

async function fixture(t) {
  const results = path.resolve("test-results");
  await fs.mkdir(results, { recursive: true });
  const dir = await fs.mkdtemp(path.join(results, "reminders-test-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  let clock = Date.UTC(2026, 9, 15, 12);
  let nextTimer;
  const alerts = [];
  const errors = [];
  const options = {
    deliveryPath: path.join(dir, "reminder-deliveries.json"),
    now: () => clock,
    notify: (note, receipt) => alerts.push({ note, receipt }),
    setTimer: (callback, delay) => {
      nextTimer = { callback, delay };
      return nextTimer;
    },
    clearTimer: (timer) => {
      if (nextTimer === timer) nextTimer = undefined;
    },
    onError: (error) => errors.push(error),
  };
  const scheduler = createReminderScheduler(options);
  t.after(() => scheduler.stop());
  await scheduler.ready;
  return {
    scheduler,
    dir,
    options,
    alerts,
    errors,
    advance: (ms) => (clock += ms),
    now: () => clock,
    timer: () => nextTimer,
  };
}

test("native reminders recover overdue delivery once, even with a stale renderer save", async (t) => {
  const f = await fixture(t);
  const due = f.now() - 3600000;
  const stale = {
    notes: [{ id: "meeting", title: "Meeting", reminderAt: due }],
  };
  await f.scheduler.replaceLibrary(stale);
  assert.equal(f.timer().delay, 0);
  await f.scheduler.checkDue();
  assert.deepEqual(f.errors, []);
  assert.equal(f.alerts.length, 1);
  assert.equal(f.alerts[0].receipt.deliveredAt, f.now());
  await f.scheduler.replaceLibrary(stale);
  await f.scheduler.checkDue();
  assert.equal(f.alerts.length, 1);
  f.scheduler.stop();

  const restarted = createReminderScheduler(f.options);
  t.after(() => restarted.stop());
  const recovered = await restarted.replaceLibrary(stale);
  assert.equal(recovered.notes[0].reminderNotifiedAt, f.now());
  await restarted.checkDue();
  assert.equal(f.alerts.length, 1, "Persisted receipt prevents a duplicate alert");
  assert.deepEqual(f.errors, []);
});

test("editing, removing, and deleting reminders cancels old dates", async (t) => {
  const f = await fixture(t);
  const due = f.now() + 1000;
  const future = due + 5000;
  await f.scheduler.replaceLibrary({
    notes: [
      { id: "edited", reminderAt: due },
      { id: "removed", reminderAt: due },
      { id: "deleted", reminderAt: due },
    ],
  });
  await f.scheduler.replaceLibrary({
    notes: [
      { id: "edited", reminderAt: future },
      { id: "removed", reminderAt: null },
      { id: "deleted", reminderAt: due, deletedAt: f.now() },
    ],
  });
  f.advance(1000);
  await f.scheduler.checkDue();
  assert.equal(f.alerts.length, 0);
  f.advance(5000);
  await f.scheduler.checkDue();
  assert.equal(f.alerts.length, 1);
  assert.equal(f.alerts[0].receipt.noteId, "edited");
  await f.scheduler.replaceLibrary({
    notes: [{ id: "edited", reminderAt: future + 1000 }],
  });
  f.advance(1000);
  await f.scheduler.checkDue();
  assert.equal(f.alerts.length, 2, "An edited reminder may deliver again");
});

test("native scheduling rejects invalid dates and rechecks long timers for clock changes", async (t) => {
  const f = await fixture(t);
  await f.scheduler.replaceLibrary({
    notes: [
      { id: "bad-string", reminderAt: String(f.now()) },
      { id: "bad-float", reminderAt: f.now() + 0.5 },
      { id: "bad-range", reminderAt: Date.UTC(2101, 0, 1) },
      { id: "future", reminderAt: f.now() + 86400000 },
    ],
  });
  assert.equal(f.timer().delay, 60000);
  f.advance(86400000);
  await f.scheduler.checkDue();
  assert.equal(f.alerts.length, 1);
  assert.equal(f.alerts[0].receipt.noteId, "future");
  f.scheduler.stop();
  assert.equal(f.timer(), undefined);
});

test("failed notifications remain pending and autosaves cannot accelerate their retry", async (t) => {
  const f = await fixture(t);
  let attempts = 0;
  const scheduler = createReminderScheduler({
    ...f.options,
    notify: (note, receipt) => {
      attempts++;
      if (attempts === 1) throw new Error("Windows rejected the notification");
      f.alerts.push({ note, receipt });
    },
  });
  t.after(() => scheduler.stop());
  const library = {
    notes: [{ id: "failed", reminderAt: f.now() - 1000 }],
  };
  await scheduler.replaceLibrary(library);
  await scheduler.checkDue();
  assert.equal(attempts, 1);
  assert.equal(f.alerts.length, 0);
  assert.equal(f.timer().delay, 60000);
  assert.equal(
    (await scheduler.replaceLibrary(library)).notes[0].reminderNotifiedAt,
    null,
  );
  for (let i = 0; i < 3; i++) {
    await scheduler.replaceLibrary(library);
    await scheduler.checkDue();
  }
  assert.equal(attempts, 1, "Repeated saves must preserve the failure backoff");
  assert.equal(f.timer().delay, 60000);
  f.advance(59999);
  await scheduler.checkDue();
  assert.equal(attempts, 1);
  assert.equal(f.timer().delay, 1);
  f.advance(1);
  await scheduler.checkDue();
  assert.equal(attempts, 2);
  assert.equal(f.alerts.length, 1);
  assert.equal(f.timer(), undefined);
});

test("a failed reminder does not delay another reminder's scheduled time", async (t) => {
  const f = await fixture(t);
  const scheduler = createReminderScheduler({
    ...f.options,
    notify: (note, receipt) => {
      if (note.id === "failed") return Promise.reject(new Error("No delivery"));
      f.alerts.push({ note, receipt });
    },
  });
  t.after(() => scheduler.stop());
  await scheduler.replaceLibrary({
    notes: [
      { id: "failed", reminderAt: f.now() - 1000 },
      { id: "soon", reminderAt: f.now() + 5000 },
    ],
  });
  await scheduler.checkDue();
  assert.equal(f.timer().delay, 5000);
  f.advance(5000);
  await scheduler.checkDue();
  assert.equal(f.alerts[0].note.id, "soon");
  assert.equal(f.timer().delay, 55000);
});

test("a failed receipt write retries the write without duplicating a confirmed alert", async (t) => {
  const f = await fixture(t);
  const blocker = path.join(path.dirname(f.options.deliveryPath), "blocked");
  const scheduler = createReminderScheduler({
    ...f.options,
    deliveryPath: path.join(blocker, "receipts.json"),
  });
  t.after(() => scheduler.stop());
  await scheduler.ready;
  await fs.writeFile(blocker, "not a directory");
  const library = {
    notes: [{ id: "blocked", reminderAt: f.now() - 1000 }],
  };
  await scheduler.replaceLibrary(library);
  await scheduler.checkDue();
  assert.equal(f.alerts.length, 1);
  assert.equal(f.timer().delay, 60000);
  assert.equal(f.errors.length, 1);
  assert.equal(
    (await scheduler.replaceLibrary(library)).notes[0].reminderNotifiedAt,
    f.now(),
  );
  await scheduler.checkDue();
  assert.equal(f.alerts.length, 1);
  await fs.unlink(blocker);
  f.advance(60000);
  await scheduler.checkDue();
  assert.equal(f.alerts.length, 1);
  assert.equal(f.timer(), undefined);
  assert.equal(
    JSON.parse(await fs.readFile(path.join(blocker, "receipts.json"), "utf8"))
      .deliveries.length,
    1,
  );
});

test("renderer delivery markers cannot suppress pending native notifications", async (t) => {
  const f = await fixture(t);
  const library = {
    notes: [{
      id: "renderer-only",
      reminderAt: f.now() - 1000,
      reminderNotifiedAt: f.now(),
    }],
  };
  const recovered = await f.scheduler.replaceLibrary(library);
  assert.equal(recovered.notes[0].reminderNotifiedAt, null);
  await f.scheduler.checkDue();
  assert.equal(f.alerts.length, 1);
});

test("legacy version-one native receipts still prevent duplicate alerts", async (t) => {
  const f = await fixture(t);
  f.scheduler.stop();
  const reminderAt = f.now() - 1000;
  await fs.writeFile(f.options.deliveryPath, JSON.stringify({
    version: 1,
    deliveries: [{ noteId: "legacy", reminderAt, deliveredAt: f.now() }],
  }));
  const scheduler = createReminderScheduler(f.options);
  t.after(() => scheduler.stop());
  const restored = await scheduler.replaceLibrary({
    notes: [{ id: "legacy", reminderAt, reminderNotifiedAt: null }],
  });
  assert.equal(restored.notes[0].reminderNotifiedAt, f.now());
  await scheduler.checkDue();
  assert.equal(f.alerts.length, 0);
});

test("explicit retry durably resets one due reminder at the same scheduled time", async (t) => {
  const f = await fixture(t);
  const library = {
    notes: [
      { id: "again", reminderAt: f.now() - 1000 },
      { id: "future", reminderAt: f.now() + 10000 },
    ],
  };
  await f.scheduler.replaceLibrary(library);
  await f.scheduler.checkDue();
  assert.equal(f.alerts.length, 1);
  assert.equal(await f.scheduler.retryReminder("missing"), false);
  assert.equal(await f.scheduler.retryReminder("future"), false);
  assert.equal(await f.scheduler.retryReminder(null), false);
  assert.equal(await f.scheduler.retryReminder("again"), true);
  assert.deepEqual(
    JSON.parse(await fs.readFile(f.options.deliveryPath, "utf8")).deliveries,
    [],
  );
  assert.equal(
    (await f.scheduler.replaceLibrary(library)).notes[0].reminderNotifiedAt,
    null,
  );
  assert.equal(f.timer().delay, 0);
  await f.scheduler.checkDue();
  assert.equal(f.alerts.length, 2);
  assert.equal(f.alerts[1].receipt.reminderAt, library.notes[0].reminderAt);
});

test("explicit retry can bypass a failed attempt's backoff", async (t) => {
  const f = await fixture(t);
  let fail = true;
  const scheduler = createReminderScheduler({
    ...f.options,
    notify: (note, receipt) => {
      if (fail) throw new Error("Not displayed");
      f.alerts.push({ note, receipt });
    },
  });
  t.after(() => scheduler.stop());
  await scheduler.replaceLibrary({
    notes: [{ id: "retry-failed", reminderAt: f.now() - 1000 }],
  });
  await scheduler.checkDue();
  assert.equal(f.timer().delay, 60000);
  fail = false;
  assert.equal(await scheduler.retryReminder("retry-failed"), true);
  assert.equal(f.timer().delay, 0);
  await scheduler.checkDue();
  assert.equal(f.alerts.length, 1);
});

test("an unsuccessful explicit reset preserves the confirmed receipt", async (t) => {
  const f = await fixture(t);
  const library = {
    notes: [{ id: "keep-receipt", reminderAt: f.now() - 1000 }],
  };
  await f.scheduler.replaceLibrary(library);
  await f.scheduler.checkDue();
  await fs.mkdir(f.options.deliveryPath + ".tmp");
  assert.equal(await f.scheduler.retryReminder("keep-receipt"), false);
  assert.equal(
    (await f.scheduler.replaceLibrary(library)).notes[0].reminderNotifiedAt,
    f.now(),
  );
  await f.scheduler.checkDue();
  assert.equal(f.alerts.length, 1);
  await fs.rmdir(f.options.deliveryPath + ".tmp");
  f.advance(60000);
  await f.scheduler.checkDue();
  assert.equal(f.alerts.length, 1);
  assert.equal(await f.scheduler.retryReminder("keep-receipt"), true);
  await f.scheduler.checkDue();
  assert.equal(f.alerts.length, 2);
});
