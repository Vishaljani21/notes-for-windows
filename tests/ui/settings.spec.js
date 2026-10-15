const { test, expect } = require("@playwright/test");

async function openSettings(page) {
  await page.goto("/");
  await expect(page.getByLabel("Note title")).toBeVisible();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Settings", exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function expectCategory(dialog, name) {
  const tab = dialog.getByRole("tab", { name, exact: true });
  await expect(tab).toHaveAttribute("aria-selected", "true");
  await expect(dialog.getByRole("tab", { selected: true })).toHaveCount(1);
  await expect(dialog.getByRole("tabpanel")).toHaveCount(1);
  await expect(dialog.getByRole("tabpanel", { name, exact: true })).toBeVisible();
}

test("settings categories support keyboard navigation and keep dialog focus contained", async ({ page }) => {
  const dialog = await openSettings(page);
  await expectCategory(dialog, "Appearance");
  await expect(dialog.getByRole("tab")).toHaveCount(4);
  const appearance = dialog.getByRole("tab", { name: "Appearance", exact: true });
  await appearance.focus();
  for (const [key, name] of [
    ["ArrowDown", "Fonts & writing"],
    ["End", "Data & backup"],
    ["ArrowLeft", "Reminders"],
    ["ArrowRight", "Data & backup"],
    ["ArrowUp", "Reminders"],
    ["Home", "Appearance"],
  ]) {
    await page.keyboard.press(key);
    await expectCategory(dialog, name);
    await expect(dialog.getByRole("tab", { name, exact: true })).toBeFocused();
  }
  await expect(dialog.getByRole("tab", { name: "Fonts & writing", exact: true }))
    .toHaveAttribute("tabindex", "-1");
  await expect(appearance).toHaveAttribute("tabindex", "0");
  // Exercise both ends of the trap without relying on the visual layout or DOM
  // order of the close and navigation controls.
  await dialog.getByRole("button", { name: "Done", exact: true }).focus();
  for (let step = 0; step < 12; step++) {
    await page.keyboard.press("Tab");
    await expect.poll(() => dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  }
  for (let step = 0; step < 12; step++) {
    await page.keyboard.press("Shift+Tab");
    await expect.poll(() => dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Settings", exact: true })).toBeFocused();
});

test("appearance applies immediately and backup controls are easy to find", async ({ page }) => {
  const dialog = await openSettings(page);
  const dark = dialog.getByRole("button", { name: "Dark", exact: true });
  await dark.click();
  await expect(dark).toHaveAttribute("aria-pressed", "true");
  await expect(dialog.getByRole("button", { name: "Light", exact: true })).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.screenshot({ path: "test-results/settings-dark-desktop.png" });
  await dialog.getByRole("tab", { name: "Data & backup", exact: true }).click();
  await expectCategory(dialog, "Data & backup");
  await expect(dialog.getByRole("button", { name: "Export backup", exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Import backup", exact: true })).toBeVisible();
  await dialog.getByRole("tab", { name: "Appearance", exact: true }).click();
  await expect(dark).toHaveAttribute("aria-pressed", "true");
  await dialog.getByRole("button", { name: "Light", exact: true }).click();
  await page.screenshot({ path: "test-results/settings-light-desktop.png" });
  await dialog.getByRole("tab", { name: "Fonts & writing", exact: true }).click();
  await expectCategory(dialog, "Fonts & writing");
  await expect(dialog.getByLabel("Interface font", { exact: true })).toBeVisible();
  await expect(dialog.getByLabel("Note font", { exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/settings-fonts-desktop.png" });
});

test("large text settings keep navigation and Done reachable in compact windows", async ({ page }) => {
  const dialog = await openSettings(page);
  await dialog.getByLabel("Interface text size", { exact: true }).selectOption("1.2");
  for (const [viewport, screenshot] of [
    [{ width: 900, height: 600 }, "test-results/settings-compact-large-text.png"],
    [{ width: 460, height: 620 }, "test-results/settings-narrow-large-text.png"],
  ]) {
    await page.setViewportSize(viewport);
    await dialog.getByRole("tab", { name: "Fonts & writing", exact: true }).click();
    await expectCategory(dialog, "Fonts & writing");
    const done = dialog.getByRole("button", { name: "Done", exact: true });
    const close = dialog.getByRole("button", { name: "Close dialog", exact: true });
    await expect(done).toBeInViewport({ ratio: 1 });
    await expect(close).toBeInViewport({ ratio: 1 });
    for (const name of ["Appearance", "Fonts & writing", "Reminders", "Data & backup"]) {
      await expect(dialog.getByRole("tab", { name, exact: true })).toBeInViewport({ ratio: 1 });
    }
    const footerBefore = await done.boundingBox();
    const content = dialog.locator(".settings-content");
    await content.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await expect(dialog.getByRole("slider", { name: /Editor text size/ })).toBeInViewport({ ratio: 1 });
    const footerAfter = await done.boundingBox();
    expect(Math.abs(footerAfter.y - footerBefore.y)).toBeLessThan(1);
    const bounds = await dialog.evaluate((element) => ({
      horizontalOverflow: element.scrollWidth - element.clientWidth,
      outerScroll: element.scrollTop,
      height: element.getBoundingClientRect().height,
    }));
    expect(bounds.horizontalOverflow).toBeLessThanOrEqual(1);
    expect(bounds.outerScroll).toBe(0);
    expect(bounds.height).toBeLessThanOrEqual(viewport.height);
    await content.evaluate((element) => { element.scrollTop = 0; });
    await page.screenshot({ path: screenshot });
    await dialog.getByRole("tab", { name: "Reminders", exact: true }).click();
    await expectCategory(dialog, "Reminders");
    await expect(done).toBeInViewport({ ratio: 1 });
    await dialog.getByRole("tab", { name: "Appearance", exact: true }).click();
    await expect(dialog.getByLabel("Interface text size", { exact: true })).toHaveValue("1.2");
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});
