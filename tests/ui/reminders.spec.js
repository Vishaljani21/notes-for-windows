const { test, expect } = require("@playwright/test");

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByLabel("Note title")).toHaveValue(
    "A little room for big ideas",
  );
});

async function readReminder(page) {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open("notes-for-windows", 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const value = database
            .transaction("library")
            .objectStore("library")
            .get("data");
          value.onerror = () => reject(value.error);
          value.onsuccess = () => {
            const note = value.result?.notes.find((item) => item.id === "welcome");
            database.close();
            resolve({
              reminderAt: note?.reminderAt ?? null,
              reminderNotifiedAt: note?.reminderNotifiedAt ?? null,
            });
          };
        };
      }),
  );
}

async function saveTomorrow(page) {
  await page.getByRole("button", { name: "Set reminder", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("button", { name: "Tomorrow, 9 AM", exact: true })
    .click();
  const time = await dialog.getByLabel("Date and time", { exact: true }).inputValue();
  await dialog.getByRole("button", { name: "Save reminder", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Edit reminder", exact: true })).toBeVisible();
  await expect.poll(() => readReminder(page)).toMatchObject({
    reminderAt: expect.any(Number),
    reminderNotifiedAt: null,
  });
  return time;
}

test("creates, edits, persists, and removes a note reminder", async ({ page }) => {
  const initialTime = await saveTomorrow(page);
  const original = await readReminder(page);
  await page.reload();
  const banner = page.getByRole("button", { name: "Edit reminder", exact: true });
  await expect(banner).toBeVisible();
  await banner.click();
  let dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Date and time", { exact: true })).toHaveValue(initialTime);
  await dialog
    .getByRole("button", { name: "In a week, 9 AM", exact: true })
    .click();
  const editedTime = await dialog.getByLabel("Date and time", { exact: true }).inputValue();
  expect(editedTime).not.toBe(initialTime);
  await dialog.getByRole("button", { name: "Save reminder", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(async () => (await readReminder(page)).reminderAt).toBeGreaterThan(original.reminderAt);
  await page.reload();
  await banner.click();
  dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Date and time", { exact: true })).toHaveValue(editedTime);
  await dialog.getByRole("button", { name: "Remove reminder", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(banner).toHaveCount(0);
  await expect.poll(() => readReminder(page)).toEqual({
    reminderAt: null,
    reminderNotifiedAt: null,
  });
  await page.reload();
  await expect(banner).toHaveCount(0);
  await page.getByRole("button", { name: "Set reminder", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Remind me", exact: true })).toBeVisible();
});

test("rejects past or empty dates and explains how browser reminders work", async ({ page }) => {
  await page.getByRole("button", { name: "Set reminder", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Keep this tab open for in-app reminders");
  const input = dialog.getByLabel("Date and time", { exact: true });
  await input.fill("2020-01-01T09:00");
  await dialog.getByRole("button", { name: "Save reminder", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("future");
  await expect(input).toHaveAttribute("aria-invalid", "true");
  await input.fill("");
  await dialog.getByRole("button", { name: "Save reminder", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("valid date");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("button", { name: "Edit reminder", exact: true })).toHaveCount(0);
  expect(await readReminder(page)).toEqual({ reminderAt: null, reminderNotifiedAt: null });
});

test("reminders cannot be edited while a note is locked or deleted and survive restoration", async ({ page }) => {
  await saveTomorrow(page);
  const original = await readReminder(page);
  const reminderButton = page.getByRole("button", { name: "Set reminder", exact: true });
  await page.getByRole("button", { name: "Lock note", exact: true }).click();
  await page.getByLabel("Password", { exact: true }).fill("reminder-fixture-password");
  await page.getByLabel("Confirm password", { exact: true }).fill("reminder-fixture-password");
  await page.getByRole("dialog").getByRole("button", { name: "Lock note", exact: true }).click();
  await expect(page.locator(".locked-screen")).toBeVisible();
  await expect(reminderButton).toBeDisabled();
  await page.getByRole("button", { name: "Unlock note", exact: true }).click();
  await page.getByLabel("Password", { exact: true }).fill("reminder-fixture-password");
  await page.getByRole("dialog").getByRole("button", { name: "Unlock note", exact: true }).click();
  await expect(reminderButton).toBeEnabled();
  await page.getByRole("button", { name: "Delete note", exact: true }).click();
  await page.getByRole("button", { name: /Recently Deleted/ }).click();
  await page.locator(".note-card").filter({ hasText: "A little room for big ideas" }).click();
  await expect(page.getByRole("button", { name: "Restore note", exact: true })).toBeVisible();
  await expect(reminderButton).toBeDisabled();
  await page.getByRole("button", { name: "Restore note", exact: true }).click();
  await expect(reminderButton).toBeEnabled();
  await expect.poll(() => readReminder(page)).toEqual(original);
  await expect(page.getByRole("button", { name: "Edit reminder", exact: true })).toBeVisible();
});

async function useDesktopFixture(page, { due = false } = {}) {
  const fixture = await page.evaluate(async () => (await import("/src/lib.mjs")).seedLibrary());
  if (due) {
    const note = fixture.notes.find((item) => item.id === "welcome");
    note.reminderAt = Date.now() - 120000;
    note.reminderNotifiedAt = note.reminderAt + 1000;
  }
  await page.addInitScript((library) => {
    window.__desktopLibrary = library;
    window.__retryRequests = [];
    window.desktop = {
      load: async () => structuredClone(window.__desktopLibrary),
      save: async (data) => { window.__desktopLibrary = structuredClone(data); },
      onReminder: (callback) => { window.__emitReminder = callback; return () => {}; },
      onReminderError: (callback) => { window.__emitReminderError = callback; return () => {}; },
      onOpenNote: () => () => {},
      onShortcut: () => () => {},
      onBeforeClose: () => () => {},
      testReminder: () => new Promise((resolve) => { window.__resolveTestReminder = resolve; }),
      retryReminder: async (noteId) => { window.__retryRequests.push(noteId); return { ok: true, reminderNotifiedAt: null }; },
    };
  }, fixture);
  await page.reload();
  await expect(page.getByLabel("Note title")).toHaveValue("A little room for big ideas");
  return fixture.notes.find((item) => item.id === "welcome");
}

test("the desktop test alert waits for delivery and keeps failures visible", async ({ page }) => {
  await useDesktopFixture(page);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: "Reminders", exact: true }).click();
  await dialog.getByRole("button", { name: "Test reminder alert", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Showing test alert…", exact: true })).toBeDisabled();
  await expect(dialog.getByRole("status")).toContainText("Waiting for the test alert");
  await expect(dialog).not.toContainText("Windows displayed the test reminder");
  await page.evaluate(() => window.__resolveTestReminder({ ok: false, error: "Neither Windows nor the Notes alert could be displayed. Try again." }));
  await expect(dialog.getByRole("alert")).toContainText("Neither Windows nor the Notes alert");
  await expect(dialog.getByRole("button", { name: "Test reminder alert", exact: true })).toBeEnabled();
  await dialog.getByRole("button", { name: "Test reminder alert", exact: true }).click();
  await page.evaluate(() => window.__resolveTestReminder({ ok: true, channel: "app" }));
  await expect(dialog.getByRole("status")).toContainText("opened in a Notes popup");
  await expect(dialog.getByRole("alert")).toHaveCount(0);
});

test("a missed desktop reminder can be shown again and delivery failures stay actionable", async ({ page }) => {
  const original = await useDesktopFixture(page, { due: true });
  const recoveredAt = original.reminderNotifiedAt + 1000;
  await page.evaluate(({ reminderAt, deliveredAt }) => window.__emitReminder({ noteId: "welcome", reminderAt, deliveredAt }), { reminderAt: original.reminderAt, deliveredAt: recoveredAt });
  await expect.poll(() => page.evaluate(() => window.__desktopLibrary.notes.find((note) => note.id === "welcome").reminderNotifiedAt)).toBe(recoveredAt);
  await page.getByRole("button", { name: "Edit reminder", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Show reminder again", exact: true }).click();
  await expect(dialog.getByRole("status")).toContainText("Reminder queued again");
  await expect.poll(() => page.evaluate(() => window.__retryRequests)).toEqual(["welcome"]);
  await expect.poll(() => page.evaluate(() => window.__desktopLibrary.notes.find((note) => note.id === "welcome").reminderNotifiedAt)).toBeNull();
  await page.evaluate((reminderAt) => window.__emitReminderError({ noteId: "welcome", reminderAt, message: "The reminder could not be displayed. Try showing it again." }), original.reminderAt);
  await expect(dialog.getByRole("alert")).toContainText("could not be displayed");
  expect(await page.evaluate(() => window.__desktopLibrary.notes.find((note) => note.id === "welcome").reminderNotifiedAt)).toBeNull();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.locator(".reminder-delivery-error")).toBeVisible();
  await page.getByRole("button", { name: "Review reminder", exact: true }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Show reminder again", exact: true })).toBeVisible();
  const deliveredAt = Date.now();
  await page.evaluate(({ reminderAt, deliveredAt }) => window.__emitReminder({ noteId: "welcome", reminderAt, deliveredAt }), { reminderAt: original.reminderAt, deliveredAt });
  await expect(page.locator(".reminder-delivery-error")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.__desktopLibrary.notes.find((note) => note.id === "welcome").reminderNotifiedAt)).toBe(deliveredAt);
  await page.evaluate(({ reminderAt, deliveredAt }) => window.__emitReminder({ noteId: "welcome", reminderAt, deliveredAt }), { reminderAt: original.reminderAt, deliveredAt: original.reminderNotifiedAt });
  await expect.poll(() => page.evaluate(() => window.__desktopLibrary.notes.find((note) => note.id === "welcome").reminderNotifiedAt)).toBe(deliveredAt);
});
