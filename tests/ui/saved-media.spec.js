const { test, expect } = require("@playwright/test");

test("audio tools are removed while older saved clips survive editing and reload", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByLabel("Note title")).toHaveValue("A little room for big ideas");
  const source = "data:audio/wav;base64," + Buffer.from(
    "524946462600000057415645666d74201000000001000100401f0000803e00000200100064617461020000000000",
    "hex",
  ).toString("base64");
  await expect(page.getByText("All changes saved", { exact: true })).toBeVisible();
  await page.evaluate((source) => new Promise((resolve, reject) => {
    const request = indexedDB.open("notes-for-windows", 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction("library", "readwrite");
      transaction.onerror = () => reject(transaction.error);
      transaction.oncomplete = () => { database.close(); resolve(); };
      const store = transaction.objectStore("library");
      const read = store.get("data");
      read.onsuccess = () => {
        const library = read.result;
        library.notes.find((note) => note.id === "welcome").content =
          `<p>Previously saved recording.</p><audio controls src="${source}"></audio><p>Keep this note.</p>`;
        store.put(library, "data");
      };
    };
  }), source);
  await page.reload();
  const audio = page.locator(".note-prose audio");
  await expect(audio).toHaveAttribute("src", source);
  await expect(page.getByRole("button", { name: "Record or import audio", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Add to note", exact: true }).click();
  await expect(page.getByRole("button", { name: "Record or transcribe audio", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Ask about audio", exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.getByLabel("Note content").press("Control+End");
  await page.keyboard.press("Enter");
  await page.keyboard.insertText("Edited after removing audio tools.");
  await expect.poll(() => page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open("notes-for-windows", 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const read = database.transaction("library").objectStore("library").get("data");
      read.onerror = () => reject(read.error);
      read.onsuccess = () => {
        database.close();
        resolve(read.result?.notes.find((note) => note.id === "welcome")?.content || "");
      };
    };
  }))).toContain("Edited after removing audio tools.");
  await page.reload();
  await expect(audio).toHaveCount(1);
  await expect(audio).toHaveAttribute("src", source);
  await expect(page.getByLabel("Note content")).toContainText("Edited after removing audio tools.");
});
