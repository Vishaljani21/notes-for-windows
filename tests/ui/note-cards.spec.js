const { test, expect } = require("@playwright/test");

const longTitle =
  "A small space for the ideas I want to make time for this weekend";

async function useCardFixture(
  page,
  { theme = "light", view = "list", uiScale = 1 } = {},
) {
  await page.goto("/");
  const library = await page.evaluate(async () => {
    const { seedLibrary, encryptNote } = await import("/src/lib.mjs");
    const data = seedLibrary();
    data.notes = data.notes.slice(0, 4);
    const [empty, journal, locked, project] = data.notes;
    empty.title =
      "A small space for the ideas I want to make time for this weekend";
    empty.content = "<p></p>";
    empty.tags = ["weekend-plans-and-little-ideas"];
    empty.reminderAt = Date.now() + 3600000;
    empty.pinned = true;
    journal.title = "A few things worth keeping";
    journal.content =
      "<p>Walk by the river, try a new recipe, and leave a little room for an unexpected idea.</p>";
    journal.pinned = false;
    locked.title = "Private journal";
    locked.content = "";
    locked.tags = [];
    locked.locked = true;
    locked.encrypted = await encryptNote(
      {
        content: "<p>Fictional private content must stay hidden.</p>",
        tags: ["private"],
      },
      "fictional-card-password",
    );
    project.title = "A fresh start";
    project.content =
      "<p>Clear the desk. Gather a few references. Make something small and useful.</p>";
    data.folders.find((folder) => folder.id === "notes").name =
      "Personal notebook with a longer folder name";
    return data;
  });
  Object.assign(library.settings, { theme, view, uiScale });
  await page.addInitScript((fixture) => {
    window.__cardFixture = fixture;
    window.desktop = {
      load: async () => structuredClone(window.__cardFixture),
      save: async (data) => {
        window.__cardFixture = structuredClone(data);
      },
      onReminder: () => () => {},
      onReminderError: () => () => {},
      onOpenNote: () => () => {},
      onShortcut: () => () => {},
      onBeforeClose: () => () => {},
    };
  }, library);
  await page.reload();
  await expect(page.getByLabel("Note title", { exact: true })).toHaveValue(
    longTitle,
  );
  await expect(page.locator(".note-card")).toHaveCount(4);
  await expect(page.locator(".list-save-status")).toContainText(
    "Saved locally",
  );
}

test("card preview snapshots use fictional notes in light and dark themes", async ({
  page,
}) => {
  for (const theme of ["light", "dark"]) {
    await useCardFixture(page, { theme });
    await page
      .locator(".notes-panel")
      .screenshot({
        path: `test-results/note-cards-${process.env.CARD_CAPTURE_STAGE || "after"}-${theme}.png`,
      });
  }
});

test("list cards keep titles and metadata contained at larger text sizes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1000, height: 800 });
  await useCardFixture(page, { theme: "dark", uiScale: 1.2 });
  const selected = page.locator(".note-card.selected");
  await expect(selected.locator("strong")).toHaveAttribute("title", longTitle);
  await expect(selected.locator(".note-card-preview")).toHaveClass(/is-empty/);
  await expect(selected.locator(".note-card-preview")).toHaveText(
    "No additional text",
  );
  await expect(
    selected.getByLabel("Pinned note", { exact: true }),
  ).toBeVisible();
  await expect(
    selected.getByLabel("Has reminder", { exact: true }),
  ).toBeVisible();
  const geometry = await page.locator(".note-card").evaluateAll((cards) =>
    cards.map((card) => ({
      cardOverflow: card.scrollWidth - card.clientWidth,
      headingOverflow:
        card.querySelector(".note-card-heading").scrollWidth -
        card.querySelector(".note-card-heading").clientWidth,
      footerOverflow:
        card.querySelector(".note-card-footer").scrollWidth -
        card.querySelector(".note-card-footer").clientWidth,
      radius: getComputedStyle(card).borderRadius,
    })),
  );
  for (const item of geometry) {
    expect(item.cardOverflow).toBeLessThanOrEqual(1);
    expect(item.headingOverflow).toBeLessThanOrEqual(1);
    expect(item.footerOverflow).toBeLessThanOrEqual(1);
    expect(parseFloat(item.radius)).toBeGreaterThanOrEqual(8);
  }
  const locked = page.locator('.note-card[title="Private journal"]');
  await expect(locked.getByLabel("Locked note", { exact: true })).toBeVisible();
  await expect(locked.locator(".note-card-preview")).toHaveText("Locked note");
  await expect(page.locator(".notes-scroll")).not.toContainText(
    "Fictional private content",
  );
  await selected.focus();
  await page.keyboard.press("Shift+F10");
  await expect(
    page.getByRole("menu", { name: "Note actions", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(selected).toBeFocused();
});

test("gallery cards retain previews and readable metadata without horizontal overflow", async ({
  page,
}) => {
  await useCardFixture(page, { theme: "light", view: "gallery", uiScale: 1.2 });
  await expect(page.locator(".app")).toHaveClass(/gallery-view/);
  const overflow = await page
    .locator(".note-card")
    .evaluateAll((cards) =>
      cards.map((card) => ({
        width: card.scrollWidth - card.clientWidth,
        footer:
          card.querySelector(".note-card-footer").scrollWidth -
          card.querySelector(".note-card-footer").clientWidth,
      })),
    );
  for (const item of overflow) {
    expect(item.width).toBeLessThanOrEqual(1);
    expect(item.footer).toBeLessThanOrEqual(1);
  }
  await page
    .locator(".notes-panel")
    .screenshot({ path: "test-results/note-cards-gallery.png" });
});
