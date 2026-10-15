import React, { useEffect, useRef, useState } from "react";
import {
  Settings,
  Sun,
  Moon,
  Monitor,
  Type,
  Bell,
  Database,
  Check,
  Download,
  Upload,
  NotebookPen,
  ShieldCheck,
  LoaderCircle,
  Info,
} from "lucide-react";
import FontPicker from "./FontPicker.jsx";
import Select from "./Select.jsx";
import { FONTS } from "./fonts.mjs";
import { ACCENTS, DEFAULT_ACCENT, getAccentVariables } from "./accents.mjs";
import { version as appVersion } from "../package.json";
import "./settings.css";

const sections = [
  { id: "appearance", label: "Appearance", icon: Sun },
  { id: "fonts", label: "Fonts & writing", icon: Type },
  { id: "reminders", label: "Reminders", icon: Bell },
  { id: "data", label: "Data & backup", icon: Database },
];

function PanelHeading({ title, children }) {
  return (
    <div className="settings-panel-heading">
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}

export default function SettingsDialog({
  settings,
  setSettings,
  saveStatus,
  close,
  exportBackup,
  backupInput,
  reminderError,
  clearReminderError,
}) {
  const [active, setActive] = useState("appearance");
  const selectedAccent =
    ACCENTS.find((accent) => accent.id === settings.accentColor) || ACCENTS[0];
  const [accentGroup, setAccentGroup] = useState(selectedAccent.group);
  const accentChoices = ACCENTS.filter(
    (accent) => accent.group === accentGroup,
  );
  const swatches = useRef([]);
  useEffect(() => {
    setAccentGroup(selectedAccent.group);
  }, [selectedAccent.id]);
  const [compact, setCompact] = useState(
    () => matchMedia("(max-width: 760px)").matches,
  );
  const [reminderTest, setReminderTest] = useState({
    status: "idle",
    message: "",
  });
  const tabs = useRef([]);
  const content = useRef(null);
  useEffect(() => {
    const query = matchMedia("(max-width: 760px)");
    const update = () => setCompact(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    content.current?.scrollTo(0, 0);
  }, [active]);

  function navigate(event, index) {
    let next;
    if (["ArrowDown", "ArrowRight"].includes(event.key))
      next = (index + 1) % sections.length;
    if (["ArrowUp", "ArrowLeft"].includes(event.key))
      next = (index + sections.length - 1) % sections.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = sections.length - 1;
    if (next === undefined) return;
    event.preventDefault();
    setActive(sections[next].id);
    tabs.current[next]?.focus();
    tabs.current[next]?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  async function testReminderAlert() {
    if (reminderTest.status === "pending") return;
    setReminderTest({
      status: "pending",
      message: "Waiting for the test alert…",
    });
    try {
      const response = await window.desktop.testReminder();
      if (!response?.ok)
        throw new Error(
          response?.error ||
            "The test alert could not be shown. Please try again.",
        );
      clearReminderError();
      setReminderTest({
        status: "success",
        message:
          response.channel === "windows"
            ? "The test alert was sent through Windows. If you did not see it, check Windows Settings → System → Notifications and Do not disturb."
            : "The test reminder opened in a Notes popup. It stays visible until you dismiss it or open the note.",
      });
    } catch (error) {
      setReminderTest({
        status: "error",
        message:
          error?.message ||
          "The test alert could not be shown. Please try again.",
      });
    }
  }

  return (
    <div className="settings-dialog">
      <header className="settings-header">
        <span className="settings-header-icon">
          <Settings size={22} strokeWidth={1.7} />
        </span>
        <div>
          <h2 id="settings-title">Settings</h2>
          <p>Personalize your workspace.</p>
        </div>
      </header>
      <div className="settings-body">
        <aside className="settings-sidebar">
          <div
            className="settings-navigation"
            role="tablist"
            aria-label="Settings categories"
            aria-orientation={compact ? "horizontal" : "vertical"}
          >
            {sections.map(({ id, label, icon: Icon }, index) => (
              <button
                key={id}
                ref={(element) => {
                  tabs.current[index] = element;
                }}
                type="button"
                role="tab"
                id={`settings-tab-${id}`}
                aria-controls={`settings-panel-${id}`}
                aria-selected={active === id}
                tabIndex={active === id ? 0 : -1}
                data-settings-initial={index === 0 ? "true" : undefined}
                onClick={() => setActive(id)}
                onKeyDown={(event) => navigate(event, index)}
              >
                <Icon size={18} strokeWidth={1.7} aria-hidden="true" />
                <span>{label}</span>
              </button>
            ))}
          </div>
          <div className="settings-app-info">
            <NotebookPen size={22} strokeWidth={1.5} aria-hidden="true" />
            <div>
              <strong>Notes for Windows</strong>
              <span>Version {appVersion}</span>
            </div>
          </div>
        </aside>
        <div className="settings-content" ref={content}>
          <section
            id="settings-panel-appearance"
            className="settings-panel"
            role="tabpanel"
            aria-labelledby="settings-tab-appearance"
            hidden={active !== "appearance"}
          >
            <PanelHeading title="Appearance">
              A comfortable space for your notes.
            </PanelHeading>
            <h4 className="settings-group-title">Color theme</h4>
            <div className="theme-options">
              {[
                [Sun, "light", "Light"],
                [Moon, "dark", "Dark"],
                [Monitor, "system", "System"],
              ].map(([Icon, key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={`theme-${key} ${settings.theme === key ? "selected" : ""}`}
                  aria-pressed={settings.theme === key}
                  onClick={() => setSettings({ theme: key })}
                >
                  <span className="theme-miniature" aria-hidden="true">
                    <span className="theme-mini-sidebar">
                      <i />
                      <i />
                      <i />
                    </span>
                    <span className="theme-mini-list">
                      <i />
                      <i />
                    </span>
                    <span className="theme-mini-note">
                      <i />
                      <i />
                      <i />
                    </span>
                  </span>
                  <span className="theme-caption">
                    <Icon size={16} aria-hidden="true" />
                    {label}
                    {settings.theme === key && (
                      <Check size={15} aria-hidden="true" />
                    )}
                  </span>
                </button>
              ))}
            </div>
            <p className="settings-hint">
              System follows your Windows light or dark appearance.
            </p>
            <div className="settings-accent-picker settings-card">
              <div className="settings-accent-heading">
                <div>
                  <h4>Accent color</h4>
                  <p>{selectedAccent.label}</p>
                </div>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setSettings({ accentColor: DEFAULT_ACCENT })}
                >
                  Reset accent
                </button>
              </div>
              <div
                className="accent-groups"
                role="group"
                aria-label="Accent palette"
              >
                {[
                  ["Classic", "Normal colors"],
                  ["Neon", "Neon colors"],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={accentGroup === id}
                    onClick={() => setAccentGroup(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div
                className="accent-swatches"
                role="radiogroup"
                aria-label="Accent color"
              >
                {accentChoices.map((accent, index) => (
                  <button
                    key={accent.id}
                    ref={(element) => {
                      swatches.current[index] = element;
                    }}
                    type="button"
                    role="radio"
                    aria-label={accent.label}
                    aria-checked={selectedAccent.id === accent.id}
                    tabIndex={
                      selectedAccent.id === accent.id ||
                      (!accentChoices.some(
                        (item) => item.id === selectedAccent.id,
                      ) &&
                        index === 0)
                        ? 0
                        : -1
                    }
                    onClick={() => setSettings({ accentColor: accent.id })}
                    onKeyDown={(event) => {
                      const direction = ["ArrowRight", "ArrowDown"].includes(
                        event.key,
                      )
                        ? 1
                        : ["ArrowLeft", "ArrowUp"].includes(event.key)
                          ? -1
                          : 0;
                      if (
                        !direction &&
                        event.key !== "Home" &&
                        event.key !== "End"
                      )
                        return;
                      event.preventDefault();
                      const next =
                        event.key === "Home"
                          ? 0
                          : event.key === "End"
                            ? accentChoices.length - 1
                            : (index + direction + accentChoices.length) %
                              accentChoices.length;
                      setSettings({ accentColor: accentChoices[next].id });
                      swatches.current[next]?.focus();
                    }}
                    style={{
                      "--swatch-color": accent.color,
                      "--swatch-ink": getAccentVariables(accent.id, false)[
                        "--accent-ink"
                      ],
                    }}
                  >
                    <span className="accent-swatch-dot">
                      {selectedAccent.id === accent.id && (
                        <Check size={17} aria-hidden="true" />
                      )}
                    </span>
                    <span>{accent.label.replace(/^Neon /, "")}</span>
                  </button>
                ))}
              </div>
              <p className="settings-hint">
                Applies to selections, buttons, and highlights. Neon colors add
                a subtle glow.
              </p>
            </div>
            <div className="settings-card settings-row">
              <div className="settings-row-copy">
                <label htmlFor="settings-ui-scale">Interface text size</label>
                <p>Adjust the sidebar, note list, menus, and buttons.</p>
              </div>
              <Select
                id="settings-ui-scale"
                label="Interface text size"
                value={settings.uiScale || 1}
                onChange={(value) => setSettings({ uiScale: Number(value) })}
                options={[
                  { value: "1", label: "Comfortable" },
                  { value: "1.1", label: "Large" },
                  { value: "1.2", label: "Extra large" },
                ]}
              />
            </div>
            <div className="settings-reading-preview">
              <span className="settings-eyebrow">Interface preview</span>
              <strong>A little space for your ideas</strong>
              <p>Find a thought. Start something new.</p>
            </div>
          </section>

          <section
            id="settings-panel-fonts"
            className="settings-panel"
            role="tabpanel"
            aria-labelledby="settings-tab-fonts"
            hidden={active !== "fonts"}
          >
            <div className="settings-panel-title-row">
              <PanelHeading title="Fonts & writing">
                Choose your everyday type. Preview it as you go.
              </PanelHeading>
              <button
                type="button"
                className="text-button"
                onClick={() =>
                  setSettings({
                    fontFamily: "system",
                    noteFontFamily: "inherit",
                  })
                }
              >
                Reset fonts
              </button>
            </div>
            <div className="settings-font-grid">
              <FontPicker
                label="Interface font"
                value={settings.fontFamily || "system"}
                onChange={(fontFamily) => setSettings({ fontFamily })}
              />
              <FontPicker
                label="Note font"
                value={settings.noteFontFamily || "inherit"}
                onChange={(noteFontFamily) => setSettings({ noteFontFamily })}
                previewSize={settings.fontSize}
                allowInherit
              />
            </div>
            <div className="settings-card settings-editor-size">
              <label className="range-label" htmlFor="settings-editor-size">
                <span>
                  Editor text size<strong>{settings.fontSize} px</strong>
                </span>
                <input
                  id="settings-editor-size"
                  aria-label="Editor text size"
                  type="range"
                  min="14"
                  max="26"
                  value={settings.fontSize}
                  onChange={(event) =>
                    setSettings({ fontSize: Number(event.target.value) })
                  }
                />
              </label>
              <p className="settings-hint">
                Changes note text only. Your interface keeps its own size.
              </p>
            </div>
            <p className="settings-hint settings-font-note">
              {FONTS.length} font choices. Bundled fonts work offline; Windows
              fonts use what’s installed on your computer.
            </p>
          </section>

          <section
            id="settings-panel-reminders"
            className="settings-panel"
            role="tabpanel"
            aria-labelledby="settings-tab-reminders"
            hidden={active !== "reminders"}
          >
            <PanelHeading title="Reminders">
              A gentle nudge, right when you need it.
            </PanelHeading>
            <div className="settings-card">
              <label className="toggle-row settings-tray-toggle">
                <span>
                  <strong>Keep reminders active in the system tray</strong>
                  <small>
                    Closing the window keeps Notes running. Choose Quit from its
                    tray icon to exit.
                  </small>
                </span>
                <input
                  className="settings-switch"
                  type="checkbox"
                  aria-label="Keep reminders active in the system tray"
                  checked={settings.remindersInTray !== false}
                  disabled={!window.desktop}
                  onChange={(event) =>
                    setSettings({ remindersInTray: event.target.checked })
                  }
                />
              </label>
            </div>
            {window.desktop ? (
              <>
                <div className="settings-card settings-alert-test">
                  <span className="settings-feature-icon">
                    <Bell size={22} strokeWidth={1.6} />
                  </span>
                  <h4>Try a reminder popup</h4>
                  <p>
                    Make sure you can see your alerts. The popup stays visible
                    until you dismiss it or open the note.
                  </p>
                  <button
                    type="button"
                    className="button"
                    onClick={testReminderAlert}
                    disabled={
                      reminderTest.status === "pending" ||
                      !window.desktop.testReminder
                    }
                  >
                    <Bell size={16} />
                    {reminderTest.status === "pending"
                      ? "Showing test alert…"
                      : "Test reminder alert"}
                  </button>
                </div>
                {reminderTest.message && (
                  <p
                    className={`settings-feedback ${reminderTest.status === "error" ? "form-error" : "helper"}`}
                    role={reminderTest.status === "error" ? "alert" : "status"}
                  >
                    {reminderTest.message}
                  </p>
                )}
                {reminderError && (
                  <p className="form-error" role="alert">
                    {reminderError.message}
                  </p>
                )}
              </>
            ) : (
              <p className="settings-notice">
                <Info size={17} />
                <span>
                  In-app reminders work while this tab stays open. Install the
                  Windows app for reminder popups and system tray support.
                </span>
              </p>
            )}
            <p className="settings-notice">
              <Info size={17} />
              <span>
                Open Notes after starting Windows. Reminders missed while it was
                closed appear when you reopen it.
              </span>
            </p>
          </section>

          <section
            id="settings-panel-data"
            className="settings-panel"
            role="tabpanel"
            aria-labelledby="settings-tab-data"
            hidden={active !== "data"}
          >
            <PanelHeading title="Data & backup">
              Your notes, safely in your hands.
            </PanelHeading>
            <div className="settings-storage-note">
              <ShieldCheck size={22} strokeWidth={1.6} />
              <div>
                <strong>Stored on this device</strong>
                <p>
                  Your notes and attachments save automatically. Notes does not
                  connect to iCloud or sync across devices.
                </p>
              </div>
            </div>
            <div className="settings-backup-grid">
              <div className="settings-card settings-backup-card">
                <Download size={22} strokeWidth={1.5} />
                <h4>Keep a backup</h4>
                <p>
                  Save a separate copy of your entire notebook, including
                  attachments.
                </p>
                <button type="button" className="button" onClick={exportBackup}>
                  <Download size={15} />
                  Export backup
                </button>
              </div>
              <div className="settings-card settings-backup-card">
                <Upload size={22} strokeWidth={1.5} />
                <h4>Restore a notebook</h4>
                <p>
                  Choose a Notes backup. You’ll review it before replacing your
                  current notes.
                </p>
                <button
                  type="button"
                  className="button"
                  onClick={() => {
                    close();
                    backupInput.current.click();
                  }}
                >
                  <Upload size={15} />
                  Import backup
                </button>
              </div>
            </div>
            <div className="settings-about">
              <NotebookPen size={22} strokeWidth={1.5} />
              <div>
                <strong>Notes for Windows · Version {appVersion}</strong>
                <p>
                  An independent, open-source app inspired by Apple Notes.
                  <br />
                  Not affiliated with or endorsed by Apple.
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
      <footer className="settings-footer">
        <span
          className={`settings-save-state ${saveStatus}`}
          aria-live="polite"
        >
          {saveStatus === "saving" ? (
            <LoaderCircle size={15} className="spin" />
          ) : saveStatus === "error" ? (
            <Info size={15} />
          ) : (
            <Check size={15} />
          )}
          <span>
            {saveStatus === "saving"
              ? "Saving changes…"
              : saveStatus === "error"
                ? "Changes couldn’t be saved"
                : "Changes saved automatically"}
          </span>
        </span>
        {saveStatus === "error" && (
          <button type="button" className="text-button" onClick={exportBackup}>
            Export backup
          </button>
        )}
        <button type="button" className="button primary" onClick={close}>
          Done
        </button>
      </footer>
    </div>
  );
}
