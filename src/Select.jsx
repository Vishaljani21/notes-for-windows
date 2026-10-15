import React, {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import "./select.css";

const supportsPopover =
  typeof HTMLElement !== "undefined" &&
  typeof HTMLElement.prototype.showPopover === "function";

export default function Select({
  id,
  label,
  value,
  onChange,
  options,
  disabled = false,
}) {
  const generatedId = useId();
  const controlId = id || generatedId;
  const listId = `${controlId}-options`;
  const trigger = useRef(null);
  const popup = useRef(null);
  const typeahead = useRef({ text: "", time: 0, origin: -1 });
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [geometry, setGeometry] = useState({
    left: 0,
    top: 0,
    width: 180,
    maxHeight: 300,
  });
  const selected = options.findIndex(
    (option) => String(option.value) === String(value),
  );
  const enabled = options
    .map((option, index) => (option.disabled ? -1 : index))
    .filter((index) => index >= 0);
  const portal = trigger.current?.closest('[role="dialog"]') || document.body;

  const close = () => {
    typeahead.current.text = "";
    setOpen(false);
  };
  const reveal = (index = selected >= 0 ? selected : enabled[0]) => {
    if (disabled || !enabled.length) return;
    setActive(options[index]?.disabled ? enabled[0] : index);
    setOpen(true);
  };
  const choose = (index) => {
    if (!options[index] || options[index].disabled || disabled) return;
    onChange(options[index].value);
    close();
    trigger.current?.focus({ preventScroll: true });
  };

  const updateGeometry = () => {
    if (!trigger.current || !popup.current) return;
    const element = popup.current;
    const anchor = trigger.current.getBoundingClientRect();
    let visibleTop = 0;
    let visibleBottom = window.innerHeight;
    for (
      let parent = trigger.current.parentElement;
      parent;
      parent = parent.parentElement
    ) {
      if (/auto|scroll/.test(getComputedStyle(parent).overflowY)) {
        const bounds = parent.getBoundingClientRect();
        visibleTop = Math.max(visibleTop, bounds.top);
        visibleBottom = Math.min(visibleBottom, bounds.bottom);
      }
    }
    if (anchor.bottom <= visibleTop || anchor.top >= visibleBottom) {
      close();
      return;
    }
    const margin = 8;
    const gap = 5;
    const below = window.innerHeight - anchor.bottom - margin - gap;
    const above = anchor.top - margin - gap;
    const placeAbove = below < 180 && above > below;
    const maxHeight = Math.max(
      64,
      Math.min(
        320,
        placeAbove ? above : below,
        window.innerHeight - margin * 2,
      ),
    );
    const height = Math.min(element.scrollHeight, maxHeight);
    const width = Math.min(
      Math.max(anchor.width, 180),
      window.innerWidth - margin * 2,
    );
    setGeometry({
      left: Math.max(
        margin,
        Math.min(anchor.left, window.innerWidth - width - margin),
      ),
      top: Math.max(
        margin,
        Math.min(
          placeAbove ? anchor.top - gap - height : anchor.bottom + gap,
          window.innerHeight - height - margin,
        ),
      ),
      width,
      maxHeight,
    });
  };

  useLayoutEffect(() => {
    if (!open || !trigger.current || !popup.current) return;
    const element = popup.current;
    if (supportsPopover && !element.matches(":popover-open"))
      element.showPopover();
    updateGeometry();
    return () => {
      if (supportsPopover && element.matches(":popover-open"))
        element.hidePopover();
    };
  }, [open, options.length]);

  useLayoutEffect(() => {
    if (!open || active < 0) return;
    const element = popup.current;
    const option = element?.querySelector(`[data-option-index="${active}"]`);
    if (!element || !option) return;
    const bounds = element.getBoundingClientRect();
    const optionBounds = option.getBoundingClientRect();
    if (optionBounds.top < bounds.top + 5)
      element.scrollTop -= bounds.top + 5 - optionBounds.top;
    else if (optionBounds.bottom > bounds.bottom - 5)
      element.scrollTop += optionBounds.bottom - bounds.bottom + 5;
  }, [open, active, geometry.top, geometry.maxHeight]);

  useEffect(() => {
    if (!open) return;
    const outside = (event) => {
      if (
        !popup.current?.contains(event.target) &&
        !trigger.current?.contains(event.target)
      )
        close();
    };
    const scroll = (event) => {
      if (!popup.current?.contains(event.target)) updateGeometry();
    };
    const focus = (event) => {
      if (
        event.target !== trigger.current &&
        !popup.current?.contains(event.target)
      )
        close();
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("scroll", scroll, true);
    document.addEventListener("focusin", focus);
    window.addEventListener("resize", updateGeometry);
    window.addEventListener("blur", close);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("scroll", scroll, true);
      document.removeEventListener("focusin", focus);
      window.removeEventListener("resize", updateGeometry);
      window.removeEventListener("blur", close);
    };
  }, [open]);

  useEffect(() => {
    if (disabled) close();
  }, [disabled]);

  const keyboard = (event) => {
    if (disabled) return;
    if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === "Tab") {
      close();
    } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      typeahead.current.text = "";
      if (event.key === "Home") reveal(enabled[0]);
      else if (event.key === "End") reveal(enabled.at(-1));
      else if (!open) reveal();
      else {
        const current = enabled.indexOf(active);
        setActive(
          enabled[
            (current + (event.key === "ArrowDown" ? 1 : -1) + enabled.length) %
              enabled.length
          ],
        );
      }
    } else if (
      event.key === "Enter" ||
      (event.key === " " &&
        (!typeahead.current.text || Date.now() - typeahead.current.time >= 650))
    ) {
      event.preventDefault();
      event.stopPropagation();
      if (open) choose(active);
      else reveal();
    } else if (
      event.key.length === 1 &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      event.preventDefault();
      const now = Date.now();
      const previous =
        now - typeahead.current.time < 650 ? typeahead.current.text : "";
      const text = `${previous}${event.key.toLowerCase()}`;
      const current = open ? active : selected;
      const origin = previous ? typeahead.current.origin : current;
      typeahead.current = { text, time: now, origin };
      const repeat = [...text].every((character) => character === text[0]);
      const query = repeat ? text[0] : text;
      const start = repeat ? current : origin;
      const search = [
        ...enabled.filter((index) => index > start),
        ...enabled.filter((index) => index <= start),
      ];
      const match = search.find((index) =>
        options[index].label.toLowerCase().startsWith(query),
      );
      if (match !== undefined) reveal(match);
    }
  };

  const groups = [];
  options.forEach((option, index) => {
    const group = groups.at(-1);
    if (group && group.label === option.group)
      group.options.push({ ...option, index });
    else groups.push({ label: option.group, options: [{ ...option, index }] });
  });
  return (
    <div className="notes-select">
      <button
        type="button"
        ref={trigger}
        id={controlId}
        className="notes-select-trigger"
        role="combobox"
        aria-label={label}
        aria-haspopup="listbox"
        aria-controls={open ? listId : undefined}
        aria-expanded={open}
        aria-activedescendant={
          open && active >= 0 ? `${listId}-${active}` : undefined
        }
        data-value={value}
        disabled={disabled}
        onClick={() => (open ? close() : reveal())}
        onKeyDown={keyboard}
      >
        <span>{options[selected]?.label || "Choose an option"}</span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {open &&
        createPortal(
          <div
            ref={popup}
            id={listId}
            className="notes-select-popup"
            role="listbox"
            aria-label={label}
            popover={supportsPopover ? "manual" : undefined}
            style={geometry}
            onMouseDown={(event) => event.preventDefault()}
          >
            {groups.map((group, groupIndex) => (
              <div
                key={`${group.label || "ungrouped"}-${groupIndex}`}
                role={group.label ? "group" : "presentation"}
                aria-label={group.label}
              >
                {group.label && (
                  <div className="notes-select-group" aria-hidden="true">
                    {group.label}
                  </div>
                )}
                {group.options.map((option) => (
                  <div
                    key={option.value}
                    id={`${listId}-${option.index}`}
                    role="option"
                    aria-selected={String(option.value) === String(value)}
                    aria-disabled={option.disabled || undefined}
                    data-value={option.value}
                    data-option-index={option.index}
                    className={`notes-select-option${active === option.index ? " is-active" : ""}`}
                    onPointerMove={() => {
                      if (!option.disabled) setActive(option.index);
                    }}
                    onClick={() => choose(option.index)}
                    title={option.label}
                  >
                    <span style={option.style}>{option.label}</span>
                    {String(option.value) === String(value) && (
                      <Check size={15} aria-hidden="true" />
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>,
          portal,
        )}
    </div>
  );
}
