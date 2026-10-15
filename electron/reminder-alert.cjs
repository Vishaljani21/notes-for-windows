const { BrowserWindow, ipcMain, screen } = require("electron");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { reminderTitle } = require("./reminder-delivery.cjs");

// A narrow, separate renderer keeps reminders visible independently of Windows
// banner suppression. It cannot read or edit the notes library.
function createReminderAlerts({ iconPath, onOpen, getAppearance }) {
  let window;
  let loading;
  const entries = new Map();
  const pendingRenders = new Map();
  const trusted = (event) =>
    event.sender === window?.webContents &&
    event.senderFrame === window?.webContents.mainFrame;
  const snapshot = () => {
    const appearance = getAppearance?.();
    return [...entries.values()].map(({ id, title, reminderAt, isTest }) => ({
      id,
      title,
      reminderAt,
      isTest,
      ...(appearance ? { appearance } : {}),
    }));
  };
  function publish() {
    if (window && !window.isDestroyed())
      window.webContents.send("reminder-alert:items", snapshot());
  }
  ipcMain.handle("reminder-alert:ready", (event) => {
    if (!trusted(event)) throw new Error("Untrusted reminder source");
    return snapshot();
  });
  ipcMain.on("reminder-alert:rendered", (event, ids) => {
    if (!trusted(event) || !Array.isArray(ids) || ids.length > 10000) return;
    for (const id of ids) {
      if (typeof id !== "string") continue;
      const pending = pendingRenders.get(id);
      if (!pending) continue;
      pendingRenders.delete(id);
      for (const confirm of pending) confirm();
    }
  });
  ipcMain.on("reminder-alert:action", (event, action, id) => {
    if (
      !trusted(event) ||
      !["open", "dismiss"].includes(action) ||
      typeof id !== "string"
    )
      return;
    const entry = entries.get(id);
    if (!entry) return;
    entries.delete(id);
    if (action === "open") onOpen(entry.isTest ? null : entry.noteId);
    publish();
    if (!entries.size) window.hide();
  });

  function waitForRendered(id) {
    return new Promise((resolve, reject) => {
      let pending = pendingRenders.get(id);
      if (!pending) pendingRenders.set(id, (pending = new Set()));
      const confirm = () => {
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(() => {
        pending.delete(confirm);
        if (!pending.size) pendingRenders.delete(id);
        reject(new Error("The reminder did not finish rendering."));
      }, 3000);
      pending.add(confirm);
    });
  }

  function getWindow() {
    if (window && !window.isDestroyed()) return loading;
    const area = screen.getDisplayNearestPoint(
      screen.getCursorScreenPoint(),
    ).workArea;
    const width = Math.min(390, area.width);
    const height = Math.min(370, area.height);
    window = new BrowserWindow({
      width,
      height,
      x: area.x + Math.max(0, area.width - width - 20),
      y: area.y + Math.max(0, area.height - height - 20),
      show: false,
      frame: false,
      resizable: false,
      maximizable: false,
      minimizable: false,
      fullscreenable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      title: "Notes reminders",
      icon: iconPath,
      backgroundColor: "#fffdf7",
      webPreferences: {
        preload: path.join(__dirname, "reminder-alert-preload.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
        partition: "reminder-alerts",
      },
    });
    window.webContents.session.setPermissionRequestHandler((_, __, callback) =>
      callback(false),
    );
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    window.webContents.on("will-navigate", (event) => event.preventDefault());
    window.webContents.on("will-attach-webview", (event) =>
      event.preventDefault(),
    );
    window.on("closed", () => {
      entries.clear();
      window = undefined;
      loading = undefined;
    });
    const activeWindow = window;
    loading = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error("The reminder window did not finish loading."));
        activeWindow.destroy();
      }, 5000);
      activeWindow.loadFile(path.join(__dirname, "reminder-alert.html")).then(
        () => {
          clearTimeout(timer);
          resolve();
        },
        (error) => {
          clearTimeout(timer);
          reject(error);
          activeWindow.destroy();
        },
      );
    });
    return loading;
  }

  async function show(note, { isTest = false } = {}) {
    const duplicate = [...entries.values()].find(
      (entry) =>
        entry.noteId === note.id && entry.reminderAt === note.reminderAt,
    );
    const entry = duplicate || {
      id: randomUUID(),
      noteId: note.id,
      reminderAt: note.reminderAt,
      isTest,
      title: reminderTitle(note, isTest),
    };
    entries.set(entry.id, entry);
    try {
      await getWindow();
      if (!window || window.isDestroyed())
        throw new Error("The reminder window closed before it could appear.");
      if (!window.isVisible()) {
        const area = screen.getDisplayNearestPoint(
          screen.getCursorScreenPoint(),
        ).workArea;
        const width = Math.min(390, area.width);
        const height = Math.min(370, area.height);
        window.setBounds({
          width,
          height,
          x: area.x + Math.max(0, area.width - width - 20),
          y: area.y + Math.max(0, area.height - height - 20),
        });
        await new Promise((resolve, reject) => {
          const activeWindow = window;
          const timer = setTimeout(() => {
            cleanup();
            reject(new Error("The reminder window could not be displayed."));
          }, 3000);
          const cleanup = () => {
            clearTimeout(timer);
            activeWindow.removeListener("show", shown);
            activeWindow.removeListener("closed", closed);
          };
          const shown = () => {
            cleanup();
            resolve();
          };
          const closed = () => {
            cleanup();
            reject(
              new Error("The reminder window closed before it could appear."),
            );
          };
          activeWindow.once("show", shown);
          activeWindow.once("closed", closed);
          // A reminder should be visible without interrupting current typing.
          activeWindow.showInactive();
          if (activeWindow.isVisible()) shown();
        });
      }
      const rendered = waitForRendered(entry.id);
      publish();
      await rendered;
      if (!window || window.isDestroyed() || !window.isVisible())
        throw new Error("The reminder window is no longer visible.");
      return { channel: "app" };
    } catch (error) {
      if (!duplicate) entries.delete(entry.id);
      throw error;
    }
  }

  return {
    show,
    refreshAppearance: publish,
    destroy() {
      ipcMain.removeHandler("reminder-alert:ready");
      ipcMain.removeAllListeners("reminder-alert:action");
      ipcMain.removeAllListeners("reminder-alert:rendered");
      entries.clear();
      window?.destroy();
      window = undefined;
    },
  };
}

module.exports = { createReminderAlerts };
