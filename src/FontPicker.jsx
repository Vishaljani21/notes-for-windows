import React, { useId, useState } from "react";
import { FONTS, FONT_GROUPS, getFontStack } from "./fonts.mjs";

export default function FontPicker({
  label,
  value,
  onChange,
  allowInherit = false,
}) {
  const [query, setQuery] = useState("");
  const controlId = useId();
  const matches = FONTS.filter((font) =>
    `${font.family} ${font.group}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  const selected = FONTS.find((font) => font.id === value);
  return (
    <div className="font-picker">
      <div className="field-label">
        <label htmlFor={controlId}>{label}</label>
        <input
          className="font-search"
          type="search"
          aria-label={`Search ${label.toLowerCase()}s`}
          placeholder={`Search ${FONTS.length} fonts…`}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select
          id={controlId}
          aria-label={label}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          {allowInherit && <option value="inherit">Same as interface</option>}
          {selected && !matches.some((font) => font.id === value) && (
            <option value={selected.id}>{selected.family} (current)</option>
          )}
          {FONT_GROUPS.map((group) => {
            const fonts = matches.filter((font) => font.group === group);
            return fonts.length ? (
              <optgroup key={group} label={group}>
                {fonts.map((font) => (
                  <option
                    key={font.id}
                    value={font.id}
                    style={{ fontFamily: font.stack }}
                  >
                    {font.family}
                  </option>
                ))}
              </optgroup>
            ) : null;
          })}
        </select>
      </div>
      {query && (
        <p className="helper font-match-count" role="status">
          {matches.length
            ? `${matches.length} matching fonts`
            : "No matches. Try another font name or category."}
        </p>
      )}
      <div
        className="font-preview"
        style={{
          fontFamily:
            value === "inherit" ? "var(--font-ui)" : getFontStack(value),
        }}
        aria-label={`${label} preview`}
      >
        <span className="font-preview-alphabet">Aa Bb Cc 123</span>
        <p>The quick brown fox jumps over the lazy dog.</p>
        <p>
          <strong>A bold idea.</strong> <em>A quieter thought.</em>
        </p>
      </div>
    </div>
  );
}
