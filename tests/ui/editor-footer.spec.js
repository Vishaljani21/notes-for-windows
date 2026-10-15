const { test, expect } = require("@playwright/test");

test("note tags stay above the save footer while short and long notes scroll", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByLabel("Note title")).toHaveValue(
    "A little room for big ideas",
  );
  await page
    .getByRole("button", { name: "New note (Ctrl+N)", exact: true })
    .click();
  await page.getByLabel("Note title").fill("Tag footer fixture");
  await page.getByLabel("Note content").fill("A short sample note.");
  const tags = page.getByRole("group", { name: "Note tags", exact: true });
  await tags
    .getByRole("button", { name: "Edit note tags", exact: true })
    .click();
  await page.getByLabel("Tags, separated by commas").fill("footer, sample");
  await page.getByRole("button", { name: "Save tags", exact: true }).click();
  await expect(
    tags.getByRole("button", { name: "# footer", exact: true }),
  ).toBeVisible();
  const shortBounds = await page.locator(".note-tags-bar").boundingBox();
  const statusBounds = await page.locator(".editor-footer").boundingBox();
  expect(
    Math.abs(shortBounds.y + shortBounds.height - statusBounds.y),
  ).toBeLessThan(2);
  await page
    .getByLabel("Note content")
    .fill(
      Array.from(
        { length: 75 },
        (_, index) => `Sample paragraph ${index + 1}.`,
      ).join("\n\n"),
    );
  for (const viewport of [
    { width: 1440, height: 940 },
    { width: 700, height: 600 },
  ]) {
    await page.setViewportSize(viewport);
    const before = await page.locator(".note-tags-bar").boundingBox();
    await page.locator(".editor-scroll").evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect
      .poll(() =>
        page.locator(".editor-scroll").evaluate((element) => element.scrollTop),
      )
      .toBeGreaterThan(100);
    const after = await page.locator(".note-tags-bar").boundingBox();
    expect(Math.abs(before.y - after.y)).toBeLessThan(2);
    await expect(
      tags.getByRole("button", { name: "Edit note tags", exact: true }),
    ).toBeInViewport();
    const scrollBounds = await page.locator(".editor-scroll").boundingBox();
    expect(scrollBounds.y + scrollBounds.height).toBeLessThanOrEqual(
      after.y + 1,
    );
    await page.locator(".editor-scroll").evaluate((element) => {
      element.scrollTop = 0;
    });
  }
});

test("locked notes hide their tag controls", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByLabel("Note title")).toHaveValue(
    "A little room for big ideas",
  );
  await page.getByRole("button", { name: "Lock note", exact: true }).click();
  await page
    .getByLabel("Password", { exact: true })
    .fill("sample-lock-password");
  await page
    .getByLabel("Confirm password", { exact: true })
    .fill("sample-lock-password");
  await page
    .getByRole("button", { name: "Lock note", exact: true })
    .last()
    .click();
  await expect(page.locator(".locked-screen")).toBeVisible();
  await expect(
    page.getByRole("group", { name: "Note tags", exact: true }),
  ).toHaveCount(0);
});
