import React, { useId, useState } from "react";
import { Search } from "lucide-react";
import { FONTS, FONT_GROUPS, getFontStack } from "./fonts.mjs";
import Select from "./Select.jsx";

export default function FontPicker({
  label,
  value,
  onChange,
  allowInherit = false,
  previewSize,
}) {
  const [query, setQuery] = useState("");
  const controlId = useId();
  const matches = FONTS.filter((font) =>
    `${font.family} ${font.group}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  const selected = FONTS.find((font) => font.id === value);
  const source =
    value === "inherit"
      ? "Follows interface"
      : selected?.bundled
        ? "Bundled · Offline"
        : "Windows / system";
  return (
    <div className="font-picker">
      <div className="font-picker-heading">
        <label htmlFor={controlId}>{label}</label>
        <span className="font-source">{source}</span>
      </div>
      <div className="font-controls">
        <div className="font-search-wrap">
          <Search size={16} aria-hidden="true" />
          <input
            className="font-search"
            type="search"
            aria-label={`Search ${label.toLowerCase()}s`}
            placeholder={`Search ${FONTS.length} fonts…`}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <Select
          id={controlId}
          label={label}
          value={value}
          onChange={onChange}
          options={[
            ...(allowInherit
              ? [{ value: "inherit", label: "Same as interface" }]
              : []),
            ...(selected && !matches.some((font) => font.id === value)
              ? [{ value: selected.id, label: `${selected.family} (current)` }]
              : []),
            ...FONT_GROUPS.flatMap((group) =>
              matches
                .filter((font) => font.group === group)
                .map((font) => ({
                  value: font.id,
                  label: font.family,
                  group,
                  style: { fontFamily: font.stack },
                })),
            ),
          ]}
        />
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
          fontSize: previewSize,
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
