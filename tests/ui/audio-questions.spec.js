const { test, expect } = require("@playwright/test");

async function mockQuestionWorker(page) {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.audioQaTerminations = 0;
    window.Worker = class {
      constructor(url, options) {
        if (!String(url).includes("audioqa.worker"))
          return new NativeWorker(url, options);
      }
      postMessage(message) {
        this.timer = setTimeout(
          () => {
            if (message.question.includes("failure"))
              this.onmessage?.({
                data: {
                  id: message.id,
                  status: "error",
                  message: "Fixture model unavailable.",
                },
              });
            else
              this.onmessage?.({
                data: {
                  id: message.id,
                  status: "complete",
                  result: message.question.includes("password")
                    ? null
                    : {
                        answer: "Priya",
                        quote: "Priya will send the design on Friday.",
                        score: 0.96,
                      },
                },
              });
          },
          message.question.includes("slow") ? 3000 : 150,
        );
      }
      terminate() {
        clearTimeout(this.timer);
        window.audioQaTerminations++;
      }
    };
  });
}

async function openAudio(page) {
  await page.goto("/");
  await expect(page.getByLabel("Note title")).toBeVisible();
  await page
    .getByRole("button", { name: "New note (Ctrl+N)", exact: true })
    .click();
  await page.getByLabel("Note title").fill("Audio QA fixture");
  await page
    .getByRole("button", { name: "Record or import audio", exact: true })
    .click();
  await page
    .locator(".tool-dialog input[type=file]")
    .setInputFiles("tests/fixtures/speech.wav");
}

async function waitForSavedAudio(page) {
  await expect(page.locator(".note-prose audio")).toHaveCount(1);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise((resolve, reject) => {
            const request = indexedDB.open("notes-for-windows", 1);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
              const database = request.result;
              const read = database
                .transaction("library")
                .objectStore("library")
                .get("data");
              read.onerror = () => {
                database.close();
                reject(read.error);
              };
              read.onsuccess = () => {
                const note = read.result?.notes.find(
                  (item) => item.title === "Audio QA fixture",
                );
                database.close();
                resolve((note?.content.match(/<audio\b/g) || []).length === 1);
              };
            };
          }),
      ),
    )
    .toBe(true);
}

test("audio questions save answers with quotes and reuse the saved transcript", async ({
  page,
}) => {
  await mockQuestionWorker(page);
  await openAudio(page);
  const transcript = "Priya will send the design on Friday.";
  await page.getByLabel("Audio transcript", { exact: true }).fill(transcript);
  await page
    .getByLabel("Question about audio", { exact: true })
    .fill("Who will send the design?");
  await page.getByRole("button", { name: "Ask audio", exact: true }).click();
  await expect(page.locator(".audio-answer blockquote")).toHaveText(transcript);
  await page
    .getByRole("button", { name: "Add to note", exact: true })
    .last()
    .click();
  await expect(page.getByLabel("Note content")).toContainText(
    "Possible answer: Priya",
  );
  await expect(page.locator(".note-prose audio")).toHaveCount(1);
  await waitForSavedAudio(page);
  await page.reload();
  await expect(page.getByLabel("Note title")).toHaveValue("Audio QA fixture");
  await page.getByRole("button", { name: "Add to note", exact: true }).click();
  await page
    .getByRole("button", { name: "Ask about audio", exact: true })
    .click();
  await page.getByText("View saved transcript", { exact: true }).click();
  await expect(page.locator(".transcript-reference p")).toHaveText(transcript);
  await page
    .getByLabel("Question about audio", { exact: true })
    .fill("Who will send the design?");
  await page.getByRole("button", { name: "Ask audio", exact: true }).click();
  await expect(page.locator(".audio-answer blockquote")).toHaveText(transcript);
  await page
    .getByRole("button", { name: "Add answers to note", exact: true })
    .click();
  await expect(page.locator(".note-prose audio")).toHaveCount(1);
  await page.getByRole("button", { name: "Add to note", exact: true }).click();
  await page
    .getByRole("button", { name: "Ask about audio", exact: true })
    .click();
  await page
    .getByLabel("Question about audio", { exact: true })
    .fill("What is the database password?");
  await page.getByRole("button", { name: "Ask audio", exact: true }).click();
  await expect(page.locator(".audio-answer")).toContainText(
    "couldn’t find a confident answer",
  );
  await expect(
    page.getByRole("button", { name: "Add answers to note", exact: true }),
  ).toBeDisabled();
});

test("saved clips gain transcripts without duplicating audio, and question work can be cancelled or retried", async ({
  page,
}) => {
  await mockQuestionWorker(page);
  await openAudio(page);
  await page
    .getByRole("button", { name: "Add to note", exact: true })
    .last()
    .click();
  await waitForSavedAudio(page);
  await page.reload();
  await expect(page.getByLabel("Note title")).toHaveValue("Audio QA fixture");
  await page.getByRole("button", { name: "Add to note", exact: true }).click();
  await page
    .getByRole("button", { name: "Ask about audio", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Ask about your audio", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Audio transcript", { exact: true })
    .fill("Priya will send the design on Friday.");
  await page
    .getByLabel("Question about audio", { exact: true })
    .fill("slow question");
  await page.getByRole("button", { name: "Ask audio", exact: true }).click();
  await page
    .getByRole("button", { name: "Cancel question", exact: true })
    .click();
  await expect(page.locator(".audio-question-status")).toContainText(
    "Question cancelled",
  );
  await expect
    .poll(() => page.evaluate(() => window.audioQaTerminations))
    .toBeGreaterThan(0);
  await page
    .getByLabel("Question about audio", { exact: true })
    .fill("slow question");
  await page.getByRole("button", { name: "Ask audio", exact: true }).click();
  await page.getByLabel("Audio transcript", { exact: true }).fill("");
  await expect(
    page.getByRole("button", { name: "Record audio", exact: true }),
  ).toBeEnabled();
  await page
    .getByLabel("Audio transcript", { exact: true })
    .fill("Priya will send the design on Friday.");
  await page
    .getByLabel("Question about audio", { exact: true })
    .fill("model failure");
  await page.getByRole("button", { name: "Ask audio", exact: true }).click();
  await expect(page.locator(".audio-question-status")).toContainText(
    "Fixture model unavailable",
  );
  await expect(
    page.getByRole("button", { name: "Ask audio", exact: true }),
  ).toBeEnabled();
  await page
    .getByLabel("Question about audio", { exact: true })
    .fill("Who will send the design?");
  await page.getByRole("button", { name: "Ask audio", exact: true }).click();
  await expect(page.locator(".audio-answer p")).toHaveText("Priya");
  await page
    .getByRole("button", { name: "Add transcript to note", exact: true })
    .click();
  await expect(page.locator(".note-prose audio")).toHaveCount(1);
  await expect(page.getByLabel("Note content")).toContainText("Transcript");
  await expect(page.getByLabel("Note content")).toContainText(
    "Possible answer: Priya",
  );
});
