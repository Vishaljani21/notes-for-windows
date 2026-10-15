// Reminder dates use milliseconds since the epoch, never parsed display text.
// The fixed upper bound is shared with the Windows reminder scheduler.
export const MAX_REMINDER_TIME = Date.UTC(2100, 0, 1);

export function isReminderTimestamp(value) {
  return Number.isSafeInteger(value) && value > 0 && value <= MAX_REMINDER_TIME;
}

export function normalizeReminder(note = {}) {
  const reminderAt = isReminderTimestamp(note?.reminderAt)
    ? note.reminderAt
    : null;
  const reminderNotifiedAt =
    reminderAt !== null &&
    isReminderTimestamp(note?.reminderNotifiedAt) &&
    note.reminderNotifiedAt >= reminderAt
      ? note.reminderNotifiedAt
      : null;
  return { reminderAt, reminderNotifiedAt };
}

export function validateReminderTime(timestamp, now = Date.now()) {
  if (!isReminderTimestamp(timestamp))
    return "Choose a valid date and time before 2100.";
  if (timestamp <= now) return "Choose a date and time in the future.";
  return null;
}

const pad = (value) => String(value).padStart(2, "0");

// datetime-local inputs deliberately use the device's local timezone. Using
// toISOString() here would move the selected clock time in non-UTC timezones.
export function toReminderInput(timestamp) {
  if (!isReminderTimestamp(timestamp)) return "";
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function parseReminderInput(value) {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match.map(Number);
  if (
    year < 1970 ||
    year > 2100 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour > 23 ||
    minute > 59
  )
    return null;
  const date = new Date(year, month - 1, day, hour, minute, 0, 0);
  // Date normally normalizes impossible dates and daylight-saving gaps. Reject
  // those changes so the saved reminder matches the clock time the user chose.
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute
  )
    return null;
  return isReminderTimestamp(date.getTime()) ? date.getTime() : null;
}

export function reminderPreset(preset, now = Date.now()) {
  if (!isReminderTimestamp(now)) return null;
  let timestamp;
  if (preset === "hour") {
    timestamp = Math.ceil((now + 60 * 60 * 1000) / 60000) * 60000;
  } else if (preset === "tomorrow" || preset === "week") {
    const date = new Date(now);
    date.setDate(date.getDate() + (preset === "tomorrow" ? 1 : 7));
    date.setHours(9, 0, 0, 0);
    timestamp = date.getTime();
  } else return null;
  return isReminderTimestamp(timestamp) ? timestamp : null;
}

export function formatReminder(timestamp, locale) {
  if (!isReminderTimestamp(timestamp)) return "No reminder";
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(timestamp);
}
