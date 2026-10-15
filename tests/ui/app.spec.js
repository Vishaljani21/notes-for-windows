const { test, expect } = require("@playwright/test");
const { chooseSelect } = require("./helpers/select.js");
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByLabel("Note title")).toHaveValue(
    "A little room for big ideas",
  );
});
async function menu(page, label, item) {
  await page.getByRole("button", { name: label, exact: true }).click();
  await page.getByRole("button", { name: item, exact: true }).click();
}
test("renders the notebook, edits a note, persists a checklist and table after reload", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.screenshot({
    path: "test-results/notes-light.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "New note (Ctrl+N)", exact: true })
    .click();
  await page.getByLabel("Note title").fill("Test a real note");
  await page.getByLabel("Note content").fill("An idea worth keeping.");
  await page.getByRole("button", { name: "Checklist", exact: true }).click();
  await expect(
    page.locator('.note-prose ul[data-type="taskList"]'),
  ).toHaveCount(1);
  await page.locator('.note-prose input[type="checkbox"]').check();
  await page.getByLabel("Note content").press("End");
  await page.getByLabel("Note content").press("Enter");
  await page.getByLabel("Note content").press("Enter");
  await page
    .getByRole("button", { name: "Insert or edit table", exact: true })
    .click();
  await expect(page.locator(".note-prose table")).toHaveCount(1);
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page
    .locator(".note-card")
    .filter({ hasText: "Test a real note" })
    .click();
  await expect(page.getByLabel("Note content")).toContainText(
    "An idea worth keeping.",
  );
  await expect(page.locator(".note-prose table")).toHaveCount(1);
  await expect(
    page.locator('.note-prose input[type="checkbox"]').first(),
  ).toBeChecked();
  expect(errors).toEqual([]);
});
test("creates nested folders and a tag-based smart folder, searches content, deletes and restores", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "New Folder", exact: true })
    .last()
    .click();
  await page.getByLabel("Folder name").fill("Projects");
  await page
    .getByRole("button", { name: "Create folder", exact: true })
    .click();
  await page
    .getByRole("button", { name: "New Folder", exact: true })
    .last()
    .click();
  await page.getByLabel("Folder name").fill("Autumn");
  await chooseSelect(page, "Inside", { label: "Projects" });
  await page
    .getByRole("button", { name: "Create folder", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Expand Projects", exact: true })
    .click();
  await expect(
    page.locator(".folder-main").filter({ hasText: "Autumn" }),
  ).toBeVisible();
  await menu(page, "More note options", "Edit tags");
  await page.getByLabel("Tags, separated by commas").fill("testing, today");
  await page.getByRole("button", { name: "Save tags", exact: true }).click();
  await page
    .getByRole("button", { name: "New Folder", exact: true })
    .last()
    .click();
  await page.getByLabel("Folder name").fill("Testing collection");
  await page
    .getByRole("checkbox", { name: "Smart Folder", exact: true })
    .check();
  await page.getByLabel("Match tag").fill("testing");
  await page
    .getByRole("button", { name: "Create folder", exact: true })
    .click();
  await page
    .locator(".folder-main")
    .filter({ hasText: "Testing collection" })
    .click();
  await expect(page.locator(".note-card")).toHaveCount(1);
  await page.getByLabel("Search all notes").fill("cardamom");
  await expect(page.locator(".note-card")).toHaveCount(1);
  await page.locator(".note-card").click();
  await expect(page.getByLabel("Note title")).toHaveValue(
    "A weekend in Copenhagen",
  );
  await page.getByRole("button", { name: "Delete note", exact: true }).click();
  await page.getByRole("button", { name: /Recently Deleted/ }).click();
  await page.locator(".note-card").first().click();
  await expect(
    page.getByRole("button", { name: "Restore note", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Restore note", exact: true }).click();
  await expect(page.getByLabel("Note title")).toHaveValue(
    "A weekend in Copenhagen",
  );
});
test("locks, decrypts, edits, and re-locks without leaving content plaintext in storage", async ({
  page,
}) => {
  await page.getByLabel("Note content").fill("This is highly private content.");
  await page.getByRole("button", { name: "Lock note", exact: true }).click();
  await page.getByLabel("Password", { exact: true }).fill("abcdef123");
  await page.getByLabel("Confirm password", { exact: true }).fill("abcdef123");
  await page
    .getByRole("button", { name: "Lock note", exact: true })
    .last()
    .click();
  await expect(page.locator(".locked-screen")).toBeVisible();
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
  const stored = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const open = indexedDB.open("notes-for-windows", 1);
        open.onsuccess = () => {
          const r = open.result
            .transaction("library")
            .objectStore("library")
            .get("data");
          r.onsuccess = () => resolve(JSON.stringify(r.result));
        };
      }),
  );
  expect(stored).not.toContain("highly private content");
  await page.getByRole("button", { name: "Unlock note", exact: true }).click();
  await page.getByLabel("Password", { exact: true }).fill("wrong");
  await page
    .getByRole("button", { name: "Unlock note", exact: true })
    .last()
    .click();
  await expect(page.locator(".form-error")).toBeVisible();
  await page.getByLabel("Password", { exact: true }).fill("abcdef123");
  await page
    .getByRole("button", { name: "Unlock note", exact: true })
    .last()
    .click();
  await expect(page.getByLabel("Note content")).toContainText(
    "highly private content",
  );
  await page.getByLabel("Note content").fill("A revised secret.");
  await menu(page, "Note lock options", "Close this locked note");
  await expect(page.locator(".locked-screen")).toBeVisible();
  // The locked screen appears before the debounced save commits.
  const { decryptNote } = await import("../../src/lib.mjs");
  await expect
    .poll(async () => {
      const saved = await page.evaluate(
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
                database.close();
                resolve(
                  read.result?.notes.find((note) => note.id === "welcome"),
                );
              };
            };
          }),
      );
      if (!saved?.encrypted) return null;
      const payload = await decryptNote(saved.encrypted, "abcdef123");
      return {
        locked: saved.locked,
        content: saved.content,
        tags: saved.tags,
        decrypted: payload.content,
      };
    })
    .toEqual({
      locked: true,
      content: "",
      tags: [],
      decrypted: expect.stringContaining("A revised secret."),
    });
  await page.reload();
  await page.getByRole("button", { name: "Unlock note", exact: true }).click();
  await page.getByLabel("Password", { exact: true }).fill("abcdef123");
  await page
    .getByRole("button", { name: "Unlock note", exact: true })
    .last()
    .click();
  await expect(page.getByLabel("Note content")).toContainText(
    "A revised secret.",
  );
});
test("calculates math, links notes, inserts a collapsible section and supports dark mode", async ({
  page,
}) => {
  await menu(page, "Add to note", "Math & equations");
  await page.getByLabel("Expression", { exact: true }).fill("(125 + 85) / 3");
  await page.getByRole("button", { name: "Calculate", exact: true }).click();
  await expect(page.locator(".math-result")).toContainText("70");
  await page
    .getByRole("button", { name: "Add to note", exact: true })
    .last()
    .click();
  await expect(page.getByLabel("Note content")).toContainText(
    "(125 + 85) / 3 = 70",
  );
  await menu(page, "Add to note", "Link to a note or website");
  await page
    .getByLabel("Search your notes, or paste a website link")
    .fill("Copenhagen");
  await page.locator(".note-link-picker button").click();
  await expect(
    page.locator('.note-prose a[href="note:copenhagen"]'),
  ).toBeVisible();
  await page.locator('.note-prose a[href="note:copenhagen"]').click();
  await expect(page.getByLabel("Note title")).toHaveValue(
    "A weekend in Copenhagen",
  );
  await menu(page, "Text style", "Collapsible section");
  await expect(page.locator('.note-prose [data-type="details"]')).toHaveCount(
    1,
  );
  await page.locator('.note-prose [data-type="details"]>button').click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.screenshot({
    path: "test-results/notes-dark.png",
    fullPage: true,
  });
});
test("OCR and attachment tools open; attached files persist; summaries use note sentences", async ({
  page,
}) => {
  await menu(page, "Add to note", "Scan document & recognize text");
  await expect(
    page.getByRole("heading", { name: "From paper to possibility" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  const chooser = page.waitForEvent("filechooser");
  await menu(page, "Add to note", "Attach a file");
  await (
    await chooser
  ).setFiles({
    name: "hello.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Keep this file safe"),
  });
  await expect(page.locator(".note-prose .attachment")).toContainText(
    "hello.txt",
  );
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator(".note-prose .attachment")).toContainText(
    "hello.txt",
  );
  await menu(page, "More note options", "Quick summary");
  await expect(page.locator(".summary-content li").first()).toBeVisible();
});
