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

test("a failed receipt write retries without a repeated immediate timer or false delivery", async (t) => {
  const f = await fixture(t);
  const blocker = path.join(path.dirname(f.options.deliveryPath), "blocked");
  await fs.writeFile(blocker, "not a directory");
  const scheduler = createReminderScheduler({
    ...f.options,
    deliveryPath: path.join(blocker, "receipts.json"),
  });
  t.after(() => scheduler.stop());
  await scheduler.replaceLibrary({
    notes: [{ id: "blocked", reminderAt: f.now() - 1000 }],
  });
  await scheduler.checkDue();
  assert.equal(f.alerts.length, 0);
  assert.equal(f.timer().delay, 60000);
  assert.equal(f.errors.length, 1);
  await fs.unlink(blocker);
  await scheduler.checkDue();
  assert.equal(f.alerts.length, 1);
});
