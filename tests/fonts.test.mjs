import { test } from "node:test";
import assert from "node:assert/strict";
import { FONTS, getFontStack } from "../src/fonts.mjs";
import { seedLibrary, validateLibrary } from "../src/lib.mjs";
test("font preferences reject arbitrary CSS and retain valid independent choices", () => {
  const data = seedLibrary();
  const invalid = validateLibrary({
    ...data,
    settings: {
      ...data.settings,
      fontFamily: "url(https://invalid.test)",
      noteFontFamily: "unknown",
    },
  });
  assert.equal(invalid.settings.fontFamily, "system");
  assert.equal(invalid.settings.noteFontFamily, "inherit");
  const valid = validateLibrary({
    ...data,
    settings: {
      ...data.settings,
      fontFamily: "roboto",
      noteFontFamily: "lora",
    },
  });
  assert.equal(valid.settings.fontFamily, "roboto");
  assert.equal(valid.settings.noteFontFamily, "lora");
  assert.equal(new Set(FONTS.map((f) => f.id)).size, FONTS.length);
  assert.match(getFontStack("not-a-font"), /Segoe UI/);
});
