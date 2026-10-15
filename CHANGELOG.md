# Changelog

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
