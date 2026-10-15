function reminderTitle(note, isTest = false) {
  if (isTest) return "Notes reminder test";
  if (note.locked) return "Locked note reminder";
  return (typeof note.title === "string" && note.title.trim()
    ? note.title
    : "Untitled note"
  ).slice(0, 120);
}

function createReminderDelivery({
  Notification,
  iconPath,
  showAlert,
  onOpen,
  onDelivered,
  onError,
  nativeTimeoutMs = 8000,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}) {
  const active = new Set();
  function showNative(note, { isTest = false } = {}) {
    return new Promise((resolve, reject) => {
      if (!Notification.isSupported())
        return reject(new Error("Windows notifications are unavailable."));
      const notification = new Notification({
        title: reminderTitle(note, isTest),
        body: isTest
          ? "Your reminder alerts are working."
          : "Your note reminder is due. Click to open it.",
        icon: iconPath,
        timeoutType: "never",
      });
      let settled = false;
      const timer = setTimer(
        () => fail("Windows did not confirm the reminder was displayed."),
        nativeTimeoutMs,
      );
      function fail(message) {
        if (settled) return;
        settled = true;
        clearTimer(timer);
        active.delete(notification);
        try { notification.close(); } catch {}
        reject(new Error(message));
      }
      active.add(notification);
      notification.once("show", () => {
        if (settled) return;
        settled = true;
        clearTimer(timer);
        resolve({ channel: "windows" });
      });
      notification.on("click", () => {
        onOpen(isTest ? null : note.id);
        active.delete(notification);
      });
      notification.on("close", () => active.delete(notification));
      notification.on("failed", (_, error) =>
        fail(typeof error === "string" ? error : "Windows could not display the reminder."),
      );
      try {
        notification.show();
      } catch (error) {
        fail(error?.message || "Windows could not display the reminder.");
      }
    });
  }

  return {
    async deliver(note, receipt, { isTest = false } = {}) {
      try {
        let result;
        try {
          result = await showAlert(note, { isTest });
        } catch {
          result = await showNative(note, { isTest });
        }
        // An app-owned alert is primary because Windows can accept a toast
        // while silently suppressing its banner. Native delivery is fallback.
        if (!isTest) onDelivered(receipt);
        return result;
      } catch {
        const message = "The reminder could not be displayed. Keep Notes running to retry, or choose Show again in the reminder.";
        onError({
          ...(!isTest ? { noteId: note.id, reminderAt: note.reminderAt } : {}),
          message,
        });
        throw new Error(message);
      }
    },
    dispose() {
      for (const notification of active) {
        try { notification.close(); } catch {}
      }
      active.clear();
    },
  };
}

module.exports = { createReminderDelivery, reminderTitle };
