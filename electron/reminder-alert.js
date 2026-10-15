const root = document.getElementById("reminders");
const count = document.getElementById("reminder-count");
const appearanceVariables = [
  "--gold",
  "--accent",
  "--accent-ink",
  "--accent-hover",
  "--selected",
];
const hexColor = /^#(?:[a-f\d]{3}|[a-f\d]{4}|[a-f\d]{6}|[a-f\d]{8})$/i;
function applyAppearance(appearance) {
  const element = document.documentElement;
  if (["light", "dark"].includes(appearance?.theme))
    element.dataset.theme = appearance.theme;
  else delete element.dataset.theme;
  for (const name of appearanceVariables) {
    const value = appearance?.variables?.[name];
    element.style.removeProperty(name);
    if (typeof value === "string" && hexColor.test(value))
      element.style.setProperty(name, value);
  }
}
function render(items) {
  applyAppearance(items[0]?.appearance);
  count.hidden = items.length < 2;
  count.textContent = `${items.length} waiting`;
  count.setAttribute("aria-label", `${items.length} reminders`);
  const fragment = document.createDocumentFragment();
  for (const item of items) {
    const article = document.createElement("article");
    const eyebrow = document.createElement("div");
    eyebrow.className = "reminder-eyebrow";
    const dot = document.createElement("span");
    dot.className = "reminder-dot";
    dot.setAttribute("aria-hidden", "true");
    eyebrow.append(dot, item.isTest ? "Test reminder" : "Reminder");
    const heading = document.createElement("h1");
    heading.textContent = item.title;
    heading.title = item.title;
    const detail = document.createElement("div");
    detail.className = `reminder-due${item.isTest ? " is-test" : ""}`;
    const clock = document.createElement("span");
    clock.className = "due-clock";
    clock.setAttribute("aria-hidden", "true");
    const copy = document.createElement("div");
    copy.className = "due-copy";
    const time = document.createElement("strong");
    time.textContent = item.isTest
      ? "Your reminder alerts are working."
      : new Intl.DateTimeFormat(undefined, { timeStyle: "short" }).format(
          item.reminderAt,
        );
    const date = document.createElement("span");
    date.textContent = item.isTest
      ? "You’re ready for your next reminder."
      : `Due ${new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" }).format(item.reminderAt)}`;
    copy.append(time, date);
    detail.append(clock, copy);
    const actions = document.createElement("div");
    actions.className = "actions";
    const dismiss = document.createElement("button");
    dismiss.textContent = "Dismiss";
    dismiss.addEventListener("click", () =>
      window.reminderAlert.dismiss(item.id),
    );
    const open = document.createElement("button");
    open.className = "primary";
    open.textContent = item.isTest ? "Open Notes" : "Open note";
    open.addEventListener("click", () => window.reminderAlert.open(item.id));
    actions.append(dismiss, open);
    article.append(eyebrow, heading, detail, actions);
    fragment.append(article);
  }
  root.replaceChildren(fragment);
  requestAnimationFrame(() =>
    window.reminderAlert.rendered(items.map((item) => item.id)),
  );
}
window.reminderAlert.onItems(render);
window.reminderAlert.ready().then(render);
