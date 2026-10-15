const { test, expect } = require("@playwright/test");

async function settings(page) {
  await page.goto("/");
  await expect(page.getByLabel("Note title")).toBeVisible({ timeout: 15000 });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  return page.getByRole("dialog", { name: "Settings", exact: true });
}

test("custom dropdown supports keyboard choice and Escape keeps Settings open", async ({
  page,
}) => {
  const dialog = await settings(page);
  const control = dialog.getByRole("combobox", {
    name: "Interface text size",
    exact: true,
  });
  await control.focus();
  await page.keyboard.press("ArrowDown");
  const list = dialog.getByRole("listbox", {
    name: "Interface text size",
    exact: true,
  });
  await expect(list).toBeVisible();
  await expect(control).toBeFocused();
  await page.keyboard.press("End");
  await expect(control).toHaveAttribute(
    "aria-activedescendant",
    await list
      .getByRole("option", { name: "Extra large", exact: true })
      .getAttribute("id"),
  );
  await page.keyboard.press("Enter");
  await expect(control).toHaveAttribute("data-value", "1.2");
  await expect(control).toHaveText("Extra large");
  await expect(list).toHaveCount(0);
  await control.click();
  await page.keyboard.press("Escape");
  await expect(list).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await expect(control).toBeFocused();
});

test("font dropdown groups options, supports typeahead, and retains the current font for empty search results", async ({
  page,
}) => {
  const dialog = await settings(page);
  await dialog
    .getByRole("tab", { name: "Fonts & writing", exact: true })
    .click();
  const control = dialog.getByRole("combobox", {
    name: "Interface font",
    exact: true,
  });
  await control.click();
  const list = dialog.getByRole("listbox", {
    name: "Interface font",
    exact: true,
  });
  await expect(list.getByRole("option")).toHaveCount(62);
  await expect(
    list.getByRole("group", { name: "Sans serif", exact: true }),
  ).toBeVisible();
  await page.keyboard.type("roboto");
  await page.keyboard.press("Enter");
  await expect(control).toHaveAttribute("data-value", "roboto");
  await dialog
    .getByRole("searchbox", { name: "Search interface fonts", exact: true })
    .fill("not-a-real-font");
  await expect(
    dialog.getByRole("status").filter({ hasText: "No matches" }),
  ).toBeVisible();
  await control.click();
  await expect(list.getByRole("option")).toHaveCount(1);
  await expect(
    list.getByRole("option", { name: "Roboto (current)", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
});

test("compact font dropdown stays inside the viewport and closes when another field receives focus", async ({
  page,
}) => {
  const dialog = await settings(page);
  await page.setViewportSize({ width: 460, height: 620 });
  await dialog
    .getByRole("tab", { name: "Fonts & writing", exact: true })
    .click();
  const control = dialog.getByRole("combobox", {
    name: "Note font",
    exact: true,
  });
  await control.click();
  const list = dialog.getByRole("listbox", { name: "Note font", exact: true });
  await expect(list).toBeVisible();
  const bounds = await list.boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(7);
  expect(bounds.y).toBeGreaterThanOrEqual(7);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(453);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(613);
  expect(
    await dialog.evaluate((element) =>
      element.contains(document.querySelector('[role="listbox"]')),
    ),
  ).toBe(true);
  await page.screenshot({ path: "test-results/select-compact-fonts.png" });
  await dialog
    .getByRole("searchbox", { name: "Search note fonts", exact: true })
    .focus();
  await expect(list).toHaveCount(0);
  await expect(
    dialog.getByRole("searchbox", { name: "Search note fonts", exact: true }),
  ).toBeFocused();
});
