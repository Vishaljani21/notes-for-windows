const { test, expect } = require("@playwright/test");

test("reminder picker keeps its actions visible while compact content scrolls", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByLabel("Note title")).toBeVisible();
  await page.getByRole("button", { name: "Set reminder", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "Remind me", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "In 1 hour", exact: true })).toHaveAttribute("aria-pressed", "true");
  await dialog.getByRole("button", { name: "Tomorrow, 9 AM", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Tomorrow, 9 AM", exact: true })).toHaveAttribute("aria-pressed", "true");
  const chosen = await dialog.getByLabel("Date and time", { exact: true }).inputValue();
  await expect(dialog.locator(".reminder-selection-preview")).not.toContainText("Choose a date and time");
  await page.screenshot({ path: "test-results/reminder-picker-desktop.png" });
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Interface text size", { exact: true }).selectOption("1.2");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "Set reminder", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Remind me", exact: true });
  for (const [viewport, screenshot] of [
    [{ width: 900, height: 600 }, "test-results/reminder-picker-compact.png"],
    [{ width: 460, height: 620 }, "test-results/reminder-picker-narrow.png"],
  ]) {
    await page.setViewportSize(viewport);
    const save = dialog.getByRole("button", { name: "Save reminder", exact: true });
    await expect(save).toBeInViewport({ ratio: 1 });
    await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeInViewport({ ratio: 1 });
    await expect(dialog.getByRole("button", { name: "Close dialog", exact: true })).toBeInViewport({ ratio: 1 });
    const before = await save.boundingBox();
    const content = dialog.locator(".reminder-dialog-content");
    await content.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    const after = await save.boundingBox();
    expect(Math.abs(before.y - after.y)).toBeLessThan(1);
    expect(await dialog.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    await expect(dialog).toContainText("Keep this tab open for in-app reminders");
    await content.evaluate((element) => { element.scrollTop = 0; });
    await page.screenshot({ path: screenshot });
  }
  await dialog.getByRole("button", { name: "Tomorrow, 9 AM", exact: true }).click();
  await expect(dialog.getByLabel("Date and time", { exact: true })).toHaveValue(chosen);
  await dialog.getByRole("button", { name: "Save reminder", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Edit reminder", exact: true })).toBeVisible();
});

test("reminder popup fits long titles and retains working actions at its native size", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 370 });
  await page.addInitScript(() => {
    let items = [{ id: "long-title", title: "A long reminder title that should remain readable without pushing either of its actions out of the notification window or changing the size of the native popup", reminderAt: Date.now(), isTest: false }];
    let listener;
    window.__popupActions = [];
    window.__popupRendered = [];
    window.__emitPopupItems = (next) => { items = next; listener(items); };
    window.reminderAlert = {
      ready: async () => items,
      onItems: (callback) => { listener = callback; return () => {}; },
      rendered: (ids) => { window.__popupRendered = ids; },
      open: (id) => { window.__popupActions.push({ action: "open", id }); items = items.filter((item) => item.id !== id); listener(items); },
      dismiss: (id) => { window.__popupActions.push({ action: "dismiss", id }); items = items.filter((item) => item.id !== id); listener(items); },
    };
  });
  await page.goto("/electron/reminder-alert.html");
  const open = page.getByRole("button", { name: "Open note", exact: true });
  await expect(open).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole("button", { name: "Dismiss", exact: true })).toBeInViewport({ ratio: 1 });
  await expect(page.locator(".due-copy")).toContainText("Due");
  await expect.poll(() => page.evaluate(() => window.__popupRendered)).toEqual(["long-title"]);
  expect(await page.locator("main").evaluate((element) => element.scrollHeight - element.clientHeight)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: "test-results/reminder-popup-long-title.png" });
  await open.click();
  await expect.poll(() => page.evaluate(() => window.__popupActions)).toEqual([{ action: "open", id: "long-title" }]);
  await page.evaluate(() => window.__emitPopupItems([
    { id: "first", title: "A queued reminder with another long title that needs three lines while keeping its actions visible above the second waiting reminder in the same native popup", reminderAt: Date.now(), isTest: false },
    { id: "test", title: "Notes reminder test", reminderAt: Date.now(), isTest: true },
  ]));
  await expect(page.locator("#reminder-count")).toHaveText("2 waiting");
  await expect(page.getByRole("button", { name: "Open note", exact: true })).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole("button", { name: "Dismiss", exact: true }).first()).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole("heading", { name: "Notes reminder test", exact: true })).toHaveCount(1);
  await page.getByRole("button", { name: "Dismiss", exact: true }).first().click();
  await expect(page.locator("#reminder-count")).toBeHidden();
  await expect(page.getByRole("button", { name: "Open Notes", exact: true })).toBeInViewport({ ratio: 1 });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.screenshot({ path: "test-results/reminder-popup-dark.png" });
  await page.getByRole("button", { name: "Dismiss", exact: true }).click();
  await expect(page.locator("article")).toHaveCount(0);
});
