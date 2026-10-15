const { _electron: electron } = require("playwright");
const fs = require("node:fs/promises");
const path = require("node:path");
const assert = require("node:assert/strict");
async function main() {
  const dir = path.resolve("test-results/desktop-" + Date.now());
  await fs.mkdir(dir, { recursive: true });
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
      await page
        .getByRole("button", { name: "Add to note", exact: true })
        .click();
      await page
        .getByRole("button", {
          name: "Record or transcribe audio",
          exact: true,
        })
        .click();
      await page
        .locator(".tool-dialog input[type=file]")
        .setInputFiles("tests/fixtures/speech.wav");
      await page
        .getByRole("button", { name: "Transcribe audio", exact: true })
        .click();
      await page.waitForFunction(
        () =>
          document.querySelector(".transcript-area textarea")?.value ||
          /failed|could not|Could not/.test(
            document.querySelector(".transcript-area")?.innerText || "",
          ),
        null,
        { timeout: 240000 },
      );
      console.log(
        "AUDIO RESULT:",
        (await page.locator(".transcript-area").innerText()).slice(-1500),
      );
      assert.match(
        await page.locator(".transcript-area textarea").inputValue(),
        /meeting|windows|notes/i,
      );
      await page
        .getByRole("button", { name: "Add to note", exact: true })
        .last()
        .click();
      console.log("Actual image OCR and Whisper transcription: PASS");
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
