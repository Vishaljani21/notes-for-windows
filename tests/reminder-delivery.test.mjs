import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { createReminderDelivery, reminderTitle } = require("../electron/reminder-delivery.cjs");

const note = { id: "fixture-note", title: "Fixture reminder", reminderAt: 1000 };
const receipt = { noteId: note.id, reminderAt: 1000, deliveredAt: 1001 };
function fixture(options = {}) {
  const notifications = [];
  const delivered = [];
  const errors = [];
  const opened = [];
  class Notification extends EventEmitter {
    static isSupported() { return options.supported ?? true; }
    constructor(config) {
      super();
      this.config = config;
      notifications.push(this);
    }
    show() { this.showCalled = true; }
    close() { this.closeCalled = true; }
  }
  return {
    notifications, delivered, errors, opened,
    delivery: createReminderDelivery({
      Notification,
      iconPath: "original-notes-icon.ico",
      showAlert: options.showAlert || (async () => ({ channel: "app" })),
      onOpen: (id) => opened.push(id),
      onDelivered: (entry) => delivered.push(entry),
      onError: (error) => errors.push(error),
      ...(options.setTimer ? { setTimer: options.setTimer, clearTimer: () => {} } : {}),
    }),
  };
}
async function notificationFrom(context) {
  for (let i = 0; i < 10 && !context.notifications.length; i++)
    await Promise.resolve();
  assert.equal(context.notifications.length, 1);
  return context.notifications[0];
}

test("delivery waits for the visible app alert and does not duplicate it with a Windows toast", async () => {
  let confirm;
  const context = fixture({ showAlert: () => new Promise(resolve => { confirm = resolve; }) });
  const pending = context.delivery.deliver(note, receipt);
  assert.deepEqual(context.delivered, []);
  confirm({ channel: "app" });
  assert.deepEqual(await pending, { channel: "app" });
  assert.deepEqual(context.delivered, [receipt]);
  assert.equal(context.notifications.length, 0);
  context.delivery.dispose();
});

test("Windows fallback waits for the native show event and routes click to the note", async () => {
  const context = fixture({ showAlert: async () => { throw new Error("Window unavailable"); } });
  const pending = context.delivery.deliver(note, receipt);
  const notification = await notificationFrom(context);
  assert.equal(notification.showCalled, true);
  assert.deepEqual(context.delivered, []);
  notification.emit("show");
  assert.deepEqual(await pending, { channel: "windows" });
  assert.deepEqual(context.delivered, [receipt]);
  notification.emit("click");
  assert.deepEqual(context.opened, [note.id]);
  context.delivery.dispose();
});

test("native fallback failure rejects, reports an actionable error, and never marks delivered", async () => {
  const context = fixture({ showAlert: async () => { throw new Error("Window unavailable"); } });
  const pending = context.delivery.deliver(note, receipt);
  const rejected = assert.rejects(pending, /could not be displayed/);
  const notification = await notificationFrom(context);
  notification.emit("failed", {}, "Native failure");
  await rejected;
  assert.deepEqual(context.delivered, []);
  assert.equal(notification.closeCalled, true);
  assert.equal(context.errors[0].noteId, note.id);
  assert.match(context.errors[0].message, /Show again/);
  context.delivery.dispose();
});

test("unsupported or unconfirmed native fallback never counts as a successful reminder", async () => {
  const unavailable = fixture({
    supported: false,
    showAlert: async () => { throw new Error("Window unavailable"); },
  });
  await assert.rejects(unavailable.delivery.deliver(note, receipt), /could not be displayed/);
  assert.deepEqual(unavailable.delivered, []);
  assert.equal(unavailable.notifications.length, 0);
  let timeout;
  const context = fixture({
    showAlert: async () => { throw new Error("Window unavailable"); },
    setTimer: (callback) => { timeout = callback; return 1; },
  });
  const pending = context.delivery.deliver(note, receipt);
  const rejected = assert.rejects(pending, /could not be displayed/);
  await notificationFrom(context);
  timeout();
  await rejected;
  assert.deepEqual(context.delivered, []);
  unavailable.delivery.dispose();
  context.delivery.dispose();
});

test("locked titles stay generic and test alerts never create delivery receipts", async () => {
  assert.equal(reminderTitle({ ...note, locked: true, title: "Private title" }), "Locked note reminder");
  const context = fixture({ showAlert: async () => { throw new Error("Window unavailable"); } });
  const pending = context.delivery.deliver({ ...note, locked: true, title: "Private title" }, receipt);
  const notification = await notificationFrom(context);
  assert.equal(notification.config.title, "Locked note reminder");
  assert.equal(JSON.stringify(notification.config).includes("Private title"), false);
  notification.emit("show");
  await pending;
  context.delivery.dispose();
  const testAlert = fixture();
  assert.deepEqual(await testAlert.delivery.deliver(note, null, { isTest: true }), { channel: "app" });
  assert.deepEqual(testAlert.delivered, []);
  testAlert.delivery.dispose();
});
