export const DEFAULT_ACCENT = "amber";

export const ACCENTS = [
  { id: "amber", label: "Amber", group: "Classic", color: "#e2b343" },
  { id: "coral", label: "Coral", group: "Classic", color: "#e87657" },
  { id: "rose", label: "Rose", group: "Classic", color: "#d96c8b" },
  { id: "purple", label: "Purple", group: "Classic", color: "#9674d8" },
  { id: "blue", label: "Blue", group: "Classic", color: "#5489df" },
  { id: "teal", label: "Teal", group: "Classic", color: "#46a99d" },
  { id: "green", label: "Green", group: "Classic", color: "#68a363" },
  { id: "indigo", label: "Indigo", group: "Classic", color: "#7778d7" },
  { id: "lavender", label: "Lavender", group: "Classic", color: "#aa8bdc" },
  { id: "slate", label: "Slate", group: "Classic", color: "#82919f" },
  { id: "neon-lime", label: "Neon lime", group: "Neon", color: "#c5ff35" },
  { id: "neon-cyan", label: "Neon cyan", group: "Neon", color: "#36edff" },
  { id: "neon-pink", label: "Neon pink", group: "Neon", color: "#ff4ac8" },
  { id: "neon-violet", label: "Neon violet", group: "Neon", color: "#b16bff" },
  { id: "neon-blue", label: "Neon blue", group: "Neon", color: "#5388ff" },
  { id: "neon-orange", label: "Neon orange", group: "Neon", color: "#ff9836" },
  { id: "neon-mint", label: "Neon mint", group: "Neon", color: "#47ffc5" },
  { id: "neon-yellow", label: "Neon yellow", group: "Neon", color: "#f9ff3d" },
];

export const isAccentId = (id) => ACCENTS.some((accent) => accent.id === id);

const rgb = (hex) =>
  hex.match(/[a-f\d]{2}/gi).map((component) => parseInt(component, 16));
const hex = (components) =>
  `#${components.map((value) => Math.round(value).toString(16).padStart(2, "0")).join("")}`;
const mix = (color, background, amount) => {
  const foreground = rgb(color);
  return hex(
    rgb(background).map(
      (value, index) => foreground[index] * amount + value * (1 - amount),
    ),
  );
};
const luminance = (color) =>
  rgb(color).reduce((sum, component, index) => {
    const value = component / 255;
    const linear =
      value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    return sum + linear * [0.2126, 0.7152, 0.0722][index];
  }, 0);
const contrast = (first, second) => {
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};

// Bright swatches stay expressive, while text uses a related shade that remains
// readable on paper, sidebars, and selection backgrounds in either theme.
const readableAccent = (color, backgrounds, dark) => {
  if (backgrounds.every((background) => contrast(color, background) >= 4.5))
    return color;
  const target = dark ? "#ffffff" : "#000000";
  for (let amount = 0.99; amount >= 0; amount -= 0.01) {
    const candidate = mix(color, target, amount);
    if (
      backgrounds.every((background) => contrast(candidate, background) >= 4.5)
    )
      return candidate;
  }
  return target;
};

export function getAccentVariables(id, dark = false) {
  const accent = ACCENTS.find((item) => item.id === id) || ACCENTS[0];
  const paper = dark ? "#1e1e1e" : "#ffffff";
  const isAmber = accent.id === DEFAULT_ACCENT;
  const isNeon = accent.group === "Neon";
  const fill =
    dark && isAmber
      ? "#e8bf5b"
      : dark && !isNeon
        ? mix(accent.color, "#ffffff", 0.92)
        : accent.color;
  const selected = isAmber
    ? dark
      ? "#564728"
      : "#f8e9b6"
    : mix(fill, paper, dark ? 0.24 : 0.2);
  const noteSelected = isAmber
    ? dark
      ? "#343129"
      : "#f5ecd6"
    : mix(fill, paper, dark ? 0.13 : 0.12);
  const text = readableAccent(
    isAmber ? (dark ? "#e8bf5b" : "#8f6c20") : fill,
    [paper, selected, noteSelected, dark ? "#252525" : "#f3f2ef"],
    dark,
  );
  const hover = mix(fill, dark ? "#ffffff" : "#000000", dark ? 0.93 : 0.92);
  const ink = ["#211f1b", "#000000", "#ffffff"].find(
    (color) => contrast(color, fill) >= 4.5 && contrast(color, hover) >= 4.5,
  );
  return {
    "--gold": fill,
    "--accent": text,
    "--selected": selected,
    "--note-selected": noteSelected,
    "--note-selected-border": isAmber
      ? dark
        ? "#b59a5538"
        : "#dfca963d"
      : mix(fill, paper, dark ? 0.3 : 0.25),
    "--note-hover": isAmber
      ? dark
        ? "#2b2b29"
        : "#eeede8"
      : mix(fill, dark ? "#292929" : "#efeeeb", 0.04),
    "--note-focus": text,
    "--note-tag-bg": isAmber
      ? dark
        ? "#ffffff0b"
        : "#e8e5db"
      : mix(fill, dark ? "#292929" : "#eeede8", dark ? 0.08 : 0.07),
    "--accent-ink": ink,
    "--accent-hover": hover,
    "--accent-glow": isNeon
      ? `0 0 ${dark ? 18 : 14}px rgba(${rgb(fill).join(", ")}, ${dark ? 0.18 : 0.12})`
      : "none",
  };
}
