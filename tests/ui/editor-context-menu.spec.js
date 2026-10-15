const { test, expect } = require("@playwright/test");

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByLabel("Note title")).toHaveValue(
    "A little room for big ideas",
  );
  await page
    .getByRole("button", { name: "New note (Ctrl+N)", exact: true })
    .click();
  await page.getByLabel("Note title").fill("Editor context menu fixture");
  await page.getByLabel("Note content").fill("Alpha beta gamma.");
});

async function selectWordAndRightClick(page, word) {
  const point = await page
    .getByLabel("Note content")
    .evaluate((element, word) => {
      element.focus();
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      let text;
      while ((text = walker.nextNode())) {
        const start = text.textContent.indexOf(word);
        if (start < 0) continue;
        const range = document.createRange();
        range.setStart(text, start);
        range.setEnd(text, start + word.length);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        document.dispatchEvent(new Event("selectionchange"));
        const bounds = range.getBoundingClientRect();
        return {
          x: bounds.x + bounds.width / 2,
          y: bounds.y + bounds.height / 2,
        };
      }
      throw new Error(`Missing word ${word}`);
    }, word);
  await expect
    .poll(() => page.evaluate(() => window.getSelection().toString()))
    .toBe(word);
  await page.mouse.click(point.x, point.y, { button: "right" });
  await expect(
    page.getByRole("menu", { name: "Note editor actions", exact: true }),
  ).toBeVisible();
}

