const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("reminderAlert", {
  ready: () => ipcRenderer.invoke("reminder-alert:ready"),
  open: (id) => ipcRenderer.send("reminder-alert:action", "open", id),
  dismiss: (id) => ipcRenderer.send("reminder-alert:action", "dismiss", id),
  rendered: (ids) => ipcRenderer.send("reminder-alert:rendered", ids),
  onItems: (callback) => {
    const listener = (_, items) => callback(items);
    ipcRenderer.on("reminder-alert:items", listener);
    return () => ipcRenderer.removeListener("reminder-alert:items", listener);
  },
});
