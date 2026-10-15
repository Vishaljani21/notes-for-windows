import test from "node:test";
import assert from "node:assert/strict";
import {
  ACCENTS,
  DEFAULT_ACCENT,
  getAccentVariables,
  isAccentId,
} from "../src/accents.mjs";
import { seedLibrary, validateLibrary } from "../src/lib.mjs";

function contrast(first, second) {
  const luminance = (color) => {
    const values = color
      .slice(1)
      .match(/.{2}/g)
      .map((part) => parseInt(part, 16) / 255)
      .map((value) =>
        value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
      );
    return values.reduce(
      (total, value, index) => total + value * [0.2126, 0.7152, 0.0722][index],
      0,
    );
  };
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test("accent presets have stable unique IDs and include classic and neon choices", () => {
  assert.equal(DEFAULT_ACCENT, "amber");
  assert.equal(
    new Set(ACCENTS.map((accent) => accent.id)).size,
    ACCENTS.length,
  );
  assert.equal(
    ACCENTS.filter((accent) => accent.group === "Classic").length,
    10,
  );
  assert.equal(ACCENTS.filter((accent) => accent.group === "Neon").length, 8);
  for (const accent of ACCENTS) {
    assert.match(accent.id, /^[a-z]+(?:-[a-z]+)*$/);
    assert.match(accent.color, /^#[a-f0-9]{6}$/);
    assert.ok(accent.label);
    assert.equal(isAccentId(accent.id), true);
  }
  for (const value of [undefined, null, "", "unknown", "#ff0000", {}, 1])
    assert.equal(isAccentId(value), false);
});

test("all accent text and primary button colors retain readable contrast in both themes", () => {
  for (const accent of ACCENTS) {
    for (const dark of [false, true]) {
      const variables = getAccentVariables(accent.id, dark);
      const label = `${accent.id} ${dark ? "dark" : "light"}`;
      for (const background of [
        dark ? "#1e1e1e" : "#ffffff",
        dark ? "#252525" : "#f3f2ef",
        variables["--selected"],
        variables["--note-selected"],
      ]) {
        assert.ok(
          contrast(variables["--accent"], background) >= 4.5,
          `${label} text on ${background}`,
        );
      }
      for (const background of [
        variables["--gold"],
        variables["--accent-hover"],
      ]) {
        assert.ok(
          contrast(variables["--accent-ink"], background) >= 4.5,
          `${label} primary button on ${background}`,
        );
      }
      assert.equal(variables["--note-focus"], variables["--accent"]);
      assert.equal(
        variables["--accent-glow"] === "none",
        accent.group === "Classic",
      );
    }
  }
});

test("unknown accents fall back safely and the original amber surfaces remain familiar", () => {
  for (const dark of [false, true])
    assert.deepEqual(
      getAccentVariables("missing", dark),
      getAccentVariables(DEFAULT_ACCENT, dark),
    );
  assert.equal(getAccentVariables("amber")["--gold"], "#e2b343");
  assert.equal(getAccentVariables("amber", true)["--gold"], "#e8bf5b");
  assert.equal(getAccentVariables("amber")["--note-selected"], "#f5ecd6");
  assert.equal(getAccentVariables("amber", true)["--note-selected"], "#343129");
});

test("backup restoration preserves valid accent choices and defaults missing or invalid settings", () => {
  const library = seedLibrary();
  assert.equal(library.settings.accentColor, DEFAULT_ACCENT);
  for (const accent of ACCENTS) {
    assert.equal(
      validateLibrary({
        ...library,
        settings: { ...library.settings, accentColor: accent.id },
      }).settings.accentColor,
      accent.id,
    );
  }
  for (const accentColor of [undefined, null, "missing", "#ff0000", {}, true]) {
    assert.equal(
      validateLibrary({ ...library, settings: { accentColor } }).settings
        .accentColor,
      DEFAULT_ACCENT,
    );
  }
  assert.equal(
    validateLibrary({ ...library, settings: undefined }).settings.accentColor,
    DEFAULT_ACCENT,
  );
});
