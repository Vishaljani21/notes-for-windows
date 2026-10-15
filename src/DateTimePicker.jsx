import React, {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock3,
  X,
} from "lucide-react";
import { parseReminderInput } from "./reminders.mjs";
import "./date-time-picker.css";

const pad = (value) => String(value).padStart(2, "0");
const dayKey = (date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const dayDate = (date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
const sameDay = (left, right) => dayKey(left) === dayKey(right);
const fullDay = (date) =>
  new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
const monthName = (date) =>
  new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(
    date,
  );
const inBounds = (date) =>
  date.getFullYear() >= 1970 && date.getFullYear() <= 2099;
const supportsPopover =
  typeof HTMLElement !== "undefined" &&
  typeof HTMLElement.prototype.showPopover === "function";
const monthOffset = (date, offset) => {
  const month = new Date(date.getFullYear(), date.getMonth() + offset, 1, 12);
  month.setDate(
    Math.min(
      date.getDate(),
      new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate(),
    ),
  );
  return month;
};

function NumberField({ label, value, min, max, onChange }) {
  const id = useId();
  const normalized = () => Math.max(min, Math.min(max, Number(value) || min));
  const step = (amount) =>
    onChange(
      String(
        min + ((normalized() - min + amount + max - min + 1) % (max - min + 1)),
      ),
    );
  return (
    <div className="date-time-number-field">
      <label htmlFor={id}>{label}</label>
      <div className="date-time-number-control">
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          step="1"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={() => onChange(pad(normalized()))}
        />
        <div className="date-time-number-steps">
          <button
            type="button"
            aria-label={`Increase ${label.toLowerCase()}`}
            onClick={() => step(1)}
          >
            <ChevronUp size={12} />
          </button>
          <button
            type="button"
            aria-label={`Decrease ${label.toLowerCase()}`}
            onClick={() => step(-1)}
          >
            <ChevronDown size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DateTimePicker({
  id,
  value,
  onChange,
  disabled,
  min,
  max,
  invalid,
  describedBy,
}) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(() => dayDate(new Date()));
  const [view, setView] = useState(() => dayDate(new Date()));
  const [focused, setFocused] = useState(() => dayDate(new Date()));
  const [hour, setHour] = useState("09");
  const [minute, setMinute] = useState("00");
  const [period, setPeriod] = useState("AM");
  const [position, setPosition] = useState({ left: 12, top: 12, width: 360 });
  const trigger = useRef(null);
  const input = useRef(null);
  const popover = useRef(null);
  const returnFocus = useRef(null);
  const focusDateAfterRender = useRef(false);
  const popoverId = useId();
  const monthId = useId();

  function show(from) {
    if (disabled) return;
    const timestamp = parseReminderInput(value);
    const selected = timestamp
      ? new Date(timestamp)
      : new Date(Date.now() + 3600000);
    const selectedDay = dayDate(selected);
    setDate(selectedDay);
    setView(selectedDay);
    setFocused(selectedDay);
    setHour(pad(selected.getHours() % 12 || 12));
    setMinute(pad(selected.getMinutes()));
    setPeriod(selected.getHours() >= 12 ? "PM" : "AM");
    returnFocus.current = from;
    focusDateAfterRender.current = true;
    setOpen(true);
  }
  function dismiss(restore = true) {
    setOpen(false);
    if (restore) requestAnimationFrame(() => returnFocus.current?.focus());
  }
  function apply() {
    const hours =
      (Math.max(1, Math.min(12, Number(hour) || 1)) % 12) +
      (period === "PM" ? 12 : 0);
    const minutes = Math.max(0, Math.min(59, Number(minute) || 0));
    onChange(`${dayKey(date)}T${pad(hours)}:${pad(minutes)}`);
    dismiss();
  }
  function selectDay(next) {
    focusDateAfterRender.current = true;
    setDate(next);
    setFocused(next);
    setView(next);
  }
  function moveMonth(amount) {
    const next = monthOffset(view, amount);
    if (!inBounds(next)) return;
    setView(next);
    setFocused(next);
  }
  function gridKey(event, current) {
    let next;
    if (event.key === "ArrowLeft")
      next = new Date(
        current.getFullYear(),
        current.getMonth(),
        current.getDate() - 1,
        12,
      );
    if (event.key === "ArrowRight")
      next = new Date(
        current.getFullYear(),
        current.getMonth(),
        current.getDate() + 1,
        12,
      );
    if (event.key === "ArrowUp")
      next = new Date(
        current.getFullYear(),
        current.getMonth(),
        current.getDate() - 7,
        12,
      );
    if (event.key === "ArrowDown")
      next = new Date(
        current.getFullYear(),
        current.getMonth(),
        current.getDate() + 7,
        12,
      );
    if (event.key === "Home")
      next = new Date(
        current.getFullYear(),
        current.getMonth(),
        current.getDate() - current.getDay(),
        12,
      );
    if (event.key === "End")
      next = new Date(
        current.getFullYear(),
        current.getMonth(),
        current.getDate() + 6 - current.getDay(),
        12,
      );
    if (event.key === "PageUp")
      next = monthOffset(current, event.shiftKey ? -12 : -1);
    if (event.key === "PageDown")
      next = monthOffset(current, event.shiftKey ? 12 : 1);
    if (!next) return;
    event.preventDefault();
    event.stopPropagation();
    if (!inBounds(next)) return;
    focusDateAfterRender.current = true;
    setView(next);
    setFocused(next);
  }
  function popoverKey(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      dismiss();
    }
    if (event.key === "Tab") {
      const controls = [
        ...popover.current.querySelectorAll(
          'button:not(:disabled):not([tabindex="-1"]), input:not(:disabled)',
        ),
      ].filter((element) => element.offsetParent !== null);
      const first = controls[0],
        last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
  }
  useLayoutEffect(() => {
    if (!open) return;
    const element = popover.current;
    if (supportsPopover && !element.matches(":popover-open"))
      element.showPopover();
    function place() {
      const anchor = input.current.getBoundingClientRect();
      const scale =
        Number.parseFloat(
          getComputedStyle(input.current).getPropertyValue("--ui-scale"),
        ) || 1;
      const width = Math.min(360 * scale, window.innerWidth - 24);
      const height = Math.min(
        popover.current?.getBoundingClientRect().height || 550,
        window.innerHeight - 24,
      );
      const below = anchor.bottom + 8;
      const top =
        below + height <= window.innerHeight - 12
          ? below
          : Math.max(12, anchor.top - height - 8);
      setPosition({
        width,
        left: Math.max(
          12,
          Math.min(anchor.left, window.innerWidth - width - 12),
        ),
        top,
      });
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      if (supportsPopover && element.matches(":popover-open"))
        element.hidePopover();
    };
  }, [open]);
  useLayoutEffect(() => {
    if (!open || !focusDateAfterRender.current) return;
    focusDateAfterRender.current = false;
    const frame = requestAnimationFrame(() =>
      popover.current
        ?.querySelector('[data-focused-date="true"]')
        ?.focus({ preventScroll: true }),
    );
    return () => cancelAnimationFrame(frame);
  }, [open, focused]);
  useEffect(() => {
    if (!open) return;
    const outside = (event) => {
      if (
        !popover.current?.contains(event.target) &&
        !trigger.current?.contains(event.target)
      )
        dismiss(false);
    };
    document.addEventListener("pointerdown", outside, true);
    return () => document.removeEventListener("pointerdown", outside, true);
  }, [open]);

  const first = new Date(view.getFullYear(), view.getMonth(), 1, 12);
  const start = new Date(
    first.getFullYear(),
    first.getMonth(),
    1 - first.getDay(),
    12,
  );
  const days = Array.from(
    { length: 42 },
    (_, index) =>
      new Date(
        start.getFullYear(),
        start.getMonth(),
        start.getDate() + index,
        12,
      ),
  );
  const weekdays = Array.from({ length: 7 }, (_, index) =>
    new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(
      new Date(2023, 0, 1 + index),
    ),
  );
  const today = dayDate(new Date());
  const portalTarget =
    trigger.current?.closest('[role="dialog"]') || document.body;

  return (
    <>
      <div className="date-time-input-wrap">
        <input
          ref={input}
          id={id}
          type="datetime-local"
          value={value}
          min={min}
          max={max}
          step="60"
          required
          disabled={disabled}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          onChange={(event) => {
            if (open) dismiss(false);
            onChange(event.target.value);
          }}
          onKeyDown={(event) => {
            if (
              (event.altKey && event.key === "ArrowDown") ||
              event.key === "F4"
            ) {
              event.preventDefault();
              event.stopPropagation();
              show(input.current);
            }
          }}
        />
        <button
          ref={trigger}
          type="button"
          className="date-time-calendar-trigger"
          aria-label="Choose date and time"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? popoverId : undefined}
          disabled={disabled}
          onClick={() => (open ? dismiss() : show(trigger.current))}
        >
          <CalendarDays size={18} aria-hidden="true" />
        </button>
      </div>
      {open &&
        createPortal(
          <div
            ref={popover}
            id={popoverId}
            className="date-time-popover"
            role="dialog"
            aria-modal="true"
            aria-label="Choose date and time"
            popover={supportsPopover ? "manual" : undefined}
            style={{ ...position, maxHeight: "calc(100dvh - 24px)" }}
            onKeyDown={popoverKey}
          >
            <header className="date-time-popover-header">
              <CalendarDays size={18} aria-hidden="true" />
              <h3>Choose date and time</h3>
              <button
                type="button"
                className="date-time-icon-button"
                aria-label="Close date picker"
                onClick={() => dismiss()}
              >
                <X size={17} />
              </button>
            </header>
            <div className="date-time-popover-content">
              <div className="date-time-month-navigation">
                <h4 id={monthId} aria-live="polite">
                  {monthName(view)}
                </h4>
                <div className="date-time-month-buttons">
                  <button
                    type="button"
                    className="date-time-today"
                    onClick={() => {
                      selectDay(today);
                      focusDateAfterRender.current = true;
                    }}
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    className="date-time-icon-button"
                    aria-label="Previous month"
                    disabled={!inBounds(monthOffset(view, -1))}
                    onClick={() => moveMonth(-1)}
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <button
                    type="button"
                    className="date-time-icon-button"
                    aria-label="Next month"
                    disabled={!inBounds(monthOffset(view, 1))}
                    onClick={() => moveMonth(1)}
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
              </div>
              <div
                className="date-time-grid"
                role="grid"
                aria-labelledby={monthId}
              >
                <div className="date-time-week date-time-weekdays" role="row">
                  {weekdays.map((name, index) => (
                    <span role="columnheader" key={index}>
                      {name}
                    </span>
                  ))}
                </div>
                {Array.from({ length: 6 }, (_, week) => (
                  <div className="date-time-week" role="row" key={week}>
                    {days.slice(week * 7, week * 7 + 7).map((day) => (
                      <button
                        type="button"
                        role="gridcell"
                        key={dayKey(day)}
                        className={`date-time-day ${day.getMonth() !== view.getMonth() ? "outside-month" : ""}`}
                        aria-label={fullDay(day)}
                        aria-selected={sameDay(day, date)}
                        aria-current={sameDay(day, today) ? "date" : undefined}
                        data-focused-date={
                          sameDay(day, focused) ? "true" : undefined
                        }
                        tabIndex={sameDay(day, focused) ? 0 : -1}
                        disabled={!inBounds(day)}
                        onClick={() => selectDay(day)}
                        onKeyDown={(event) => gridKey(event, day)}
                      >
                        {day.getDate()}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
              <div className="date-time-time-section">
                <div className="date-time-time-heading">
                  <Clock3 size={14} aria-hidden="true" />
                  <span>Local time</span>
                </div>
                <div className="date-time-time-controls">
                  <NumberField
                    label="Hour"
                    value={hour}
                    min={1}
                    max={12}
                    onChange={setHour}
                  />
                  <span className="date-time-separator" aria-hidden="true">
                    :
                  </span>
                  <NumberField
                    label="Minute"
                    value={minute}
                    min={0}
                    max={59}
                    onChange={setMinute}
                  />
                  <div
                    className="date-time-period"
                    role="group"
                    aria-label="Time of day"
                  >
                    {["AM", "PM"].map((item) => (
                      <button
                        type="button"
                        key={item}
                        aria-pressed={period === item}
                        onClick={() => setPeriod(item)}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <p className="date-time-selection">
                {new Intl.DateTimeFormat(undefined, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                }).format(date)}{" "}
                · {pad(Math.max(1, Math.min(12, Number(hour) || 1)))}:
                {pad(Math.max(0, Math.min(59, Number(minute) || 0)))} {period}
              </p>
            </div>
            <footer className="date-time-popover-footer">
              <button
                type="button"
                className="button"
                onClick={() => dismiss()}
              >
                Cancel
              </button>
              <button type="button" className="button primary" onClick={apply}>
                Apply date and time
              </button>
            </footer>
          </div>,
          portalTarget,
        )}
    </>
  );
}
