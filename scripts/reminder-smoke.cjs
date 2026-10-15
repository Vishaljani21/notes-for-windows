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
    const traySetting = page.getByRole("checkbox", {
      name: "Keep reminders active in the system tray",
      exact: true,
    });
    await traySetting.waitFor();
    assert.equal(await traySetting.isChecked(), true);
    await page.getByRole("button", { name: "Done", exact: true }).click();
    // Exercise Electron's real Notification class and event handlers without
    // showing a test notification or bringing a hidden test window forward.
    await instance.evaluate(({ Notification, BrowserWindow }) => {
      globalThis.__reminderTest = {
        notifications: [], opened: 0, focused: 0, hidden: 0,
      };
      Notification.isSupported = () => true;
      Notification.prototype.show = function () {
        globalThis.__reminderTest.notifications.push(this);
      };
      const window = BrowserWindow.getAllWindows()[0];
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
    const scheduled = await page.evaluate(async () => {
      const data = await window.desktop.load();
      data.notes[0].reminderAt = Date.now() + 500;
      data.notes[0].reminderNotifiedAt = null;
      await window.desktop.save(data);
      return { noteId: data.notes[0].id, reminderAt: data.notes[0].reminderAt };
    });
    await page.waitForFunction(() => window.__reminderEvents.length === 1);
    const delivered = await page.evaluate(() => window.__reminderEvents[0]);
    assert.equal(delivered.noteId, scheduled.noteId);
    assert.equal(delivered.reminderAt, scheduled.reminderAt);
    assert.ok(delivered.deliveredAt >= scheduled.reminderAt);
    const receipts = JSON.parse(
      await fs.readFile(path.join(dir, "reminder-deliveries.json"), "utf8"),
    );
    assert.deepEqual(receipts.deliveries[0], delivered);
    const notification = await instance.evaluate(() => {
      const entry = globalThis.__reminderTest.notifications[0];
      return { title: entry.title, body: entry.body };
    });
    assert.equal(notification.title, library.notes[0].title);
    assert.match(notification.body, /Click to open/);
    await page.locator(".note-card").filter({
      hasText: "A weekend in Copenhagen",
    }).click();
    assert.equal(
      await page.getByLabel("Note title").inputValue(),
      "A weekend in Copenhagen",
    );
    await instance.evaluate(() =>
      globalThis.__reminderTest.notifications[0].emit("click"),
    );
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
    console.log("Native notification, durable receipt, and click-to-open routing: PASS");

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
        BrowserWindow.getAllWindows()[0].isVisible(),
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
