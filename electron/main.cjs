const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  Menu,
  session,
  protocol,
  net,
  shell,
  Notification,
  Tray,
  nativeImage,
} = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { createReminderScheduler } = require("./reminders.cjs");
const { createReminderAlerts } = require("./reminder-alert.cjs");
const { createReminderDelivery } = require("./reminder-delivery.cjs");
// Windows uses this identity to choose the taskbar group's name and icon.
// Development Electron must not register its shortcut as the installed app.
const appUserModelId = app.isPackaged
  ? "com.notesforwindows.desktop"
  : "com.notesforwindows.development";
const appIconPath =
  process.platform === "win32" && app.isPackaged
    ? path.join(process.resourcesPath, "icons/notes-original.ico")
    : path.join(
        __dirname,
        "../dist",
        process.platform === "win32" ? "icon.ico" : "icon.png",
      );
protocol.registerSchemesAsPrivileged([
  {
    scheme: "notes",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);
if (
  !app.isPackaged &&
  process.env.NODE_ENV === "test" &&
  process.env.NOTES_TEST_USER_DATA
)
  app.setPath("userData", process.env.NOTES_TEST_USER_DATA);
let mainWindow;
let closingAllowed = false;
let quitting = false;
let tray;
let reminderScheduler;
let reminderAlerts;
let reminderDelivery;
let pendingWrite = Promise.resolve();
const quitRequested = process.argv.includes("--quit");
const ownsInstance = app.requestSingleInstanceLock();
if (!ownsInstance || quitRequested) app.quit();
else
  app.on("second-instance", (_, argv) => {
    if (argv.includes("--quit")) app.quit();
    else showWindow();
  });
function showWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}
function openReminderNote(noteId) {
  showWindow();
  if (noteId && mainWindow && !mainWindow.isDestroyed())
    mainWindow.webContents.send("notes:open-note", noteId);
}
function updateTray(settings) {
  if (settings?.remindersInTray !== true) {
    tray?.destroy();
    tray = undefined;
    return;
  }
  if (tray) return;
  try {
    tray = new Tray(appIconPath);
    tray.setToolTip("Notes for Windows — reminders are running");
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: "Open Notes", click: showWindow },
        { label: "Reminders are running", enabled: false },
        { type: "separator" },
        { label: "Quit Notes", click: () => app.quit() },
      ]),
    );
    tray.on("double-click", showWindow);
    tray.on("click", showWindow);
  } catch (error) {
    console.error("Could not create the Notes tray icon:", error);
    tray?.destroy();
    tray = undefined;
  }
}
const dataPath = () => path.join(app.getPath("userData"), "notes-data.json");
const trusted = (event) =>
  event.sender === mainWindow?.webContents &&
  event.senderFrame === mainWindow?.webContents.mainFrame;
ipcMain.handle("notes:test-reminder", async (event) => {
  if (!trusted(event)) throw new Error("Untrusted source");
  try {
    const result = await reminderDelivery.deliver(
      { id: "notes-reminder-test", title: "Notes reminder test", reminderAt: Date.now() },
      null,
      { isTest: true },
    );
    return { ok: true, ...result };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});
ipcMain.handle("notes:retry-reminder", async (event, noteId) => {
  if (!trusted(event)) throw new Error("Untrusted source");
  if (typeof noteId !== "string" || !/^[a-z0-9_-]{1,100}$/i.test(noteId))
    return { ok: false, error: "Choose an existing reminder to show again." };
  await pendingWrite.catch(() => {});
  if (await reminderScheduler.retryReminder(noteId))
    return { ok: true, reminderNotifiedAt: null };
  return { ok: false, error: "This reminder could not be shown again. Check its saved time and try again." };
});
ipcMain.handle("notes:load", async (event) => {
  if (!trusted(event)) throw new Error("Untrusted source");
  let library;
  try {
    library = JSON.parse(await fs.readFile(dataPath(), "utf8"));
  } catch (error) {
    try {
      library = {
        ...JSON.parse(await fs.readFile(dataPath() + ".bak", "utf8")),
        recovered: true,
      };
    } catch (recoveryError) {
      if (error.code === "ENOENT" && recoveryError.code === "ENOENT")
        return null;
      throw new Error(
        "Your saved notes could not be read. The original data file has been preserved.",
      );
    }
  }
  if (library?.version === 1 && Array.isArray(library.notes)) {
    updateTray(library.settings);
    return reminderScheduler.replaceLibrary(library);
  }
  return library;
});
ipcMain.handle("notes:save", (event, data) => {
  if (
    !trusted(event) ||
    !data ||
    data.version !== 1 ||
    !Array.isArray(data.notes) ||
    !Array.isArray(data.folders)
  )
    throw new Error("Invalid notes data");
  const json = JSON.stringify(data);
  if (json.length > 150 * 1024 * 1024)
    throw new Error(
      "Library exceeds 150 MB. Export large attachments to reduce its size.",
    );
  pendingWrite = pendingWrite
    .catch(() => {})
    .then(async () => {
      await fs.mkdir(app.getPath("userData"), { recursive: true });
      await fs.writeFile(dataPath() + ".tmp", json, "utf8");
      await fs.copyFile(dataPath() + ".tmp", dataPath() + ".bak");
      await fs.rename(dataPath() + ".tmp", dataPath());
      updateTray(data.settings);
      // Native delivery receipts are independent from renderer saves. A
      // receipt failure must never turn a successful note save into an error.
      await reminderScheduler.replaceLibrary(data).catch(console.error);
    });
  return pendingWrite;
});
ipcMain.handle("notes:export", async (event, name, text) => {
  if (!trusted(event) || typeof text !== "string" || typeof name !== "string")
    throw new Error("Invalid export");
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: path.basename(name),
    filters: [
      {
        name: "Notes export",
        extensions: [path.extname(name).slice(1) || "txt"],
      },
    ],
  });
  if (result.canceled) return false;
  await fs.writeFile(result.filePath, text, "utf8");
  return true;
});
ipcMain.on("window:finish-close", (event) => {
  if (trusted(event)) {
    closingAllowed = true;
    mainWindow.close();
  }
});
ipcMain.handle("notes:external", (event, url) => {
  if (
    !trusted(event) ||
    typeof url !== "string" ||
    !/^(https?:\/\/|mailto:)/i.test(url)
  )
    throw new Error("Unsupported link");
  return shell.openExternal(url);
});
for (const action of ["minimize", "maximize", "close"])
  ipcMain.on("window:" + action, (event) => {
    if (!trusted(event)) return;
    if (action === "maximize")
      mainWindow.isMaximized()
        ? mainWindow.unmaximize()
        : mainWindow.maximize();
    else mainWindow[action]();
  });
