const { test, expect } = require("@playwright/test");

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByLabel("Note title", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "New note (Ctrl+N)", exact: true })
    .click();
  await page
    .getByLabel("Note title", { exact: true })
    .fill("A note with two sections");
  const editor = page.getByLabel("Note content", { exact: true });
  await editor.fill("First section.");
  await editor.press("End");
  await editor.press("Enter");
  await editor.pressSequentially("Second section.");
});

test("toolbar divider uses the writing position, supports undo and redo, and persists", async ({
  page,
}) => {
  const editor = page.getByLabel("Note content", { exact: true });
  await editor.press("Home");
  await page.getByRole("button", { name: "Text style", exact: true }).click();
  await page
    .getByRole("button", { name: "Horizontal divider", exact: true })
    .click();
  await expect(editor.locator("hr")).toHaveCount(1);
  await expect(editor.locator("p")).toHaveText([
    "First section.",
    "Second section.",
  ]);
  expect(
    await editor.evaluate((element) =>
      [...element.children].map((node) => node.tagName),
    ),
  ).toEqual(["P", "HR", "P"]);
  const dividerWidth = await editor.locator("hr").evaluate((element) => ({
    line: element.getBoundingClientRect().width,
    content: element.parentElement.clientWidth,
    border: getComputedStyle(element).borderTopWidth,
  }));
  expect(
    Math.abs(dividerWidth.line - dividerWidth.content),
  ).toBeLessThanOrEqual(1);
  expect(dividerWidth.border).toBe("1px");
  await editor.press("Control+z");
  await expect(editor.locator("hr")).toHaveCount(0);
  await expect(editor.locator("p")).toHaveText([
    "First section.",
    "Second section.",
  ]);
  await editor.press("Control+y");
  await expect(editor.locator("hr")).toHaveCount(1);
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.locator('.note-card[title="A note with two sections"]').click();
  await expect(editor.locator("hr")).toHaveCount(1);
  await expect(editor.locator("p")).toHaveText([
    "First section.",
    "Second section.",
  ]);
});

test("right-click Insert adds a divider at the clicked paragraph and leaves writing ready", async ({
  page,
}) => {
  const editor = page.getByLabel("Note content", { exact: true });
  const point = await editor
    .locator("p")
    .last()
    .evaluate((paragraph) => {
      const text = paragraph.firstChild;
      const range = document.createRange();
      range.setStart(text, text.textContent.length);
      range.collapse(true);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      const bounds = range.getBoundingClientRect();
      return { x: bounds.left + 1, y: bounds.top + bounds.height / 2 };
    });
  await page.mouse.click(point.x, point.y, { button: "right" });
  await expect(
    page.getByRole("menu", { name: "Note editor actions", exact: true }),
  ).toBeVisible();
  await page.getByRole("menuitem", { name: "Insert", exact: true }).hover();
  await page
    .getByRole("menuitem", { name: "Horizontal divider", exact: true })
    .click();
  await expect(editor.locator("hr")).toHaveCount(1);
  expect(
    await editor.evaluate((element) =>
      [...element.children].map((node) => node.tagName),
    ),
  ).toEqual(["P", "P", "HR", "P"]);
  await expect(editor).toBeFocused();
  await editor.pressSequentially("Another thought below the line.");
  await expect(editor.locator("p").last()).toHaveText(
    "Another thought below the line.",
  );
  await expect(editor.locator("p").first()).toHaveText("First section.");
  await expect(editor.locator("p").nth(1)).toHaveText("Second section.");
});
