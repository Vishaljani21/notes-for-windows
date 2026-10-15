const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("desktop", {
  load: () => ipcRenderer.invoke("notes:load"),
  save: (data) => ipcRenderer.invoke("notes:save", data),
  exportFile: (name, text) => ipcRenderer.invoke("notes:export", name, text),
  openExternal: (url) => ipcRenderer.invoke("notes:external", url),
  readClipboard: () => ipcRenderer.invoke("notes:read-clipboard"),
  writeClipboard: (content) =>
    ipcRenderer.invoke("notes:write-clipboard", content),
  testReminder: () => ipcRenderer.invoke("notes:test-reminder"),
  retryReminder: (noteId) => ipcRenderer.invoke("notes:retry-reminder", noteId),
  minimize: () => ipcRenderer.send("window:minimize"),
  maximize: () => ipcRenderer.send("window:maximize"),
  close: () => ipcRenderer.send("window:close"),
  finishClose: () => ipcRenderer.send("window:finish-close"),
  onReminder: (callback) => {
    const listener = (_, reminder) => callback(reminder);
    ipcRenderer.on("notes:reminder", listener);
    return () => ipcRenderer.removeListener("notes:reminder", listener);
  },
  onReminderError: (callback) => {
    const listener = (_, error) => callback(error);
    ipcRenderer.on("notes:reminder-error", listener);
    return () => ipcRenderer.removeListener("notes:reminder-error", listener);
  },
  onOpenNote: (callback) => {
    const listener = (_, noteId) => callback(noteId);
    ipcRenderer.on("notes:open-note", listener);
    return () => ipcRenderer.removeListener("notes:open-note", listener);
  },
  onBeforeClose: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("window:before-close", listener);
    return () => ipcRenderer.removeListener("window:before-close", listener);
  },
  onShortcut: (callback) => {
    const listener = (_, command) => callback(command);
    ipcRenderer.on("notes:command", listener);
    return () => ipcRenderer.removeListener("notes:command", listener);
  },
});
