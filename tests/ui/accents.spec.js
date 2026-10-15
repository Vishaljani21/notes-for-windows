const { test, expect } = require("@playwright/test");

test("normal and neon accents apply immediately, persist, and reset", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByLabel("Note title")).toBeVisible();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Settings", exact: true });
  await dialog.getByRole("button", { name: "Dark", exact: true }).click();
  await dialog
    .getByRole("button", { name: "Neon colors", exact: true })
    .click();
  await dialog.getByRole("radio", { name: "Neon cyan", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-accent",
    "neon-cyan",
  );
  await expect(
    dialog.getByRole("button", { name: "Done", exact: true }),
  ).toHaveCSS("background-color", "rgb(54, 237, 255)");
  await expect(
    dialog.getByRole("radio", { name: "Neon cyan", exact: true }),
  ).toHaveAttribute("aria-checked", "true");
  await page.screenshot({ path: "test-results/accents-neon-dark.png" });
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute(
    "data-accent",
    "neon-cyan",
  );
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(
    dialog.getByRole("radio", { name: "Neon cyan", exact: true }),
  ).toHaveAttribute("aria-checked", "true");
  await dialog
    .getByRole("button", { name: "Normal colors", exact: true })
    .click();
  await dialog.getByRole("radio", { name: "Rose", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-accent", "rose");
  await dialog
    .getByRole("button", { name: "Reset accent", exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute("data-accent", "amber");
  await expect(
    dialog.getByRole("radio", { name: "Amber", exact: true }),
  ).toHaveAttribute("aria-checked", "true");
});

test("accent choices support keyboard navigation in light mode", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByLabel("Note title")).toBeVisible();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Settings", exact: true });
  await dialog.getByRole("radio", { name: "Amber", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    dialog.getByRole("radio", { name: "Coral", exact: true }),
  ).toBeFocused();
  await expect(page.locator("html")).toHaveAttribute("data-accent", "coral");
  await page.keyboard.press("End");
  await expect(
    dialog.getByRole("radio", { name: "Slate", exact: true }),
  ).toBeFocused();
  await dialog
    .getByRole("button", { name: "Neon colors", exact: true })
    .click();
  await dialog.getByRole("radio", { name: "Neon lime", exact: true }).click();
  await page.screenshot({ path: "test-results/accents-neon-light.png" });
  await expect(
    dialog.getByRole("button", { name: "Done", exact: true }),
  ).toHaveCSS("color", "rgb(33, 31, 27)");
});
