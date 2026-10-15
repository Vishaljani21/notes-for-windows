import { validateLibrary } from "./lib.mjs";
let database;
async function db() {
  if (database) return database;
  database = await new Promise((resolve, reject) => {
    const request = indexedDB.open("notes-for-windows", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("library");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return database;
}
export async function loadLibrary() {
  if (window.desktop) {
    const data = await window.desktop.load();
    return data ? validateLibrary(data) : null;
  }
  const database = await db();
  const data = await new Promise((resolve, reject) => {
    const request = database
      .transaction("library")
      .objectStore("library")
      .get("data");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return data ? validateLibrary(data) : null;
}
export async function saveLibrary(data) {
  if (window.desktop) return window.desktop.save(data);
  const database = await db();
  return new Promise((resolve, reject) => {
    const tx = database.transaction("library", "readwrite");
    tx.objectStore("library").put(data, "data");
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}
export async function download(name, text, type = "text/plain") {
  if (window.desktop) return window.desktop.exportFile(name, text);
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}
