const root = document.getElementById("reminders");
function render(items) {
  const fragment = document.createDocumentFragment();
  for (const item of items) {
    const article = document.createElement("article");
    const heading = document.createElement("h1");
    heading.textContent = item.title;
    const detail = document.createElement("p");
    detail.textContent = item.isTest
      ? "Your reminder alerts are working."
      : `Due ${new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(item.reminderAt)}`;
    const actions = document.createElement("div");
    actions.className = "actions";
    const dismiss = document.createElement("button");
    dismiss.textContent = "Dismiss";
    dismiss.addEventListener("click", () => window.reminderAlert.dismiss(item.id));
    const open = document.createElement("button");
    open.className = "primary";
    open.textContent = item.isTest ? "Open Notes" : "Open note";
    open.addEventListener("click", () => window.reminderAlert.open(item.id));
    actions.append(dismiss, open);
    article.append(heading, detail, actions);
    fragment.append(article);
  }
  root.replaceChildren(fragment);
  requestAnimationFrame(() =>
    window.reminderAlert.rendered(items.map((item) => item.id)),
  );
}
window.reminderAlert.onItems(render);
window.reminderAlert.ready().then(render);
