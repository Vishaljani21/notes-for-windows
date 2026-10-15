import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronRight } from "lucide-react";
import "./context-menu.css";

const enabledItems = (element) =>
  [...element.querySelectorAll(":scope > [role^='menuitem']")].filter(
    (item) => item.getAttribute("aria-disabled") !== "true",
  );

function MenuPanel({
  items,
  level,
  label,
  anchor,
  path,
  openSubmenu,
  closeSubmenu,
  select,
  rootRef,
  focusRequested,
}) {
  const panel = useRef(null);
  const [position, setPosition] = useState({ left: anchor.x, top: anchor.y });
  useLayoutEffect(() => {
    const element = panel.current;
    const margin = 8;
    const bounds = element.getBoundingClientRect();
    const maxLeft = Math.max(margin, window.innerWidth - bounds.width - margin);
    const left = anchor.parent
      ? anchor.parent.right + bounds.width + margin <= window.innerWidth
        ? anchor.parent.right + 3
        : Math.max(margin, anchor.parent.left - bounds.width - 3)
      : Math.min(Math.max(margin, anchor.x), maxLeft);
    const top = Math.min(
      Math.max(margin, anchor.parent?.top ?? anchor.y),
      Math.max(margin, window.innerHeight - bounds.height - margin),
    );
    setPosition({ left, top });
    if (focusRequested)
      enabledItems(element)[0]?.focus({ preventScroll: true });
  }, [
    anchor.x,
    anchor.y,
    anchor.parent?.top,
    anchor.parent?.left,
    focusRequested,
  ]);

  const keyDown = (event) => {
    const choices = enabledItems(panel.current);
    const current = choices.indexOf(document.activeElement);
    const movement = { ArrowDown: 1, ArrowUp: -1 }[event.key];
    if (movement || event.key === "Home" || event.key === "End") {
      event.preventDefault();
      event.stopPropagation();
      const index =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? choices.length - 1
            : (current + movement + choices.length) % choices.length;
      choices[index]?.focus({ preventScroll: true });
    } else if (event.key === "ArrowRight") {
      const itemIndex = Number(document.activeElement?.dataset.menuIndex);
      if (items[itemIndex]?.items?.length) {
        event.preventDefault();
        event.stopPropagation();
        openSubmenu(level, itemIndex, document.activeElement, true);
      }
    } else if (event.key === "ArrowLeft" && level > 0) {
      event.preventDefault();
      event.stopPropagation();
      closeSubmenu(level);
    } else if (event.key === "Tab") {
      event.preventDefault();
      rootRef.current?.dispatchEvent(new CustomEvent("context-menu-dismiss"));
    }
  };
  return (
    <div
      ref={panel}
      className="notes-context-menu"
      role="menu"
      aria-label={label}
      style={position}
      onKeyDown={keyDown}
    >
      {items.map((item, index) => {
        if (item.separator)
          return (
            <div
              key={`separator-${index}`}
              role="separator"
              className="notes-context-separator"
            />
          );
        const Icon = item.icon;
        const hasChildren = !!item.items?.length;
        return (
          <button
            key={`${item.label}-${index}`}
            type="button"
            role={
              typeof item.checked === "boolean"
                ? "menuitemcheckbox"
                : "menuitem"
            }
            aria-checked={
              typeof item.checked === "boolean" ? item.checked : undefined
            }
            aria-disabled={item.disabled || undefined}
            aria-haspopup={hasChildren ? "menu" : undefined}
            aria-expanded={
              hasChildren ? path[level]?.index === index : undefined
            }
            data-menu-index={index}
            tabIndex={-1}
            className={`notes-context-item${item.danger ? " is-danger" : ""}`}
            onPointerEnter={(event) => {
              if (!item.disabled)
                openSubmenu(
                  level,
                  hasChildren ? index : null,
                  event.currentTarget,
                  false,
                );
            }}
            onClick={(event) => {
              if (item.disabled) return;
              if (hasChildren)
                openSubmenu(level, index, event.currentTarget, true);
              else select(item);
            }}
          >
            <span className="notes-context-icon" aria-hidden="true">
              {Icon && <Icon size={16} />}
            </span>
            <span className="notes-context-label">{item.label}</span>
            {item.shortcut && (
              <span className="notes-context-shortcut" aria-hidden="true">
                {item.shortcut}
              </span>
            )}
            {item.checked && (
              <Check
                size={15}
                aria-hidden="true"
                className="notes-context-check"
              />
            )}
            {hasChildren && <ChevronRight size={15} aria-hidden="true" />}
          </button>
        );
      })}
    </div>
  );
}

