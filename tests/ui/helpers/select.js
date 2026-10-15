async function chooseSelect(scope, label, value) {
  await scope.getByRole("combobox", { name: label, exact: true }).click();
  const listbox = scope.getByRole("listbox", { name: label, exact: true });
  if (value && typeof value === "object")
    await listbox
      .getByRole("option", { name: value.label, exact: true })
      .click();
  else
    await listbox
      .locator(`[role="option"][data-value=${JSON.stringify(String(value))}]`)
      .click();
}
module.exports = { chooseSelect };
