const { chooseSelect } = require("./helpers/select.js");
const { test, expect } = require("@playwright/test");

test("every bundled font has a loadable regular face", async ({ page }) => {
  const { FONTS } = await import("../../src/fonts.mjs");
  await page.goto("/");
  await expect(page.getByLabel("Note title")).toBeVisible();
  const families = FONTS.filter((font) => font.bundled).map(
    (font) => font.family,
  );
  const loaded = await page.evaluate(
    async (families) =>
      Promise.all(
        families.map(async (family) => ({
          family,
          faces: (await document.fonts.load(`400 16px "${family}"`)).length,
        })),
      ),
    families,
  );
  expect(loaded.filter((font) => font.faces === 0)).toEqual([]);
});

test("font search, independent note fonts, persistence, and reset work offline", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("tab", { name: "Fonts & writing", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Interface font", exact: true })
    .click();
  await expect(
    page
      .getByRole("listbox", { name: "Interface font", exact: true })
      .getByRole("option"),
  ).toHaveCount(62);
  await page.keyboard.press("Escape");
  await page
    .getByRole("searchbox", {
      name: "Search interface fonts",
      exact: true,
    })
    .fill("roboto");
  await chooseSelect(page, "Interface font", "roboto");
  await page
    .getByRole("searchbox", { name: "Search note fonts", exact: true })
    .fill("lora");
  await chooseSelect(page, "Note font", "lora");
  await expect(
    page.getByLabel("Interface font preview", { exact: true }),
  ).toHaveCSS("font-family", /Roboto/);
  await expect(page.getByLabel("Note font preview", { exact: true })).toHaveCSS(
    "font-family",
    /Lora/,
  );
  await page.evaluate(async () => {
    await document.fonts.load("400 16px Roboto");
    await document.fonts.load("400 16px Lora");
  });
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.getByLabel("Note content")).toHaveCSS(
    "font-family",
    /Lora/,
  );
  await expect(page.locator(".folder-main").first()).toHaveCSS(
    "font-family",
    /Roboto/,
  );
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Note content")).toHaveCSS(
    "font-family",
    /Lora/,
  );
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("tab", { name: "Fonts & writing", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Interface font", exact: true }),
  ).toHaveAttribute("data-value", "roboto");
  await expect(
    page.getByRole("combobox", { name: "Note font", exact: true }),
  ).toHaveAttribute("data-value", "lora");
  await context.setOffline(true);
  await chooseSelect(page, "Interface font", "sans-serif");
  await expect(
    page.getByLabel("Interface font preview", { exact: true }),
  ).toHaveCSS("font-family", /Arial/);
  await page.getByRole("button", { name: "Reset fonts", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Interface font", exact: true }),
  ).toHaveAttribute("data-value", "system");
  await expect(
    page.getByRole("combobox", { name: "Note font", exact: true }),
  ).toHaveAttribute("data-value", "inherit");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.getByLabel("Note content")).toHaveCSS(
    "font-family",
    /Segoe UI/,
  );
});