export default function ContextMenu({
  position,
  label = "Actions",
  items,
  onClose,
}) {
  const root = useRef(null);
  const trigger = useRef(document.activeElement);
  const restoreFocus = useRef(true);
  const closeHandler = useRef(onClose);
  closeHandler.current = onClose;
  const [path, setPath] = useState([]);
  const appStyle = document.querySelector(".app")?.style;
  const preferences = {
    "--font-ui": appStyle?.getPropertyValue("--font-ui") || undefined,
    "--ui-scale": appStyle?.getPropertyValue("--ui-scale") || undefined,
  };
  useEffect(() => {
    const close = (restore) => {
      restoreFocus.current = restore;
      closeHandler.current();
    };
    const pointer = (event) => {
      if (!root.current?.contains(event.target)) close(false);
    };
    const keyboard = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close(true);
      }
    };
    const changed = (event) => {
      if (!root.current?.contains(event.target)) close(false);
    };
    const dismiss = () => close(true);
    const menuRoot = root.current;
    document.addEventListener("pointerdown", pointer, true);
    document.addEventListener("focusin", pointer, true);
    document.addEventListener("keydown", keyboard, true);
    document.addEventListener("scroll", changed, true);
    window.addEventListener("resize", changed);
    window.addEventListener("blur", changed);
    menuRoot?.addEventListener("context-menu-dismiss", dismiss);
    return () => {
      document.removeEventListener("pointerdown", pointer, true);
      document.removeEventListener("focusin", pointer, true);
      document.removeEventListener("keydown", keyboard, true);
      document.removeEventListener("scroll", changed, true);
      window.removeEventListener("resize", changed);
      window.removeEventListener("blur", changed);
      menuRoot?.removeEventListener("context-menu-dismiss", dismiss);
      if (
        restoreFocus.current &&
        trigger.current?.isConnected &&
        (menuRoot?.contains(document.activeElement) ||
          document.activeElement === document.body)
      )
        trigger.current.focus({ preventScroll: true });
    };
  }, []);
  const openSubmenu = (level, index, element, focus) => {
    setPath((previous) => {
      if (index === null) return previous.slice(0, level);
      if (previous[level]?.index === index && (!focus || previous[level].focus))
        return previous;
      return [
        ...previous.slice(0, level),
        { index, parent: element.getBoundingClientRect(), element, focus },
      ];
    });
  };
  const closeSubmenu = (level) => {
    path[level - 1]?.element?.focus({ preventScroll: true });
    setPath((previous) => previous.slice(0, level - 1));
  };
  const panels = [{ items, label, anchor: position, focus: true }];
  for (let level = 0; level < path.length; level += 1) {
    const item = panels[level]?.items[path[level].index];
    if (!item?.items?.length) break;
    panels.push({
      items: item.items,
      label: item.label,
      anchor: { x: 0, y: 0, parent: path[level].parent },
      focus: path[level].focus,
    });
  }
  return createPortal(
    <div
      className="notes-context-root"
      ref={root}
      style={preferences}
      onContextMenu={(event) => event.preventDefault()}
    >
      {panels.map((panel, level) => (
        <MenuPanel
          key={level}
          {...panel}
          level={level}
          path={path}
          openSubmenu={openSubmenu}
          closeSubmenu={closeSubmenu}
          rootRef={root}
          focusRequested={panel.focus}
          select={(item) => {
            restoreFocus.current = true;
            onClose();
            item.onSelect?.();
          }}
        />
      ))}
    </div>,
    document.body,
  );
}
