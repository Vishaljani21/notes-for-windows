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
} = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
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
let pendingWrite = Promise.resolve();
const ownsInstance = app.requestSingleInstanceLock();
if (!ownsInstance) app.quit();
else
  app.on("second-instance", () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
const dataPath = () => path.join(app.getPath("userData"), "notes-data.json");
const trusted = (event) =>
  event.sender === mainWindow?.webContents &&
  event.senderFrame === mainWindow?.webContents.mainFrame;
ipcMain.handle("notes:load", async (event) => {
  if (!trusted(event)) throw new Error("Untrusted source");
  try {
    return JSON.parse(await fs.readFile(dataPath(), "utf8"));
  } catch (error) {
    try {
      return {
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
  if (!ownsInstance) return;
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
            "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' blob: https://cdn.jsdelivr.net; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; media-src 'self' data: blob:; font-src 'self'; connect-src 'self' https://huggingface.co https://*.huggingface.co https://*.hf.co https://*.hfusercontent.com https://tessdata.projectnaptha.com https://cdn.jsdelivr.net; object-src 'none'; frame-src 'none'; base-uri 'self'",
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
    show: app.isPackaged || process.env.NOTES_TEST_HEADLESS !== "1",
    backgroundColor: "#f3f2f0",
    title: "Notes for Windows",
    icon: path.join(__dirname, "../dist/icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
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
app.on("window-all-closed", () => app.quit());
