import React, { useId, useState } from "react";
import { Bell, BellOff, CalendarDays, Check, Clock3, Info } from "lucide-react";
import {
  formatReminder,
  normalizeReminder,
  parseReminderInput,
  reminderPreset,
  toReminderInput,
  validateReminderTime,
} from "./reminders.mjs";
import "./reminder-dialog.css";
import DateTimePicker from "./DateTimePicker.jsx";

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
  const selectedTime = parseReminderInput(value);
  const delivered = Boolean(reminder.reminderNotifiedAt);
  const overdue = Boolean(
    reminder.reminderAt && reminder.reminderAt <= Date.now(),
  );

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
      setFeedback(
        "Reminder queued again. It is marked delivered only after an alert appears.",
      );
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
      <header className="reminder-dialog-header">
        <span className="reminder-dialog-icon">
          <Bell size={23} strokeWidth={1.7} aria-hidden="true" />
        </span>
        <div>
          <h2 id="reminder-dialog-title">
            {reminder.reminderAt ? "Edit reminder" : "Remind me"}
          </h2>
          <p>A little nudge for something that matters.</p>
        </div>
      </header>
      <div className="reminder-dialog-content">
        <div className="reminder-note-context">
          <span>For this note</span>
          <strong
            className="reminder-note-name"
            title={note?.title || "Untitled"}
          >
            {note?.title || "Untitled"}
          </strong>
        </div>
        <div className="reminder-section-heading">
          <Clock3 size={16} aria-hidden="true" />
          <h3>Quick times</h3>
        </div>
        <div
          className="reminder-presets"
          role="group"
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
              className={preset === id ? "selected" : ""}
              aria-pressed={preset === id}
              data-reminder-initial={id === "minute" ? "true" : undefined}
              disabled={busy || retrying}
              onClick={() => choosePreset(id)}
            >
              <span>{label}</span>
              {preset === id && <Check size={15} aria-hidden="true" />}
            </button>
          ))}
        </div>
        <div className="reminder-date-card">
          <div className="field-label">
            <label className="date-time-field-label" htmlFor={inputId}>
              <CalendarDays size={16} aria-hidden="true" />
              Date and time
            </label>
            <DateTimePicker
              id={inputId}
              value={value}
              min={toReminderInput(Date.now())}
              max="2099-12-31T23:59"
              disabled={busy || retrying}
              invalid={Boolean(error)}
              describedBy={`${helpId}${error ? ` ${errorId}` : ""}`}
              onChange={(next) => {
                setValue(next);
                setPreset("custom");
                setError("");
              }}
            />
          </div>
          <div className="reminder-selection-preview">
            <Clock3 size={15} aria-hidden="true" />
            <span>
              {selectedTime
                ? formatReminder(selectedTime)
                : "Choose a date and time"}
            </span>
          </div>
          <p className="reminder-timezone" id={helpId}>
            Your local time
            {timezone ? ` · ${timezone.replaceAll("_", " ")}` : ""}.
          </p>
        </div>
        {reminder.reminderAt && (
          <div
            className={`reminder-state-card ${delivered ? "delivered" : overdue ? "overdue" : "scheduled"}`}
          >
            {delivered ? (
              <Check size={18} aria-hidden="true" />
            ) : (
              <Bell size={18} aria-hidden="true" />
            )}
            <div>
              <strong>
                {delivered
                  ? "Reminder delivered"
                  : overdue
                    ? "Reminder overdue"
                    : "Scheduled reminder"}
              </strong>
              <p>
                {delivered
                  ? `Last delivered ${formatReminder(reminder.reminderNotifiedAt)}.`
                  : overdue
                    ? "This reminder is overdue. Choose a new time or remove it."
                    : `Currently set for ${formatReminder(reminder.reminderAt)}.`}
              </p>
            </div>
          </div>
        )}
        {desktop && onRetry && overdue && (
          <div className="reminder-retry">
            <button
              type="button"
              className="button"
              onClick={retry}
              disabled={busy || retrying}
            >
              <Bell size={16} />
              {retrying ? "Showing reminder…" : "Show reminder again"}
            </button>
            <p className="helper">
              Use this if an earlier reminder was missed.
            </p>
          </div>
        )}
        <p className="reminder-help">
          <Info size={16} aria-hidden="true" />
          <span>
            {desktop
              ? remindersInTray
                ? "Reminders stay active in the system tray. If you quit Notes, missed reminders appear next time you open it."
                : "Reminders appear while Notes is running. Turn on system tray reminders in Settings to keep them active after closing the window."
              : "Keep this tab open for in-app reminders. The installed Windows app also supports reminder popups."}
          </span>
        </p>
        {error && (
          <p id={errorId} className="form-error" role="alert">
            {error}
          </p>
        )}
        {deliveryError && (
          <p className="form-error" role="alert">
            {deliveryError}
          </p>
        )}
        {feedback && !deliveryError && (
          <p className="reminder-feedback" role="status">
            {feedback}
          </p>
        )}
      </div>
      <footer className="dialog-actions reminder-dialog-actions">
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
        <button
          type="button"
          className="button"
          onClick={close}
          disabled={busy || retrying}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="button primary"
          disabled={busy || retrying}
        >
          <Bell size={16} /> {busy ? "Saving…" : "Save reminder"}
        </button>
      </footer>
    </form>
  );
}
