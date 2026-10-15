const { test, expect } = require("@playwright/test");
const { chooseSelect } = require("./helpers/select");

async function openReminder(page) {
  await page.goto("/");
  await expect(page.getByLabel("Note title")).toBeVisible();
  await page.getByRole("button", { name: "Set reminder", exact: true }).click();
  return page.getByRole("dialog", { name: "Remind me", exact: true });
}

test("custom reminder calendar handles month boundaries, time, and reversible drafts", async ({
  page,
}) => {
  const reminder = await openReminder(page);
  const input = reminder.getByLabel("Date and time", { exact: true });
  await input.fill("2028-01-31T09:15");
  await reminder
    .getByRole("button", { name: "Choose date and time", exact: true })
    .click();
  let picker = page.getByRole("dialog", {
    name: "Choose date and time",
    exact: true,
  });
  await expect(
    picker.getByRole("grid", { name: "January 2028", exact: true }),
  ).toBeVisible();
  await expect(
    picker.getByRole("gridcell", {
      name: "Monday, January 31, 2028",
      exact: true,
    }),
  ).toBeFocused();
  await page.keyboard.press("ArrowRight");
  const february = picker.getByRole("gridcell", {
    name: "Tuesday, February 1, 2028",
    exact: true,
  });
  await expect(february).toBeFocused();
  await expect(
    picker.getByRole("grid", { name: "February 2028", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(february).toHaveAttribute("aria-selected", "true");
  await picker.getByRole("spinbutton", { name: "Hour", exact: true }).fill("7");
  await picker
    .getByRole("spinbutton", { name: "Minute", exact: true })
    .fill("05");
  await picker.getByRole("button", { name: "PM", exact: true }).click();
  await picker
    .getByRole("button", { name: "Apply date and time", exact: true })
    .click();
  await expect(picker).toHaveCount(0);
  await expect(input).toHaveValue("2028-02-01T19:05");
  const trigger = reminder.getByRole("button", {
    name: "Choose date and time",
    exact: true,
  });
  await expect(trigger).toBeFocused();
  await trigger.click();
  picker = page.getByRole("dialog", {
    name: "Choose date and time",
    exact: true,
  });
  await picker.getByRole("button", { name: "Next month", exact: true }).click();
  await expect(
    picker.getByRole("grid", { name: "March 2028", exact: true }),
  ).toBeVisible();
  await picker
    .getByRole("gridcell", { name: "Friday, March 10, 2028", exact: true })
    .click();
  await picker.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(input).toHaveValue("2028-02-01T19:05");
  await reminder
    .getByRole("button", { name: "Save reminder", exact: true })
    .click();
  await expect(reminder).toHaveCount(0);
  await page
    .getByRole("button", { name: "Edit reminder", exact: true })
    .click();
  await expect(page.getByLabel("Date and time", { exact: true })).toHaveValue(
    "2028-02-01T19:05",
  );
});

test("calendar keyboard navigation and Escape stay inside the reminder workflow", async ({
  page,
}) => {
  const reminder = await openReminder(page);
  const input = reminder.getByLabel("Date and time", { exact: true });
  await input.fill("2028-01-31T09:15");
  await input.focus();
  await page.keyboard.press("Alt+ArrowDown");
  const picker = page.getByRole("dialog", {
    name: "Choose date and time",
    exact: true,
  });
  await page.keyboard.press("PageDown");
  await expect(
    picker.getByRole("gridcell", {
      name: "Tuesday, February 29, 2028",
      exact: true,
    }),
  ).toBeFocused();
  await page.keyboard.press("Home");
  await expect(
    picker.getByRole("gridcell", {
      name: "Sunday, February 27, 2028",
      exact: true,
    }),
  ).toBeFocused();
  await page.keyboard.press("End");
  await expect(
    picker.getByRole("gridcell", {
      name: "Saturday, March 4, 2028",
      exact: true,
    }),
  ).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(
    picker.getByRole("gridcell", {
      name: "Saturday, February 26, 2028",
      exact: true,
    }),
  ).toBeFocused();
  await picker
    .getByRole("button", { name: "Apply date and time", exact: true })
    .focus();
  await page.keyboard.press("Tab");
  await expect(
    picker.getByRole("button", { name: "Close date picker", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(picker).toHaveCount(0);
  await expect(reminder).toBeVisible();
  await expect(input).toBeFocused();
  await expect(input).toHaveValue("2028-01-31T09:15");
});

test("calendar stays within compact large-text windows and can choose Today", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await chooseSelect(page, "Interface text size", "1.2");
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "Set reminder", exact: true }).click();
  const reminder = page.getByRole("dialog", { name: "Remind me", exact: true });
  for (const [viewport, screenshot] of [
    [{ width: 900, height: 600 }, "test-results/date-picker-compact-dark.png"],
    [{ width: 460, height: 620 }, "test-results/date-picker-narrow-dark.png"],
  ]) {
    await page.setViewportSize(viewport);
    await reminder
      .getByRole("button", { name: "Choose date and time", exact: true })
      .click();
    const picker = page.getByRole("dialog", {
      name: "Choose date and time",
      exact: true,
    });
    await expect(picker).toBeInViewport({ ratio: 1 });
    await expect(
      picker.getByRole("button", { name: "Apply date and time", exact: true }),
    ).toBeInViewport({ ratio: 1 });
    expect(
      await picker.evaluate(
        (element) => element.scrollWidth - element.clientWidth,
      ),
    ).toBeLessThanOrEqual(1);
    await picker.getByRole("button", { name: "Today", exact: true }).click();
    await expect(picker.locator('[aria-current="date"]')).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await page.screenshot({ path: screenshot });
    await page.keyboard.press("Escape");
    await expect(picker).toHaveCount(0);
    await expect(reminder).toBeVisible();
  }
});
