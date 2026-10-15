# Changelog

## 1.1.7 — 2026-10-16

- Redesigned Settings with category navigation, a fixed header and footer, compact font previews, and clear save feedback.
- Added keyboard navigation and layouts for smaller windows and larger interface text.
- Added note-card context menus for common note actions and editor context menus for writing and formatting.
- Refined the reminder date/time picker and popup alerts with clearer note context, readable due times, and easy-to-reach actions.

## 1.1.6 — 2026-10-16

- Fixed the Electron taskbar icon caused by a development shortcut sharing the installed Notes app identity.
- Separated development and installed Windows app identities, and repaired the conflicting development shortcut during local updates.
- Includes the persistent reminder popup and reminder delivery fixes from 1.1.5.

## 1.1.5 — 2026-10-16

- Fixed reminders being marked delivered before an alert was displayed.
- Due reminders now open a persistent Notes popup with Open note and Dismiss actions, including while Notes runs in the tray. This avoids relying on Windows toast banners that can be accepted but hidden.
- Failed alert attempts remain pending and retry with a delay. Failed receipt writes do not repeat an alert already shown in the same session.
- Added Show reminder again for missed alerts, a Test reminder alert button in Settings, and an In 1 minute preset.
- Kept reminder errors visible with a way to review the affected note.

## 1.1.4 — 2026-10-16

- Made the native taskbar icon check allow Windows diagnostic startup and first-time C# compilation on clean release runners, with progress diagnostics for failures.
- Includes the running taskbar icon fix from 1.1.3.

## 1.1.3 — 2026-10-16

- Explicitly assigned the original Notes icon and relaunch identity to the running Windows taskbar button, in addition to Desktop and Start menu shortcuts.
- Used the installed icon outside the application archive for native Windows icon and relaunch metadata.

## 1.1.2 — 2026-10-15

- Removed audio recording, import, transcription, and audio questions from the toolbar and menus, along with their model workers and dependencies.
- Kept existing audio attachments readable in previously saved notes.
- Restored the previous Notes icon across the app and Windows shortcuts.

## 1.1.1 — 2026-10-15

- Made saved-audio checks wait for the imported clip to finish saving before reloading, so clean Windows release builds verify persistence reliably.

## 1.1.0 — 2026-10-15

- Docked note tags above the save-status footer so they remain visible while reading or editing long notes.
- Kept tag controls aligned with the note, with wrapping and scrolling for large tag collections.
- Added a microphone button in the editor toolbar for direct access to recording, audio import, and transcription.
- Added on-device English audio transcript questions with quoted evidence, no-answer handling, and saved answers. Existing audio notes can be transcribed and queried without duplicating the clip.
- Added note reminders with date/time presets, Windows notifications, click-to-open, overdue recovery, and persistent duplicate-delivery protection.
- Closing the window keeps Notes in the system tray by default; Settings can turn this off, and Quit from the tray exits safely.

## 1.0.3 — 2026-10-15

- Added separate interface and note fonts with live previews, search, and reset controls: 62 choices, including 48 bundled offline families, Windows fonts, and generic sans-serif, serif, and monospace options.
- Kept both font preferences on the device alongside appearance and text-size preferences.
- Improved library recovery and preserved unreadable data files when closing after a load error.
- Reopening the app now restores and focuses its existing window.
- Prepared the first public open-source release with an MIT source license, contributor documentation, and Windows CI/release workflows.

## 1.0.2 — 2026-10-15

- Improved readability with Segoe UI, larger sidebar labels, menus, tags, and note previews.
- Added Comfortable, Large, and Extra large interface text settings, independent of editor text size.
- Improved compact-window navigation and kept sidebar search and bottom controls accessible while scrolling.

## 1.0.1 — 2026-10-15

- Improved note-list selection, two-line previews, spacing, date visibility, and dark-mode contrast.
- Refined gallery cards for narrow windows.

## 1.0.0 — 2026-10-15

- Initial Windows desktop app with local notes, rich text, folders, tags, Smart Folders, attachments, note links, password locks, backup/export, OCR, and local audio transcription.
