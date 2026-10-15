const { _electron: electron } = require("playwright");
const fs = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");

function exited(child, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("The test process did not exit safely"));
    }, timeout);
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
}

async function waitFor(check, message, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const result = await check();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(message);
}

async function alertPage(instance, timeout = 15000) {
  return waitFor(async () => {
    for (const page of instance.windows()) {
      if (page.isClosed()) continue;
      if (await page.getByRole("button", { name: /^Open note(s)?$/i }).count())
        return page;
    }
  }, "The reminder popup did not render", timeout);
}

async function main() {
  const project = path.resolve(__dirname, "..");
  const { seedLibrary } = await import(
    pathToFileURL(path.join(project, "src/lib.mjs"))
  );
  const dir = path.join(project, "test-results", "native-reminders-" + Date.now());
  await fs.mkdir(dir, { recursive: true });
  const library = seedLibrary();
  library.settings.remindersInTray = true;
  library.notes[0].reminderAt = Date.now() + 3600000;
  library.notes[0].reminderNotifiedAt = null;
  await fs.writeFile(path.join(dir, "notes-data.json"), JSON.stringify(library));
  const env = {
      ...process.env,
      NODE_ENV: "test",
      NOTES_TEST_HEADLESS: "1",
      NOTES_TEST_USER_DATA: dir,
  };
  const instance = await electron.launch({
    args: [project],
    env,
  });
  try {
    const page = await instance.firstWindow();
    await page.getByLabel("Note title").waitFor();
    await page.getByText("All changes saved", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("tab", { name: "Reminders", exact: true }).click();
    const traySetting = page.getByRole("checkbox", {
      name: "Keep reminders active in the system tray",
      exact: true,
    });
    await traySetting.waitFor();
    assert.equal(await traySetting.isChecked(), true);
    await page.getByRole("button", { name: "Done", exact: true }).click();
    // Keep the fixture's main window hidden while exercising the real reminder
    // popup. Windows toast calls are not a substitute for a visible app alert.
    await instance.evaluate(({ BrowserWindow }) => {
      globalThis.__reminderTest = {
        opened: 0, focused: 0, hidden: 0,
      };
      const window = BrowserWindow.getAllWindows()[0];
      globalThis.__reminderTest.mainWindowId = window.id;
      window.show = () => globalThis.__reminderTest.opened++;
      window.focus = () => globalThis.__reminderTest.focused++;
      const hide = window.hide.bind(window);
      window.hide = () => {
        globalThis.__reminderTest.hidden++;
        hide();
      };
    });
    await page.evaluate(() => {
      window.__reminderEvents = [];
      window.__openedNotes = [];
      window.desktop.onReminder((event) => window.__reminderEvents.push(event));
      window.desktop.onOpenNote((id) => window.__openedNotes.push(id));
    });
    // Schedule through the real editor. Saving directly through IPC would leave
    // React holding the original fixture date; its next autosave could silently
    // overwrite the native scheduler's test date before the replay assertion.
    await page.getByRole("button", { name: "Set reminder", exact: true }).click();
    const scheduled = await page.evaluate((noteId) => {
      const reminderAt = Math.ceil((Date.now() + 5000) / 60000) * 60000;
      const date = new Date(reminderAt);
      const pad = (value) => String(value).padStart(2, "0");
      const inputValue = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
      return { noteId, reminderAt, inputValue };
    }, library.notes[0].id);
    await page.getByLabel("Date and time", { exact: true }).fill(scheduled.inputValue);
    await page.getByRole("button", { name: "Save reminder", exact: true }).click();
    await waitFor(async () => {
      const saved = JSON.parse(await fs.readFile(path.join(dir, "notes-data.json"), "utf8"));
      return saved.notes.find((note) => note.id === scheduled.noteId)?.reminderAt === scheduled.reminderAt;
    }, "The editor did not save the selected reminder time");
    const reminderPopup = await alertPage(
      instance,
      Math.max(15000, scheduled.reminderAt - Date.now() + 15000),
    );
    assert.match(await reminderPopup.locator("body").innerText(), /A little room for big ideas/);
    assert.equal(await instance.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().some((window) =>
        window.webContents.getURL().includes("reminder-alert") && window.isVisible()),
    ), true);
    await page.waitForFunction(() => window.__reminderEvents.length === 1);
    const delivered = await page.evaluate(() => window.__reminderEvents[0]);
    assert.equal(delivered.noteId, scheduled.noteId);
    assert.equal(delivered.reminderAt, scheduled.reminderAt);
    assert.ok(delivered.deliveredAt >= scheduled.reminderAt);
    const receipts = await waitFor(async () => {
      try {
        const data = JSON.parse(await fs.readFile(path.join(dir, "reminder-deliveries.json"), "utf8"));
        return data.deliveries.some((entry) => entry.noteId === scheduled.noteId) && data;
      } catch { return null; }
    }, "Confirmed reminder receipt was not saved");
    assert.deepEqual(receipts.deliveries[0], delivered);
    await page.locator(".note-card").filter({
      hasText: "A weekend in Copenhagen",
    }).click();
    assert.equal(
      await page.getByLabel("Note title").inputValue(),
      "A weekend in Copenhagen",
    );
    await reminderPopup.getByRole("button", { name: "Open note", exact: true }).click();
    await page.waitForFunction(() => window.__openedNotes.length === 1);
    assert.equal(
      await page.evaluate(() => window.__openedNotes[0]),
      scheduled.noteId,
    );
    await page.waitForFunction(
      (title) => document.querySelector('[aria-label="Note title"]')?.value === title,
      library.notes[0].title,
    );
    assert.deepEqual(
      await instance.evaluate(() => ({
        opened: globalThis.__reminderTest.opened,
        focused: globalThis.__reminderTest.focused,
      })),
      { opened: 1, focused: 1 },
    );
    console.log("Visible Notes reminder popup, confirmed receipt, and Open note routing: PASS");

    // Wait for the delivery marker to complete the renderer's autosave as well
    // as the native receipt. This guards against the stale-date CI regression.
    const savedDelivery = await waitFor(async () => {
      const saved = JSON.parse(await fs.readFile(path.join(dir, "notes-data.json"), "utf8"));
      const note = saved.notes.find((item) => item.id === scheduled.noteId);
      return note?.reminderNotifiedAt >= scheduled.reminderAt && note;
    }, "The delivered reminder did not round-trip through the editor save");
    assert.equal(savedDelivery.reminderAt, scheduled.reminderAt);
    const replay = await page.evaluate((id) => window.desktop.retryReminder(id), scheduled.noteId);
    assert.equal(replay.ok, true, replay.error);
    const repeatedPopup = await alertPage(instance);
    await page.waitForFunction(() => window.__reminderEvents.length === 2);
    await repeatedPopup.getByRole("button", { name: "Dismiss", exact: true }).click();
    console.log("Previously delivered reminder can be shown again and dismissed: PASS");

    const testResult = await page.evaluate(() => window.desktop.testReminder());
    assert.equal(testResult.ok, true);
    assert.equal(testResult.channel, "app");
    const testPopup = await alertPage(instance);
    assert.match(await testPopup.locator("body").innerText(), /reminder test/i);
    await instance.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows().find((window) =>
        window.webContents.getURL().includes("reminder-alert"))?.close();
    });
    const reopened = await page.evaluate(() => window.desktop.testReminder());
    assert.equal(reopened.ok, true);
    const reopenedPopup = await alertPage(instance);
    assert.equal(await reopenedPopup.getByRole("heading", { name: "Notes reminder test", exact: true }).count(), 1);
    await reopenedPopup.getByRole("button", { name: "Dismiss", exact: true }).click();
    console.log("Settings test alert and closing without reappearing stale alerts: PASS");

    await page.getByLabel("Note title").fill("Saved before hiding in tray");
    await page.getByRole("button", { name: "Close app", exact: true }).click();
    await instance.evaluate(() => new Promise((resolve, reject) => {
      const deadline = Date.now() + 5000;
      const check = () => {
        if (globalThis.__reminderTest.hidden === 1) return resolve();
        if (Date.now() >= deadline) return reject(new Error("Close did not hide the window"));
        setTimeout(check, 20);
      };
      check();
    }));
    await page.waitForFunction(async () => {
      const data = await window.desktop.load();
      return data.notes[0].title === "Saved before hiding in tray";
    });
    assert.equal(instance.process().exitCode, null);
    assert.equal(
      await instance.evaluate(({ BrowserWindow }) =>
        BrowserWindow.fromId(globalThis.__reminderTest.mainWindowId).isVisible(),
      ),
      false,
    );
    const primaryExited = exited(instance.process());
    const request = spawn(require("electron"), [project, "--quit"], {
      env,
      stdio: "ignore",
      windowsHide: true,
    });
    assert.equal(await exited(request), 0);
    assert.equal(await primaryExited, 0);
    const saved = JSON.parse(
      await fs.readFile(path.join(dir, "notes-data.json"), "utf8"),
    );
    assert.equal(saved.notes[0].title, "Saved before hiding in tray");
    console.log("Opt-in tray close saves and hides; --quit handoff saves and exits: PASS");
  } finally {
    await instance.close().catch(() => {});
  }
  const idleDir = path.join(dir, "quit-without-running-app");
  const idleQuit = spawn(require("electron"), [project, "--quit"], {
    env: { ...env, NOTES_TEST_USER_DATA: idleDir },
    stdio: "ignore",
    windowsHide: true,
  });
  assert.equal(await exited(idleQuit), 0);
  for (const filename of ["notes-data.json", "reminder-deliveries.json"])
    await assert.rejects(fs.readFile(path.join(idleDir, filename)), {
      code: "ENOENT",
    });
  console.log("--quit without a running app opens no library or notification: PASS");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
