import React, { useId, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import {
  formatReminder,
  normalizeReminder,
  parseReminderInput,
  reminderPreset,
  toReminderInput,
  validateReminderTime,
} from "./reminders.mjs";

export default function ReminderDialog({
  note,
  onSave,
  onClear,
  onRetry,
  deliveryError = "",
  close,
  remindersInTray = false,
  desktop = typeof window !== "undefined" && Boolean(window.desktop),
}) {
  const reminder = normalizeReminder(note);
  const [value, setValue] = useState(() =>
    toReminderInput(reminder.reminderAt || reminderPreset("hour")),
  );
  const [preset, setPreset] = useState(reminder.reminderAt ? "custom" : "hour");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [feedback, setFeedback] = useState("");
  const inputId = useId();
  const helpId = useId();
  const errorId = useId();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  function choosePreset(next) {
    setPreset(next);
    setValue(toReminderInput(reminderPreset(next)));
    setError("");
  }

  async function submit(event) {
    event.preventDefault();
    if (busy || retrying) return;
    const reminderAt = parseReminderInput(value);
    const validation = validateReminderTime(reminderAt);
    if (validation) return setError(validation);
    setError("");
    setBusy(true);
    try {
      await onSave({ reminderAt, reminderNotifiedAt: null });
      close();
    } catch (err) {
      setError(err?.message || "The reminder could not be saved. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (busy || retrying) return;
    setBusy(true);
    setError("");
    try {
      await onClear();
      close();
    } catch (err) {
      setError(err?.message || "The reminder could not be removed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function retry() {
    if (busy || retrying || !onRetry) return;
    setRetrying(true);
    setError("");
    setFeedback("");
    try {
      await onRetry();
      setFeedback("Reminder queued again. It is marked delivered only after an alert appears.");
    } catch (err) {
      setError(err?.message || "The reminder could not be shown. Try again.");
    } finally {
      setRetrying(false);
    }
  }

  return (
    <form
      className="standard-dialog reminder-dialog"
      onSubmit={submit}
      noValidate
    >
      <div className="dialog-icon">
        <Bell size={26} />
      </div>
      <h2>{reminder.reminderAt ? "Edit reminder" : "Remind me"}</h2>
      <p className="dialog-description reminder-note-name">
        {note?.title || "Untitled"}
      </p>
      <div
        className="button-row reminder-presets"
        aria-label="Quick reminder times"
      >
        {[
          ["minute", "In 1 minute"],
          ["hour", "In 1 hour"],
          ["tomorrow", "Tomorrow, 9 AM"],
          ["week", "In a week, 9 AM"],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`button ${preset === id ? "primary" : ""}`}
            aria-pressed={preset === id}
            disabled={busy || retrying}
            onClick={() => choosePreset(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <label className="field-label" htmlFor={inputId}>
        Date and time
        <input
          id={inputId}
          type="datetime-local"
          value={value}
          min={toReminderInput(Date.now())}
          max="2099-12-31T23:59"
          step="60"
          required
          disabled={busy || retrying}
          aria-invalid={Boolean(error)}
          aria-describedby={`${helpId}${error ? ` ${errorId}` : ""}`}
          onChange={(event) => {
            setValue(event.target.value);
            setPreset("custom");
            setError("");
          }}
        />
      </label>
      <p className="reminder-timezone" id={helpId}>
        Your local time{timezone ? ` · ${timezone.replaceAll("_", " ")}` : ""}.
      </p>
      {reminder.reminderAt && (
        <p className="reminder-status">
          {reminder.reminderNotifiedAt
            ? `Last delivered ${formatReminder(reminder.reminderNotifiedAt)}.`
            : reminder.reminderAt <= Date.now()
              ? "This reminder is overdue. Choose a new time or remove it."
              : `Currently set for ${formatReminder(reminder.reminderAt)}.`}
        </p>
      )}
      {desktop && onRetry && reminder.reminderAt && reminder.reminderAt <= Date.now() && (
        <div className="reminder-retry">
          <button type="button" className="button" onClick={retry} disabled={busy || retrying}>
            <Bell size={16} /> {retrying ? "Showing reminder…" : "Show reminder again"}
          </button>
          <p className="helper">Use this if an earlier reminder was missed.</p>
        </div>
      )}
      <p className="dialog-description reminder-help">
        {desktop
          ? remindersInTray
            ? "Notes keeps running in the system tray when you close its window, so reminder popups can still appear. After you quit Notes, overdue reminders appear when you open it again."
            : "Notes shows reminder popups while it is running. To receive them after closing the window, turn on background reminders in Settings. After you quit Notes, overdue reminders appear when you open it again."
          : "Keep this tab open for in-app reminders. The installed Windows app also supports reminder popups."}
      </p>
      {error && (
        <p id={errorId} className="form-error" role="alert">
          {error}
        </p>
      )}
      {deliveryError && <p className="form-error" role="alert">{deliveryError}</p>}
      {feedback && !deliveryError && <p className="helper" role="status">{feedback}</p>}
      <div className="dialog-actions">
        {reminder.reminderAt && (
          <button
            type="button"
            className="button danger"
            onClick={remove}
            disabled={busy || retrying}
          >
            <BellOff size={16} /> Remove reminder
          </button>
        )}
        <button type="button" className="button" onClick={close} disabled={busy || retrying}>
          Cancel
        </button>
        <button type="submit" className="button primary" disabled={busy || retrying}>
          <Bell size={16} /> {busy ? "Saving…" : "Save reminder"}
        </button>
      </div>
    </form>
  );
}