test("right-click preserves selected text for formatting and offers list and paragraph styles", async ({
  page,
}) => {
  await selectWordAndRightClick(page, "beta");
  await page.getByRole("menuitem", { name: "Format", exact: true }).hover();
  await page
    .getByRole("menuitemcheckbox", { name: "Bold", exact: true })
    .click();
  await expect(page.locator(".note-prose strong")).toHaveText("beta");
  await expect(
    page.getByRole("menu", { name: "Note editor actions", exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Note content").press("Shift+F10");
  await page.getByRole("menuitem", { name: "Lists", exact: true }).hover();
  await page
    .getByRole("menuitemcheckbox", { name: "Checklist", exact: true })
    .click();
  await expect(
    page.locator('.note-prose ul[data-type="taskList"]'),
  ).toHaveCount(1);
  await page.getByLabel("Note content").press("Shift+F10");
  await page.getByRole("menuitem", { name: "Lists", exact: true }).hover();
  await page
    .getByRole("menuitemcheckbox", { name: "Numbered list", exact: true })
    .click();
  await expect(page.locator(".note-prose ol")).toHaveCount(1);
  await page.getByLabel("Note content").press("Shift+F10");
  await page.getByRole("menuitem", { name: "Text style", exact: true }).hover();
  await page
    .getByRole("menuitemcheckbox", { name: "Heading 3", exact: true })
    .click();
  await expect(page.locator(".note-prose h3")).toContainText(
    "Alpha beta gamma.",
  );
  await page.getByLabel("Note content").press("Shift+F10");
  await page.getByRole("menuitem", { name: "Text style", exact: true }).hover();
  await page
    .getByRole("menuitemcheckbox", { name: "Paragraph", exact: true })
    .click();
  await expect(page.locator(".note-prose h3")).toHaveCount(0);
  await expect(page.getByLabel("Note content")).toContainText(
    "Alpha beta gamma.",
  );
});

test("keyboard menu navigates submenus and Escape restores the editor without changes", async ({
  page,
}) => {
  const editor = page.getByLabel("Note content");
  await editor.focus();
  await editor.press("Shift+F10");
  const menu = page.getByRole("menu", {
    name: "Note editor actions",
    exact: true,
  });
  await expect(menu).toBeVisible();
  await page.keyboard.press("End");
  await expect(
    page.getByRole("menuitem", { name: "Add link…", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(
    page.getByRole("menuitem", { name: "Table", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("menuitem", { name: "Insert table (3 × 3)", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(
    page.getByRole("menuitem", { name: "Table", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(editor).toBeFocused();
  await expect(editor).toHaveText("Alpha beta gamma.");
});

test("right-click outside a selection moves formatting to the clicked paragraph", async ({
  page,
}) => {
  const editor = page.getByLabel("Note content");
  await editor.fill("First paragraph.");
  await editor.press("End");
  await editor.press("Enter");
  await editor.pressSequentially("Second paragraph.");
  await selectWordAndRightClick(page, "First");
  await page.keyboard.press("Escape");
  const second = page.locator(".note-prose p").last();
  await second.click({ button: "right", position: { x: 20, y: 10 } });
  await page.getByRole("menuitem", { name: "Text style", exact: true }).hover();
  await page
    .getByRole("menuitemcheckbox", { name: "Heading 2", exact: true })
    .click();
  await expect(page.locator(".note-prose h2")).toHaveText("Second paragraph.");
  await expect(page.locator(".note-prose p").first()).toHaveText(
    "First paragraph.",
  );
});

test("table actions follow the clicked cell", async ({ page }) => {
  const editor = page.getByLabel("Note content");
  await editor.press("Shift+F10");
  await page.getByRole("menuitem", { name: "Table", exact: true }).hover();
  await page
    .getByRole("menuitem", { name: "Insert table (3 × 3)", exact: true })
    .click();
  await expect(page.locator(".note-prose table tr")).toHaveCount(3);
  await page.locator(".note-prose table td").first().click({ button: "right" });
  await page.getByRole("menuitem", { name: "Table", exact: true }).hover();
  await page
    .getByRole("menuitem", { name: "Add row below", exact: true })
    .click();
  await expect(page.locator(".note-prose table tr")).toHaveCount(4);
});

test("menus and submenus remain inside a small viewport and outside click dismisses", async ({
  page,
}) => {
  await page.setViewportSize({ width: 700, height: 600 });
  await page
    .getByLabel("Note content")
    .fill(
      Array.from({ length: 25 }, (_, index) => `Line ${index + 1}`).join("\n"),
    );
  await page.locator(".editor-scroll").evaluate((element) => {
    element.style.scrollBehavior = "auto";
    element.scrollTop = element.scrollHeight;
  });
  await expect
    .poll(() =>
      page
        .locator(".editor-scroll")
        .evaluate(
          (element) =>
            element.scrollHeight - element.clientHeight - element.scrollTop,
        ),
    )
    .toBeLessThan(1);
  const editorBounds = await page.getByLabel("Note content").boundingBox();
  const scrollBounds = await page.locator(".editor-scroll").boundingBox();
  const point = {
    x: Math.min(690, editorBounds.x + editorBounds.width - 5),
    y:
      Math.min(
        editorBounds.y + editorBounds.height,
        scrollBounds.y + scrollBounds.height,
      ) - 8,
  };
  expect(
    await page.evaluate(
      ({ x, y }) => !!document.elementFromPoint(x, y)?.closest(".note-prose"),
      point,
    ),
  ).toBe(true);
  await page.mouse.click(point.x, point.y, { button: "right" });
  const menu = page.getByRole("menu", {
    name: "Note editor actions",
    exact: true,
  });
  await expect(menu).toBeVisible();
  await page.getByRole("menuitem", { name: "Text style", exact: true }).hover();
  await expect(
    page.getByRole("menu", { name: "Text style", exact: true }),
  ).toBeVisible();
  for (const element of await page.locator(".notes-context-menu").all()) {
    const bounds = await element.boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(7);
    expect(bounds.y).toBeGreaterThanOrEqual(7);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(693);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(593);
  }
  await page.screenshot({
    path: "test-results/editor-context-menu-compact.png",
  });
  await page.getByLabel("Note title").click();
  await expect(menu).toHaveCount(0);
  await expect(page.getByLabel("Note title")).toBeFocused();
});

test("blocked clipboard paste reports how to continue instead of editing the note", async ({
  page,
}) => {
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        read: () =>
          Promise.reject(new DOMException("Denied", "NotAllowedError")),
      },
    });
  });
  await page.getByLabel("Note content").focus();
  await page.getByLabel("Note content").press("Shift+F10");
  await page.getByRole("menuitem", { name: "Paste", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Clipboard access was blocked. Use Ctrl+V",
  );
  await expect(page.getByLabel("Note content")).toHaveText("Alpha beta gamma.");
});

test("keyboard settings and search dismiss the editor menu when focus moves", async ({
  page,
}) => {
  const editor = page.getByLabel("Note content");
  const menu = page.getByRole("menu", {
    name: "Note editor actions",
    exact: true,
  });
  await editor.focus();
  await editor.press("Shift+F10");
  await expect(menu).toBeVisible();
  await page.keyboard.press("Control+,");
  const settings = page.getByRole("dialog", { name: "Settings", exact: true });
  await expect(settings).toBeVisible();
  await expect(settings.getByRole("tab", { name: "Appearance", exact: true })).toBeFocused();
  await expect(menu).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(settings).toHaveCount(0);
  await editor.focus();
  await editor.press("Shift+F10");
  await expect(menu).toBeVisible();
  await page.keyboard.press("Control+Shift+F");
  await expect(page.getByLabel("Search all notes", { exact: true })).toBeFocused();
  await expect(menu).toHaveCount(0);
  await expect(editor).toHaveText("Alpha beta gamma.");
});
