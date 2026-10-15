import { isFontId } from "./fonts.mjs";
export const uid = () => crypto.randomUUID();
export const escapeHTML = (value = "") =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const plainText = (html = "") =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
export function descendants(folders, id) {
  const result = new Set([id]);
  for (let i = 0; i < folders.length; i++)
    for (const folder of folders)
      if (result.has(folder.parentId)) result.add(folder.id);
  return result;
}
export function validateLibrary(data) {
  if (
    !data ||
    data.version !== 1 ||
    !Array.isArray(data.notes) ||
    !Array.isArray(data.folders) ||
    data.notes.length > 10000 ||
    data.folders.length > 500
  )
    throw new Error("This is not a supported Notes backup.");
  const ids = new Set();
  const safeId = (id) =>
    typeof id === "string" &&
    /^[a-z0-9_-]{1,100}$/i.test(id) &&
    !["__proto__", "constructor", "prototype"].includes(id);
  for (const f of data.folders) {
    if (
      !f ||
      !safeId(f.id) ||
      ids.has(f.id) ||
      typeof f.name !== "string" ||
      f.name.length > 120 ||
      (f.smartTag && typeof f.smartTag !== "string")
    )
      throw new Error("The backup contains an invalid folder.");
    ids.add(f.id);
  }
  for (const f of data.folders) {
    const seen = new Set([f.id]);
    let parent = f.parentId;
    while (parent) {
      if (seen.has(parent) || !ids.has(parent))
        throw new Error("The backup contains an invalid folder hierarchy.");
      seen.add(parent);
      parent = data.folders.find((f) => f.id === parent)?.parentId;
    }
  }
  ids.clear();
  for (const n of data.notes) {
    if (
      !n ||
      !safeId(n.id) ||
      ids.has(n.id) ||
      typeof n.title !== "string" ||
      typeof n.content !== "string" ||
      n.content.length > 30000000 ||
      !Array.isArray(n.tags) ||
      n.tags.some((t) => typeof t !== "string" || t.length > 80) ||
      !Number.isFinite(n.createdAt) ||
      !Number.isFinite(n.updatedAt)
    )
      throw new Error("The backup contains an invalid note.");
    if (
      n.locked &&
      (!n.encrypted ||
        typeof n.encrypted.iv !== "string" ||
        typeof n.encrypted.salt !== "string" ||
        typeof n.encrypted.data !== "string" ||
        n.content !== "" ||
        n.tags.length)
    )
      throw new Error("The backup contains an invalid locked note.");
    ids.add(n.id);
  }
  return {
    version: 1,
    notes: data.notes,
    folders: data.folders,
    settings: {
      theme: "light",
      sort: "updated",
      view: "list",
      fontSize: 18,
      uiScale: 1,
      ...data.settings,
      fontFamily: isFontId(data.settings?.fontFamily)
        ? data.settings.fontFamily
        : "system",
      noteFontFamily: isFontId(data.settings?.noteFontFamily)
        ? data.settings.noteFontFamily
        : "inherit",
      uiScale: [1, 1.1, 1.2].includes(data.settings?.uiScale)
        ? data.settings.uiScale
        : 1,
    },
  };
}
const bytesTo64 = (bytes) => {
  let out = "";
  for (let i = 0; i < bytes.length; i += 8192)
    out += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(out);
};
const from64 = (value) => Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
async function deriveKey(password, salt) {
  const base = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 250000, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
export async function encryptNote(payload, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16)),
    iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  return {
    salt: bytesTo64(salt),
    iv: bytesTo64(iv),
    data: bytesTo64(new Uint8Array(encrypted)),
  };
}
export async function decryptNote(encrypted, password) {
  const key = await deriveKey(password, from64(encrypted.salt));
  const bytes = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: from64(encrypted.iv) },
    key,
    from64(encrypted.data),
  );
  return JSON.parse(new TextDecoder().decode(bytes));
}
export function summarize(text) {
  const sentences =
    text
      .match(/[^.!?\n]+[.!?]+|[^.!?\n]+$/g)
      ?.map((s) => s.trim())
      .filter((s) => s.length > 20) || [];
  const frequency = new Map();
  const words = (s) =>
    s
      .toLowerCase()
      .match(/[a-z]{4,}/g)
      ?.filter(
        (w) =>
          ![
            "that",
            "this",
            "with",
            "from",
            "have",
            "your",
            "will",
            "they",
            "there",
            "their",
            "about",
            "would",
            "could",
            "into",
            "some",
            "then",
          ].includes(w),
      ) || [];
  sentences.forEach((s) =>
    words(s).forEach((w) => frequency.set(w, (frequency.get(w) || 0) + 1)),
  );
  return sentences
    .map((s, i) => ({
      s,
      i,
      score:
        words(s).reduce((a, w) => a + frequency.get(w), 0) /
        Math.sqrt(s.length),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .sort((a, b) => a.i - b.i)
    .map((x) => x.s);
}
export function seedLibrary() {
  const now = Date.now(),
    day = 86400000;
  const note = (id, title, content, folderId, tags, ago, pinned = false) => ({
    id,
    title,
    content,
    folderId,
    tags,
    pinned,
    createdAt: now - ago * day,
    updatedAt: now - ago * day,
    deletedAt: null,
    locked: false,
  });
  return {
    version: 1,
    settings: {
      theme: "light",
      sort: "updated",
      view: "list",
      fontSize: 18,
      uiScale: 1,
    },
    folders: [
      { id: "notes", name: "Notes", parentId: null },
      { id: "personal", name: "Personal", parentId: null },
      { id: "work", name: "Work", parentId: null },
      { id: "travel", name: "Travel", parentId: "personal" },
      { id: "ideas", name: "Ideas", parentId: null },
      {
        id: "favorites",
        name: "Inspiration",
        smartTag: "inspiration",
        parentId: null,
      },
    ],
    notes: [
      note(
        "welcome",
        "A little room for big ideas",
        '<p>Thoughts, plans, and everything in between.<br>A quiet place to make them your own.</p><h2>Make yourself at home</h2><p>This is your notebook. Capture a fleeting thought, plan something wonderful, or simply clear a little space in your head.</p><ul data-type="taskList"><li data-type="taskItem" data-checked="true"><label><input type="checkbox" checked><span></span></label><div><p>Find a place for your thoughts</p></div></li><li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p>Create your first note with Ctrl + N</p></div></li><li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p>Try a checklist, a table, or an audio note</p></div></li></ul><h2>A few little things to know</h2><p>Your notes save automatically on this device. Use folders to give things a home, and tags to connect ideas across folders.</p><blockquote><p>“The secret of getting ahead is getting started.”</p></blockquote><p>Use the <strong>Aa</strong> menu to find your style, or the <strong>+</strong> menu to add a little more.</p>',
        "notes",
        ["welcome", "inspiration"],
        0,
        true,
      ),
      note(
        "copenhagen",
        "A weekend in Copenhagen",
        '<p>A slower kind of weekend. Good coffee, long walks, and absolutely no rush.</p><h2>Friday · Settle in</h2><ul><li>Check in near the lakes</li><li>Dinner at a little neighborhood restaurant</li><li>An evening walk along Nyhavn</li></ul><h2>Saturday · Get a little lost</h2><p>Start with coffee and a cardamom bun. Rent bikes and follow the water. Leave the afternoon open for whatever looks interesting.</p><table><tbody><tr><th><p>On the list</p></th><th><p>Neighborhood</p></th></tr><tr><td><p>Designmuseum</p></td><td><p>Frederiksstaden</p></td></tr><tr><td><p>Botanical Garden</p></td><td><p>City center</p></td></tr><tr><td><p>Vintage shops & coffee</p></td><td><p>Nørrebro</p></td></tr></tbody></table><h2>Remember to pack</h2><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p>A light rain jacket</p></div></li><li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p>Camera & charger</p></div></li></ul>',
        "travel",
        ["travel", "personal"],
        0.1,
        true,
      ),
      note(
        "smallthings",
        "The small things",
        "<p>Things I want to make more time for.</p><ul><li>Reading before reaching for my phone</li><li>Cooking something new on Sundays</li><li>Walking without a destination</li><li>Calling an old friend</li></ul><p>Nothing extraordinary. Just a little more intention.</p>",
        "personal",
        ["personal", "inspiration"],
        0.3,
      ),
      note(
        "studio",
        "Studio refresh",
        "<p>A workspace that feels a little calmer.</p><h2>The direction</h2><p>Warm whites, natural wood, and one very happy plant. Keep the desk clear and the ideas close.</p><h2>To find</h2><ul><li>A desk lamp with warm light</li><li>A good notebook</li><li>Something green for the windowsill</li></ul>",
        "ideas",
        ["design", "inspiration"],
        1,
      ),
      note(
        "project",
        "Monday, a fresh start",
        '<h2>This week’s focus</h2><p>Make fewer things, a little better.</p><ul data-type="taskList"><li data-type="taskItem" data-checked="true"><label><input type="checkbox" checked><span></span></label><div><p>Review the first round of feedback</p></div></li><li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p>Sketch three possible directions</p></div></li><li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p>Share a work-in-progress by Thursday</p></div></li></ul>',
        "work",
        ["work"],
        1.2,
      ),
      note(
        "books",
        "On the reading list",
        "<p>For rainy days and quiet evenings.</p><ol><li><strong>The Creative Act</strong> — Rick Rubin</li><li><strong>A Month in the Country</strong> — J. L. Carr</li><li><strong>The Art of Noticing</strong> — Rob Walker</li><li><strong>Devotions</strong> — Mary Oliver</li></ol>",
        "personal",
        ["books", "personal"],
        2,
      ),
      note(
        "pasta",
        "Sunday night pasta",
        "<p>The one worth making again.</p><h2>For two</h2><ul><li>200 g pasta</li><li>A handful of cherry tomatoes</li><li>2 cloves garlic, thinly sliced</li><li>Olive oil, basil & parmesan</li></ul><p>Cook the garlic gently. Add tomatoes and let them soften. Toss with pasta and a generous splash of pasta water. Finish with basil.</p>",
        "notes",
        ["recipes"],
        3,
      ),
      note(
        "someday",
        "Someday, maybe",
        "<p>A cabin near the water.<br>A month without a schedule.<br>A language I don’t speak yet.<br>A little book of photographs.</p><p>No deadlines here.</p>",
        "ideas",
        ["inspiration"],
        5,
      ),
    ],
  };
}
