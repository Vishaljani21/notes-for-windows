const { test, expect } = require("@playwright/test");

const welcomeTitle = "A little room for big ideas";
const travelTitle = "A weekend in Copenhagen";
const card = (page, title) => page.locator(".note-card").filter({ has: page.locator("strong", { hasText: title }) });
const actions = (page) => page.getByRole("menu", { name: "Note actions", exact: true });

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByLabel("Note title", { exact: true })).toHaveValue(welcomeTitle);
});

async function savedNotes(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open("notes-for-windows", 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const value = database.transaction("library").objectStore("library").get("data");
      value.onerror = () => reject(value.error);
      value.onsuccess = () => { database.close(); resolve(value.result?.notes || []); };
    };
  }));
}

test("card actions target the clicked note, with recoverable delete and permanent-delete confirmation", async ({ page }) => {
  await card(page, travelTitle).click({ button: "right" });
  await expect(actions(page)).toBeVisible();
  await expect(page.getByLabel("Note title", { exact: true })).toHaveValue(welcomeTitle);
  await actions(page).getByRole("menuitem", { name: "Delete note", exact: true }).click();
  await expect(card(page, travelTitle)).toHaveCount(0);
  await expect(page.getByLabel("Note title", { exact: true })).toHaveValue(welcomeTitle);
  await expect.poll(async () => (await savedNotes(page)).find((note) => note.id === "copenhagen")?.deletedAt).toBeGreaterThan(0);
  expect((await savedNotes(page)).find((note) => note.id === "welcome").deletedAt).toBeNull();

  await page.getByRole("button", { name: /Recently Deleted/ }).click();
  await card(page, travelTitle).click({ button: "right" });
  await expect(actions(page).getByRole("menuitem", { name: "Restore note", exact: true })).toBeVisible();
  await expect(actions(page).getByRole("menuitem", { name: "Duplicate note", exact: true })).toHaveCount(0);
  await actions(page).getByRole("menuitem", { name: "Delete permanently…", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Delete this note permanently?", exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(card(page, travelTitle)).toBeVisible();
  await card(page, travelTitle).click({ button: "right" });
  await actions(page).getByRole("menuitem", { name: "Restore note", exact: true }).click();
  await expect(page.getByLabel("Note title", { exact: true })).toHaveValue(travelTitle);
  await expect.poll(async () => (await savedNotes(page)).find((note) => note.id === "copenhagen")?.deletedAt).toBeNull();
});

test("pinning, duplicate, and card keyboard menus use the target note and dismiss accessibly", async ({ page }) => {
  const travel = card(page, travelTitle);
  await travel.focus();
  await page.keyboard.press("Shift+F10");
  await expect(actions(page)).toBeVisible();
  await expect(actions(page).getByRole("menuitem", { name: "Open note", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(actions(page)).toHaveCount(0);
  await expect(travel).toBeFocused();
  await expect(page.getByLabel("Note title", { exact: true })).toHaveValue(welcomeTitle);
  await travel.click({ button: "right" });
  await actions(page).getByRole("menuitem", { name: "Unpin note", exact: true }).click();
  await expect.poll(async () => (await savedNotes(page)).find((note) => note.id === "copenhagen")?.pinned).toBe(false);
  await travel.click({ button: "right" });
  await expect(actions(page).getByRole("menuitem", { name: "Pin note", exact: true })).toBeVisible();
  await actions(page).getByRole("menuitem", { name: "Duplicate note", exact: true }).click();
  await expect(page.getByLabel("Note title", { exact: true })).toHaveValue(travelTitle + " — Copy");
  await expect.poll(async () => (await savedNotes(page)).filter((note) => note.title === travelTitle + " — Copy").length).toBe(1);
  const notes = await savedNotes(page);
  const original = notes.find((note) => note.id === "copenhagen");
  const duplicate = notes.find((note) => note.title === travelTitle + " — Copy");
  // Opening the copy lets Tiptap normalize list paragraphs and table markup.
  // Compare the actual text and structured content rather than serialized HTML.
  const content = await page.evaluate(({ original, duplicate }) => {
    const describe = (html) => {
      const document = new DOMParser().parseFromString(html, "text/html");
      return {
        text: document.body.textContent,
        headings: [...document.querySelectorAll("h1,h2,h3")].map((node) => node.textContent),
        tables: [...document.querySelectorAll("table")].map((node) => [...node.querySelectorAll("tr")].map((row) => [...row.children].map((cell) => cell.textContent))),
        checklists: [...document.querySelectorAll('[data-type="taskItem"]')].map((node) => ({ checked: node.dataset.checked, text: node.textContent })),
      };
    };
    return { original: describe(original), duplicate: describe(duplicate) };
  }, { original: original.content, duplicate: duplicate.content });
  expect(content.duplicate).toEqual(content.original);
  expect(duplicate.tags).toEqual(original.tags);
  expect(duplicate.reminderAt).toBeNull();
  expect(duplicate.reminderNotifiedAt).toBeNull();
  expect(duplicate.id).not.toBe(original.id);
  await card(page, welcomeTitle).click({ button: "right" });
  await page.getByRole("heading", { name: "All Notes", exact: true }).click();
  await expect(actions(page)).toHaveCount(0);
});

test("card dialogs select their target and closed locked notes protect their contents", async ({ page }) => {
  await card(page, travelTitle).click({ button: "right" });
  await actions(page).getByRole("menuitem", { name: "Edit tags…", exact: true }).click();
  await expect(page.getByLabel("Note title", { exact: true })).toHaveValue(travelTitle);
  await expect(page.getByRole("dialog").getByLabel("Tags, separated by commas")).toHaveValue("travel, personal");
  await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
  await card(page, welcomeTitle).click({ button: "right" });
  await actions(page).getByRole("menuitem", { name: "Lock note…", exact: true }).click();
  await page.getByLabel("Password", { exact: true }).fill("context-menu-fixture-password");
  await page.getByLabel("Confirm password", { exact: true }).fill("context-menu-fixture-password");
  await page.getByRole("dialog").getByRole("button", { name: "Lock note", exact: true }).click();
  await expect(page.locator(".locked-screen")).toBeVisible();
  await card(page, travelTitle).click();
  await card(page, welcomeTitle).click({ button: "right" });
  for (const name of ["Duplicate note", "Edit tags…", "Set reminder…"]) {
    await expect(actions(page).getByRole("menuitem", { name, exact: true })).toBeDisabled();
  }
  await expect(actions(page).getByRole("menuitem", { name: "Move to folder…", exact: true })).toBeEnabled();
  await actions(page).getByRole("menuitem", { name: "Unlock note…", exact: true }).click();
  await expect(page.locator(".locked-screen")).toBeVisible();
  await page.getByLabel("Password", { exact: true }).fill("context-menu-fixture-password");
  await page.getByRole("dialog").getByRole("button", { name: "Unlock note", exact: true }).click();
  await expect(page.locator(".locked-screen")).toHaveCount(0);
  await card(page, welcomeTitle).click({ button: "right" });
  await expect(actions(page).getByRole("menuitem", { name: "Duplicate note", exact: true })).toBeDisabled();
  await expect(actions(page).getByRole("menuitem", { name: "Edit tags…", exact: true })).toBeEnabled();
  await actions(page).getByRole("menuitem", { name: "Close locked note", exact: true }).click();
  await expect(page.locator(".locked-screen")).toBeVisible();
  await expect.poll(async () => (await savedNotes(page)).find((note) => note.id === "welcome")?.locked).toBe(true);
  const locked = (await savedNotes(page)).find((note) => note.id === "welcome");
  expect(locked.content).toBe("");
  expect(locked.tags).toEqual([]);
  expect(locked.encrypted.data).toBeTruthy();
  expect((await savedNotes(page)).filter((note) => note.title.includes("— Copy"))).toHaveLength(0);
});
