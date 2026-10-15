const { _electron: electron } = require("playwright");
const fs = require("node:fs/promises");
const path = require("node:path");
const assert = require("node:assert/strict");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const runFile = promisify(execFile);

async function brandingPowerShell() {
  const programFiles = process.env.ProgramW6432 || process.env.ProgramFiles;
  const candidates = [
    ...(programFiles ? [path.join(programFiles, "PowerShell/7/pwsh.exe")] : []),
    ...(process.env.PATH || "").split(path.delimiter)
      .filter(Boolean).map((directory) => path.join(directory, "pwsh.exe")),
  ];
  for (const candidate of candidates) {
    try { await fs.access(candidate); return candidate; } catch {}
  }
  return "powershell.exe";
}

async function assertWindowBranding(app, dir) {
  if (process.platform !== "win32") return;
  const outputDirectory = path.join(dir, "window-branding");
  const nativeWindow = await app.evaluate(({ BrowserWindow }) => ({
    handle: BrowserWindow.getAllWindows()[0].getNativeWindowHandle().readBigUInt64LE().toString(),
    processId: process.pid,
    executable: process.execPath,
  }));
  const powershell = await brandingPowerShell();
  console.log(`Checking native window branding with ${powershell}`);
  const probe = runFile(powershell, [
    "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
    "-File", path.resolve("scripts/read-window-branding.ps1"),
    "-ProcessId", String(nativeWindow.processId),
    "-WindowHandle", nativeWindow.handle,
    "-Diagnostics",
    "-OutputDirectory", outputDirectory,
  // Clean Windows runners may need a cold CLR/Roslyn startup. Keep a bounded
  // minute for that startup and forward stages so a stall identifies its cause.
  ], { timeout: 60000, windowsHide: true });
  probe.child.stderr.on("data", (chunk) => process.stderr.write(chunk));
  await probe;
  const result = JSON.parse(
    (await fs.readFile(path.join(outputDirectory, "window-branding.json"), "utf8"))
      .replace(/^\uFEFF/, ""),
  );
  const windows = Array.isArray(result) ? result : [result];
  const window = windows.find((entry) => entry.AppUserModelId === "com.notesforwindows.desktop");
  assert.ok(window, "The running Notes window must declare its taskbar app ID");
  assert.deepEqual(window.Errors, []);
  const expectedIcon = path.resolve("dist/icon.ico");
  assert.equal(window.RelaunchIconResource.toLowerCase(), `${expectedIcon},0`.toLowerCase());
  assert.equal(window.RelaunchDisplayNameResource, "Notes for Windows");
  const executable = nativeWindow.executable;
  assert.equal(window.RelaunchCommand, `"${executable}" "${path.resolve(".")}"`);
  for (const size of ["Large", "Small"]) {
    assert.match(window[`${size}IconSource`], /^WM_GETICON\//);
    assert.ok(window[`${size}IconPath`], `The window needs a ${size.toLowerCase()} icon`);
  }
  const iconPixels = await app.evaluate(({ nativeImage }, files) => files.map((file) => {
    const image = nativeImage.createFromPath(file);
    const pixels = image.toBitmap();
    let opaque = 0, yellow = 0, cream = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      // Electron's native bitmap order is BGRA on Windows.
      const [blue, green, red, alpha] = pixels.subarray(i, i + 4);
      if (alpha > 200) {
        opaque++;
        if (red > 160 && green > 100 && blue < 120) yellow++;
        if (red > 190 && green > 180 && blue > 130) cream++;
      }
    }
    return { size: image.getSize(), opaque, yellow, cream };
  }), [window.LargeIconPath, window.SmallIconPath]);
  for (const icon of iconPixels) {
    assert.ok(icon.opaque > 0 && icon.size.width >= 16 && icon.size.height >= 16);
    assert.ok(icon.yellow / icon.opaque > 0.025, "The running icon needs the original yellow header");
    assert.ok(icon.cream / icon.opaque > 0.45, "The running icon needs the original cream paper, not Electron's atom");
  }
  console.log("Native window taskbar identity, relaunch metadata, and original icon pixels: PASS");
}
async function main() {
  const dir = path.resolve("test-results/desktop-" + Date.now());
  await fs.mkdir(dir, { recursive: true });
  const fixture = (await import("../src/lib.mjs")).seedLibrary();
  fixture.settings.remindersInTray = false;
  await fs.writeFile(path.join(dir, "notes-data.json"), JSON.stringify(fixture));
  const app = await electron.launch({
    args: [path.resolve(".")],
    env: {
      ...process.env,
      NODE_ENV: "test",
      NOTES_TEST_HEADLESS: "1",
      NOTES_TEST_USER_DATA: dir,
    },
  });
  const errors = [];
  try {
    const page = await app.firstWindow();
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (msg) => {
      if (msg.type() === "error")
        console.log("Renderer:", msg.text().slice(0, 250));
    });
    await page.getByLabel("Note title").waitFor();
    await assertWindowBranding(app, dir);
    assert.equal(
      await page.getByLabel("Note title").inputValue(),
      "A little room for big ideas",
    );
    await page.getByLabel("Note title").fill("Desktop persistence check");
    await page
      .getByLabel("Note content")
      .fill("Saved by the real Electron IPC bridge.");
    await page.getByText("All changes saved", { exact: true }).waitFor();
    let saved = JSON.parse(
      await fs.readFile(path.join(dir, "notes-data.json"), "utf8"),
    );
    assert.equal(
      saved.notes.find((n) => n.id === "welcome").title,
      "Desktop persistence check",
    );
    await page.reload();
    await page.getByLabel("Note title").waitFor();
    assert.equal(
      await page.getByLabel("Note title").inputValue(),
      "Desktop persistence check",
    );
    await page.screenshot({ path: "test-results/desktop.png" });
    console.log(
      "Desktop renderer, secure protocol, IPC saving, and reload: PASS",
    );
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByLabel("Interface font", { exact: true }).selectOption("roboto");
    await page.getByLabel("Note font", { exact: true }).selectOption("lora");
    const fontFaces = await page.evaluate(async () => ({
      interface: (await document.fonts.load('400 16px "Roboto"')).length,
      note: (await document.fonts.load('400 16px "Lora"')).length,
    }));
    assert.ok(fontFaces.interface > 0 && fontFaces.note > 0);
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await page.getByText("All changes saved", { exact: true }).waitFor();
    saved = JSON.parse(await fs.readFile(path.join(dir, "notes-data.json"), "utf8"));
    assert.equal(saved.settings.fontFamily, "roboto");
    assert.equal(saved.settings.noteFontFamily, "lora");
    console.log("Desktop bundled font loading and font preference saving: PASS");
    await page.getByRole("button", { name: "Lock note", exact: true }).click();
    await page.getByLabel("Password", { exact: true }).fill("desktop-test-password");
    await page.getByLabel("Confirm password", { exact: true }).fill("desktop-test-password");
    await page.getByRole("button", { name: "Lock note", exact: true }).last().click();
    await page.locator(".locked-screen").waitFor();
    await page.getByText("All changes saved", { exact: true }).waitFor();
    for (const filename of ["notes-data.json", "notes-data.json.bak"]) {
      const persisted = await fs.readFile(path.join(dir, filename), "utf8");
      assert.ok(!persisted.includes("Saved by the real Electron IPC bridge."));
    }
    await page.getByRole("button", { name: "Unlock note", exact: true }).click();
    await page.getByLabel("Password", { exact: true }).fill("desktop-test-password");
    await page.getByRole("button", { name: "Unlock note", exact: true }).last().click();
    await page.getByLabel("Note content").waitFor();
    console.log("Desktop encryption and encrypted recovery copy: PASS");
    if (process.argv.includes("--media")) {
      await page
        .getByRole("button", { name: "Add to note", exact: true })
        .click();
      await page
        .getByRole("button", {
          name: "Scan document & recognize text",
          exact: true,
        })
        .click();
      await page
        .locator(".tool-dialog input[type=file]")
        .setInputFiles("tests/fixtures/document.png");
      await page
        .getByRole("button", { name: "Recognize text", exact: true })
        .click();
      await page.waitForFunction(
        () =>
          document.querySelector(".scan-text")?.value ||
          document
            .querySelector(".tool-dialog")
            ?.innerText.includes("Recognition failed"),
        null,
        { timeout: 180000 },
      );
      const ocr = await page.locator(".tool-dialog").innerText();
      console.log("OCR RESULT:", ocr.slice(-1100));
      assert.match(
        await page.locator(".scan-text").inputValue(),
        /NOTES FOR WINDOWS/i,
      );
      await page
        .getByRole("button", { name: "Add to note", exact: true })
        .last()
        .click();
      console.log("Actual image OCR: PASS");
    }
    assert.deepEqual(errors, []);
    const exited = new Promise((resolve) => app.process().once("exit", resolve));
    await page.getByRole("button", { name: "Close app", exact: true }).click();
    await exited;
  } finally {
    await app.close().catch(() => {});
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
