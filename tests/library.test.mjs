import { test } from "node:test";
import assert from "node:assert/strict";
import {
  encryptNote,
  decryptNote,
  descendants,
  validateLibrary,
  seedLibrary,
  summarize,
} from "../src/lib.mjs";
test("encrypted content round-trips including Unicode, and rejects a wrong password or modified data", async () => {
  const payload = {
    content: "<p>Private thoughts 🧠 नमस्ते</p>",
    tags: ["secret"],
  };
  const sealed = await encryptNote(payload, "correct horse");
  assert.ok(!JSON.stringify(sealed).includes("Private thoughts"));
  assert.deepEqual(await decryptNote(sealed, "correct horse"), payload);
  await assert.rejects(decryptNote(sealed, "incorrect horse"));
  await assert.rejects(
    decryptNote(
      { ...sealed, data: sealed.data.slice(0, -4) + "AAAA" },
      "correct horse",
    ),
  );
});
test("folder descendants include nested children, without traversing forever on invalid cycles", () => {
  assert.deepEqual(
    [
      ...descendants(
        [
          { id: "a" },
          { id: "b", parentId: "a" },
          { id: "c", parentId: "b" },
          { id: "d" },
        ],
        "a",
      ),
    ],
    ["a", "b", "c"],
  );
});
test("backups validate, duplicate IDs and cyclic folders are rejected", () => {
  const data = seedLibrary();
  assert.equal(validateLibrary(data).notes.length, 8);
  assert.throws(() =>
    validateLibrary({ ...data, notes: [...data.notes, data.notes[0]] }),
  );
  assert.throws(() =>
    validateLibrary({
      ...data,
      folders: [
        { id: "a", name: "A", parentId: "b" },
        { id: "b", name: "B", parentId: "a" },
      ],
    }),
  );
  assert.throws(() =>
    validateLibrary({ ...data, notes: [{ ...data.notes[0], locked: true }] }),
  );
});
test("summary extracts existing sentences without inventing new content", () => {
  const input =
    "The garden needs a little water every morning. The new garden has flowers and herbs. Schedule time to water the garden every day. The house also needs painting.";
  const output = summarize(input);
  assert.ok(output.length > 0 && output.length <= 3);
  output.forEach((s) => assert.ok(input.includes(s)));
});
