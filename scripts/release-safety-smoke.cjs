const { _electron: electron } = require("playwright");
const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const assert = require("node:assert/strict");

const project = path.resolve(__dirname, "..");
const testRoot = path.join(
  project,
  "test-results",
  "release-safety-" + Date.now(),
);
const envFor = (dir) => ({
  ...process.env,
  NODE_ENV: "test",
  NOTES_TEST_HEADLESS: "1",
  NOTES_TEST_USER_DATA: dir,
});

async function launch(dir) {
  const instance = await electron.launch({ args: [project], env: envFor(dir) });
  assert.equal(
    await instance.evaluate(({ app }) => app.getPath("userData")),
    dir,
    "Safety checks must use an isolated library",
  );
  return instance;
}

function exited(child, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("Test app did not exit within " + timeout + " ms"));
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

async function closeGracefully(instance) {
  const done = exited(instance.process());
  await instance.evaluate(({ app }) => app.quit());
  assert.equal(await done, 0);
}

async function checkSingleInstance(instance, dir) {
  // Instrument the hidden test window so that the real second-instance event
  // can exercise restore/show/focus without displaying a test window.
  await instance.evaluate(({ app, BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    globalThis.__notesInstanceCheck = {
      received: false,
      restore: 0,
      show: 0,
      focus: 0,
    };
    const calls = globalThis.__notesInstanceCheck;
    window.isMinimized = () => true;
    window.restore = () => calls.restore++;
    window.show = () => calls.show++;
    window.focus = () => calls.focus++;
    app.once("second-instance", () => {
      calls.received = true;
    });
  });
  const duplicate = spawn(require("electron"), [project], {
    env: envFor(dir),
    stdio: "ignore",
    windowsHide: true,
  });
  assert.equal(
    await exited(duplicate),
    0,
    "Duplicate process must exit cleanly",
  );
  const calls = await instance.evaluate(() => globalThis.__notesInstanceCheck);
  assert.deepEqual(calls, { received: true, restore: 1, show: 1, focus: 1 });
  assert.equal(
    await instance.evaluate(
      ({ BrowserWindow }) => BrowserWindow.getAllWindows().length,
    ),
    1,
  );
  assert.equal(
    await instance.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].isVisible(),
    ),
    false,
  );
  console.log("Single instance, restore, and focus routing: PASS");
}

async function checkRecovery() {
  const { seedLibrary } = await import(
    pathToFileURL(path.join(project, "src/lib.mjs"))
  );
  const library = seedLibrary();
  library.notes[0].title = "Recovered from the only remaining backup";
  const dir = path.join(testRoot, "missing-primary");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, "notes-data.json.bak"),
    JSON.stringify(library),
  );
  const instance = await launch(dir);
  try {
    const page = await instance.firstWindow();
    await page.getByLabel("Note title").waitFor();
    assert.equal(
      await page.getByLabel("Note title").inputValue(),
      library.notes[0].title,
    );
    await page.getByText("All changes saved", { exact: true }).waitFor();
    const saved = JSON.parse(
      await fs.readFile(path.join(dir, "notes-data.json"), "utf8"),
    );
    assert.equal(saved.notes[0].title, library.notes[0].title);
    console.log("Missing primary recovers the existing backup: PASS");
    await checkSingleInstance(instance, dir);
    await closeGracefully(instance);
  } finally {
    await instance.close().catch(() => {});
  }
}

async function checkCorruptClose(missingPrimary = false) {
  const dir = path.join(
    testRoot,
    missingPrimary ? "missing-corrupt-backup" : "corrupt-library",
  );
  await fs.mkdir(dir, { recursive: true });
  const primary = "{ deliberately invalid primary fixture";
  const recovery = "{ deliberately invalid backup fixture";
  if (!missingPrimary)
    await fs.writeFile(path.join(dir, "notes-data.json"), primary);
  await fs.writeFile(path.join(dir, "notes-data.json.bak"), recovery);
  const instance = await launch(dir);
  try {
    const page = await instance.firstWindow();
    await page
      .getByRole("heading", { name: "Your notes are safe where they are." })
      .waitFor();
    await closeGracefully(instance);
    if (missingPrimary) {
      await assert.rejects(fs.readFile(path.join(dir, "notes-data.json")), {
        code: "ENOENT",
      });
    } else {
      assert.equal(
        await fs.readFile(path.join(dir, "notes-data.json"), "utf8"),
        primary,
      );
    }
    assert.equal(
      await fs.readFile(path.join(dir, "notes-data.json.bak"), "utf8"),
      recovery,
    );
    console.log(
      (missingPrimary
        ? "Missing primary with corrupt backup"
        : "Corrupt library") + " remains untouched after graceful close: PASS",
    );
  } finally {
    await instance.close().catch(() => {});
  }
}

async function main() {
  await checkRecovery();
  await checkCorruptClose();
  await checkCorruptClose(true);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
