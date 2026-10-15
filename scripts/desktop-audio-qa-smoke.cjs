// Optional integration test: build first, then run with real model downloads.
const { _electron: electron } = require("playwright");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const assert = require("node:assert/strict");

async function main() {
  const requestedDir =
    process.env.NOTES_AUDIO_QA_TEST_PROFILE ||
    path.join(os.tmpdir(), "notes-desktop-audio-qa-smoke");
  const dir = path.resolve(requestedDir);
  const parent = path.dirname(dir).toLowerCase();
  const permittedParents = [
    path.resolve(__dirname, "../test-results"),
    path.resolve(__dirname, "../.cache"),
    path.resolve(os.tmpdir()),
  ].map((value) => value.toLowerCase());
  if (
    !permittedParents.includes(parent) ||
    !/^(notes-desktop-audio-qa-smoke|desktop-audio-qa-\d+)$/i.test(
      path.basename(dir),
    )
  )
    throw new Error(
      "Refusing to overwrite a profile outside the named audio Q&A test directories.",
    );
  await fs.mkdir(dir, { recursive: true });
  if ((await fs.realpath(dir)).toLowerCase() !== dir.toLowerCase())
    throw new Error("Refusing to use a redirected test profile.");
  await fs.writeFile(
    path.join(dir, ".audio-qa-test-profile"),
    "Isolated audio Q&A fixture. Safe to replace during this test.\n",
  );
  const fixture = (await import("../src/lib.mjs")).seedLibrary();
  fixture.settings.remindersInTray = false;
  const source =
    "data:audio/wav;base64," +
    (await fs.readFile("tests/fixtures/speech.wav")).toString("base64");
  const transcript =
    "At the planning meeting, Priya agreed to send the design on Friday. The final project deadline is October 23. We will meet at the Riverside office on Monday at 10 AM.";
  fixture.notes.find((note) => note.id === "welcome").content =
    `<audio controls src="${source}"></audio><h2>Transcript</h2><p>${transcript}</p><h2>Other notes</h2><p>The password is unrelated-source-fixture.</p>`;
  const oldClip = fixture.notes.find(
    (note) => note.id !== "welcome" && !note.locked,
  );
  oldClip.title = "Clip without transcript";
  oldClip.content = `<audio controls src="${source}"></audio><p></p>`;
  await fs.writeFile(
    path.join(dir, "notes-data.json"),
    JSON.stringify(fixture),
  );
  const app = await electron.launch({
    args: [path.resolve(".")],
    env: {
      ...process.env,
      NODE_ENV: "test",
      NOTES_TEST_HEADLESS: "1",
      NOTES_TEST_USER_DATA: dir,
    },
  });
  try {
    const page = await app.firstWindow();
    page.on("pageerror", (error) => console.error("Renderer:", error.message));
    await page.getByLabel("Note title").waitFor();
    async function openQuestions() {
      await page
        .getByRole("button", { name: "Add to note", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Ask about audio", exact: true })
        .click();
    }
    async function ask(question) {
      await page
        .getByLabel("Question about audio", { exact: true })
        .fill(question);
      await page
        .getByRole("button", { name: "Ask audio", exact: true })
        .click();
      await page.waitForFunction(
        () =>
          document.querySelector(".audio-answer") ||
          document
            .querySelector(".audio-question-status")
            ?.textContent.includes("Could not"),
        null,
        { timeout: 480000 },
      );
      const answer = await page.locator(".audio-answer").last().innerText();
      console.log(JSON.stringify({ question, answer }));
      return answer;
    }
    await openQuestions();
    await page.getByText("View saved transcript", { exact: true }).click();
    assert.equal(
      await page.locator(".transcript-reference p").innerText(),
      transcript,
    );
    assert.match(await ask("Who will send the design?"), /Priya/);
    await page
      .getByRole("button", { name: "Add answers to note", exact: true })
      .click();
    assert.equal(await page.locator(".note-prose audio").count(), 1);
    assert.match(
      await page.getByLabel("Note content").innerText(),
      /Possible answer: Priya/,
    );
    await page.getByText("All changes saved", { exact: true }).waitFor();
    await page.context().setOffline(true);
    await openQuestions();
    assert.match(
      await ask("What is the password for the database?"),
      /couldn’t find a confident answer/,
    );
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await page.getByText("Clip without transcript", { exact: true }).click();
    await openQuestions();
    await page.getByLabel("Audio transcript", { exact: true }).fill(transcript);
    assert.match(
      await ask("When is the final project deadline?"),
      /October 23/,
    );
    await page
      .getByRole("button", { name: "Add transcript to note", exact: true })
      .click();
    assert.equal(await page.locator(".note-prose audio").count(), 1);
    assert.match(
      await page.getByLabel("Note content").innerText(),
      /Transcript/,
    );
    assert.match(
      await page.getByLabel("Note content").innerText(),
      /Possible answer: October 23/,
    );
    console.log(
      "Production Electron audio Q&A, source isolation, cached offline model, and saved clip transcription: PASS",
    );
  } finally {
    await app.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
