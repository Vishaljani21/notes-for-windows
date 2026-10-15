const { chooseSelect } = require("./helpers/select.js");
const { test, expect } = require("@playwright/test");

test("interface text size persists and folders remain reachable in compact windows", async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 600 });
  await page.goto("/");
  await expect(page.getByLabel("Note title")).toHaveValue(
    "A little room for big ideas",
  );
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await chooseSelect(page, "Interface text size", "1.2");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Interface text size", exact: true }),
  ).toHaveAttribute("data-value", "1.2");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.setViewportSize({ width: 700, height: 600 });
  await page.getByRole("button", { name: "Show folders", exact: true }).click();
  await expect(page.locator(".sidebar")).toBeVisible();
  await expect(
    page.getByLabel("Search all notes", { exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Show folders", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Control+Shift+f");
  await expect(
    page.getByLabel("Search all notes", { exact: true }),
  ).toBeFocused();
  await page.locator(".folder-main").filter({ hasText: "Travel" }).click();
  await expect(page.getByLabel("Note title")).toHaveValue(
    "A weekend in Copenhagen",
  );
  await expect(
    page.getByRole("button", { name: "Show folders", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".sidebar")).toBeHidden();
});
