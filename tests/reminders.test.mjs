import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  MAX_REMINDER_TIME,
  formatReminder,
  isReminderTimestamp,
  normalizeReminder,
  parseReminderInput,
  reminderPreset,
  toReminderInput,
  validateReminderTime,
} from "../src/reminders.mjs";

test("persisted reminders normalize unsafe dates and stale delivery markers", () => {
  const scheduled = Date.UTC(2026, 9, 16, 9);
  const delivered = scheduled + 2 * 60 * 60 * 1000;
  assert.deepEqual(normalizeReminder({}), {
    reminderAt: null,
    reminderNotifiedAt: null,
  });
  for (const value of [
    "2026-10-16",
    "1792141200000",
    NaN,
    Infinity,
    -1,
    0,
    1.5,
    MAX_REMINDER_TIME + 1,
  ]) {
    assert.equal(isReminderTimestamp(value), false);
    assert.deepEqual(
      normalizeReminder({ reminderAt: value, reminderNotifiedAt: delivered }),
      { reminderAt: null, reminderNotifiedAt: null },
    );
  }
  assert.deepEqual(
    normalizeReminder({ reminderAt: scheduled, reminderNotifiedAt: delivered }),
    { reminderAt: scheduled, reminderNotifiedAt: delivered },
  );
  assert.deepEqual(
    normalizeReminder({
      reminderAt: scheduled,
      reminderNotifiedAt: scheduled - 1,
    }),
    { reminderAt: scheduled, reminderNotifiedAt: null },
  );
  // Overdue dates must survive loading so a notification can be delivered later.
  assert.equal(normalizeReminder({ reminderAt: 1 }).reminderAt, 1);
});

test("new reminders require a real future time within the scheduler range", () => {
  const now = Date.UTC(2026, 9, 15, 10);
  assert.equal(validateReminderTime(now + 1, now), null);
  assert.match(validateReminderTime(now, now), /future/);
  assert.match(validateReminderTime(now - 1, now), /future/);
  assert.match(validateReminderTime(null, now), /valid date/);
  assert.match(validateReminderTime(MAX_REMINDER_TIME + 1, now), /before 2100/);
  assert.equal(reminderPreset("other", now), null);
  assert.equal(reminderPreset("hour", Infinity), null);
  assert.equal(reminderPreset("hour", MAX_REMINDER_TIME - 1), null);
});

test("local input round-trips, rejects calendar overflow, and formats valid dates", () => {
  const expected = new Date(2028, 1, 29, 16, 42).getTime();
  assert.equal(parseReminderInput("2028-02-29T16:42"), expected);
  assert.equal(toReminderInput(expected), "2028-02-29T16:42");
  for (const value of [
    undefined,
    "",
    "2026-02-29T16:42",
    "2028-02-30T16:42",
    "2028-13-01T10:00",
    "2028-01-00T10:00",
    "2028-01-01T24:00",
    "2028-01-01T10:60",
    "2028-01-01T10:00Z",
    "2101-01-01T10:00",
  ]) {
    assert.equal(parseReminderInput(value), null, String(value));
  }
  assert.equal(toReminderInput(NaN), "");
  assert.equal(formatReminder(null), "No reminder");
  assert.match(formatReminder(expected, "en-US"), /2028/);
});

function inTimezone(timezone, code) {
  const moduleUrl = new URL("../src/reminders.mjs", import.meta.url).href;
  return JSON.parse(
    execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `import { reminderPreset, parseReminderInput, toReminderInput } from ${JSON.stringify(moduleUrl)}; ${code}`,
      ],
      { env: { ...process.env, TZ: timezone }, encoding: "utf8" },
    ),
  );
}

test("tomorrow and next-week presets preserve local 9 AM across daylight saving and year changes", () => {
  const spring = inTimezone("America/New_York", `
    const before = new Date(2026, 2, 7, 23, 30).getTime();
    const next = reminderPreset("tomorrow", before);
    console.log(JSON.stringify({ local: toReminderInput(next), elapsed: next - before, missing: parseReminderInput("2026-03-08T02:30") }));
  `);
  assert.equal(spring.local, "2026-03-08T09:00");
  assert.equal(spring.elapsed, 8.5 * 60 * 60 * 1000);
  assert.equal(spring.missing, null);
  const india = inTimezone("Asia/Kolkata", `
    const before = new Date(2026, 11, 31, 23, 30).getTime();
    console.log(JSON.stringify({ tomorrow: toReminderInput(reminderPreset("tomorrow", before)), week: toReminderInput(reminderPreset("week", before)), hour: toReminderInput(reminderPreset("hour", before + 1234)) }));
  `);
  assert.equal(india.tomorrow, "2027-01-01T09:00");
  assert.equal(india.week, "2027-01-07T09:00");
  assert.equal(india.hour, "2027-01-01T00:31");
});