app.whenReady().then(() => {
  if (!ownsInstance || quitRequested) return;
  app.setAppUserModelId(appUserModelId);
  reminderAlerts = createReminderAlerts({
    iconPath: appIconPath,
    onOpen: openReminderNote,
  });
  reminderDelivery = createReminderDelivery({
    Notification,
    iconPath: appIconPath,
    showAlert: (note, options) => reminderAlerts.show(note, options),
    onOpen: openReminderNote,
    onDelivered: (receipt) => {
      if (mainWindow && !mainWindow.isDestroyed())
        mainWindow.webContents.send("notes:reminder", receipt);
    },
    onError: (error) => {
      if (mainWindow && !mainWindow.isDestroyed())
        mainWindow.webContents.send("notes:reminder-error", error);
    },
  });
  reminderScheduler = createReminderScheduler({
    deliveryPath: path.join(app.getPath("userData"), "reminder-deliveries.json"),
    notify: (note, receipt) => reminderDelivery.deliver(note, receipt),
  });
  const assets = path.resolve(__dirname, "../dist");
  protocol.handle("notes", (request) => {
    const url = new URL(request.url);
    if (url.hostname !== "app")
      return new Response("Not found", { status: 404 });
    let target;
    try {
      target = path.resolve(
        assets,
        "." +
          decodeURIComponent(
            url.pathname === "/" ? "/index.html" : url.pathname,
          ),
      );
    } catch {
      return new Response("Invalid path", { status: 400 });
    }
    if (!target.startsWith(assets + path.sep))
      return new Response("Not found", { status: 404 });
    return net.fetch(pathToFileURL(target).href);
  });
  session.defaultSession.webRequest.onHeadersReceived(
    { urls: ["notes://app/*"] },
    (details, callback) =>
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          "Content-Security-Policy": [
            "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' blob: https://cdn.jsdelivr.net; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; media-src 'self' data: blob:; font-src 'self'; connect-src 'self' https://tessdata.projectnaptha.com https://cdn.jsdelivr.net; object-src 'none'; frame-src 'none'; base-uri 'self'",
          ],
        },
      }),
  );
  session.defaultSession.setPermissionRequestHandler(
    (contents, permission, callback) =>
      callback(contents === mainWindow?.webContents && permission === "media"),
  );
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    show: false,
    backgroundColor: "#f3f2f0",
    title: "Notes for Windows",
    icon: appIconPath,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  if (process.platform === "win32") {
    // The running taskbar button has its own relaunch metadata. Explicitly
    // associate it with the installed Notes icon rather than Electron's defaults.
    mainWindow.setAppDetails({
      appId: appUserModelId,
      appIconPath,
      appIconIndex: 0,
      relaunchCommand: app.isPackaged
        ? `"${process.execPath}"`
        : `"${process.execPath}" "${app.getAppPath()}"`,
      relaunchDisplayName: "Notes for Windows",
    });
    mainWindow.setIcon(nativeImage.createFromPath(appIconPath));
  }
  mainWindow.once("ready-to-show", () => {
    if (app.isPackaged || process.env.NOTES_TEST_HEADLESS !== "1")
      mainWindow.show();
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event) => event.preventDefault());
  mainWindow.webContents.on("will-attach-webview", (event) =>
    event.preventDefault(),
  );
  mainWindow.loadURL("notes://app/");
  mainWindow.on("close", (event) => {
    if (!closingAllowed) {
      event.preventDefault();
      mainWindow.webContents.send("window:before-close");
    } else if (tray && !quitting) {
      event.preventDefault();
      closingAllowed = false;
      mainWindow.hide();
    }
  });
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: "File",
        submenu: [
          {
            label: "New Note",
            accelerator: "CmdOrCtrl+N",
            click: () => mainWindow.webContents.send("notes:command", "new"),
          },
          {
            label: "Search Notes",
            accelerator: "CmdOrCtrl+Shift+F",
            click: () => mainWindow.webContents.send("notes:command", "search"),
          },
          { type: "separator" },
          { role: "quit" },
        ],
      },
      {
        label: "Edit",
        submenu: [
          { role: "undo" },
          { role: "redo" },
          { type: "separator" },
          { role: "cut" },
          { role: "copy" },
          { role: "paste" },
          { role: "selectAll" },
        ],
      },
      {
        label: "View",
        submenu: [
          { role: "togglefullscreen" },
          { role: "zoomIn" },
          { role: "zoomOut" },
          { role: "resetZoom" },
        ],
      },
    ]),
  );
});
app.on("before-quit", () => {
  quitting = true;
});
app.on("will-quit", () => {
  reminderScheduler?.stop();
  reminderAlerts?.destroy();
  reminderDelivery?.dispose();
  tray?.destroy();
});
app.on("window-all-closed", () => app.quit());
