// Optional real-model smoke test. Downloads about 86 MB on the first run.
// Uses an isolated temporary browser profile; no personal notes are loaded.
const { chromium } = require("@playwright/test");
const { spawn } = require("node:child_process");
const path = require("node:path");
const os = require("node:os");
const assert = require("node:assert/strict");

async function main() {
  const base = process.env.AUDIO_QA_TEST_URL || "http://127.0.0.1:5179";
  let server;
  let context;
  try {
    const available = await fetch(base)
      .then((result) => result.ok)
      .catch(() => false);
    if (!available) {
      server = spawn(
        process.execPath,
        [
          "node_modules/vite/bin/vite.js",
          "--host",
          "127.0.0.1",
          "--port",
          new URL(base).port,
          "--strictPort",
        ],
        {
          cwd: path.resolve(__dirname, ".."),
          stdio: ["ignore", "pipe", "pipe"],
          windowsHide: true,
        },
      );
      server.stderr.on("data", (data) =>
        console.error("Vite:", data.toString()),
      );
      for (let index = 0; index < 60; index++) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        if (
          await fetch(base)
            .then((result) => result.ok)
            .catch(() => false)
        )
          break;
      }
    }
    context = await chromium.launchPersistentContext(
      path.join(os.tmpdir(), "notes-audio-qa-smoke-browser"),
      { headless: true, channel: process.env.CI ? undefined : "chrome" },
    );
    const page = await context.newPage();
    page.on("console", (message) => {
      if (message.type() === "error") console.error(message.text());
    });
    page.on("pageerror", (error) =>
      console.error("Browser page error:", error.message),
    );
    await page.route(base + "/__audio_qa_smoke__", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<!doctype html><title>Isolated audio Q&A smoke</title>",
      }),
    );
    await page.goto(base + "/__audio_qa_smoke__");
    async function prepare() {
      await page.evaluate(
        () =>
          new Promise((resolve, reject) => {
            window.qaSmokeWorker = new Worker(
              "/src/audioqa.worker.js?worker_file&type=module",
              {
                type: "module",
              },
            );
            window.qaSmokeWorker.onerror = (event) =>
              reject(new Error(event.message));
            window.qaSmokeWorker.onmessage = ({ data }) => {
              if (data.status === "ready") resolve();
            };
          }),
      );
    }
    async function ask(question, transcript, id) {
      const started = Date.now();
      const result = await page.evaluate(
        ({ question, transcript, id }) =>
          new Promise((resolve, reject) => {
            const timeout = setTimeout(
              () =>
                reject(new Error("Question model timed out after 8 minutes.")),
              480000,
            );
            window.qaSmokeWorker.onerror = (event) => {
              clearTimeout(timeout);
              reject(new Error(event.message));
            };
            window.qaSmokeWorker.onmessage = ({ data }) => {
              if (data.id !== id) return;
              if (data.status === "error") {
                clearTimeout(timeout);
                reject(new Error(data.message));
              }
              if (data.status === "complete") {
                clearTimeout(timeout);
                resolve(data.result);
              }
            };
            window.qaSmokeWorker.postMessage({ question, transcript, id });
          }),
        { question, transcript, id },
      );
      console.log(
        JSON.stringify({
          question,
          result,
          seconds: (Date.now() - started) / 1000,
        }),
      );
      return result;
    }
    const transcript =
      "At the planning meeting, Priya agreed to send the design on Friday. The final project deadline is October 23. We will meet at the Riverside office on Monday at 10 AM.";
    await prepare();
    const answer = await ask("Who will send the design?", transcript, 1);
    assert.match(answer?.answer || "", /Priya/i);
    assert.ok(transcript.includes(answer.quote));
    const absent = await ask(
      "What is the password for the database?",
      transcript,
      2,
    );
    assert.equal(absent, null);
    await page.evaluate(() => window.qaSmokeWorker.terminate());
    // Load the application module before disconnecting; inference must reload
    // model weights from Cache Storage in a fresh worker.
    await prepare();
    await context.setOffline(true);
    const offline = await ask(
      "When is the final project deadline?",
      transcript,
      3,
    );
    assert.match(offline?.answer || "", /October 23/i);
    console.log("Audio Q&A real-model and cached offline smoke passed.");
  } finally {
    if (context) await context.close();
    server?.kill();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
