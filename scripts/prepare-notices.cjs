const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const root = path.resolve(__dirname, "..");
const fallbackRoot = path.join(root, "third-party-license-sources");
const fallbackAliases = {
  "onnxruntime-common-1.30.0": "onnxruntime-1.30.0",
  "onnxruntime-node-1.30.0": "onnxruntime-1.30.0",
};

function copyFallbackNotices(key, dest) {
  const sourceDir = path.join(fallbackRoot, fallbackAliases[key] || key);
  const manifestPath = path.join(sourceDir, "sources.json");
  if (!fs.existsSync(manifestPath)) return [];
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (!Array.isArray(manifest.files) || manifest.files.length === 0)
    throw new Error(`No verified fallback notice files for ${key}.`);
  const names = [];
  for (const source of manifest.files) {
    if (
      typeof source.file !== "string" ||
      path.basename(source.file) !== source.file ||
      !/^https:\/\//.test(source.url || "") ||
      !/^[a-f0-9]{64}$/i.test(source.sha256 || "")
    )
      throw new Error(`Invalid fallback notice source for ${key}.`);
    const bytes = fs.readFileSync(path.join(sourceDir, source.file));
    const hash = createHash("sha256").update(bytes).digest("hex");
    if (hash !== source.sha256.toLowerCase())
      throw new Error(`Fallback notice checksum mismatch: ${key}/${source.file}`);
    fs.writeFileSync(path.join(dest, source.file), bytes);
    names.push(source.file);
  }
  fs.copyFileSync(manifestPath, path.join(dest, "sources.json"));
  return [...names, "sources.json"];
}

function findPackage(name, from) {
  let current = from;
  while (true) {
    const file = path.join(current, "node_modules", name, "package.json");
    if (fs.existsSync(file)) return file;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}
module.exports = function prepareNotices() {
  const project = JSON.parse(
    fs.readFileSync(path.join(root, "package.json"), "utf8"),
  );
  const buildOnly = new Set([
    "electron",
    "electron-builder",
    "vite",
    "@vitejs/plugin-react",
    "@playwright/test",
  ]);
  const queue = Object.keys(project.devDependencies || {})
    .filter((name) => !buildOnly.has(name))
    .map((name) => [name, root]);
  const seen = new Set(),
    records = [];
  for (let index = 0; index < queue.length; index++) {
    const [name, from] = queue[index],
      file = findPackage(name, from);
    if (!file || seen.has(file)) continue;
    seen.add(file);
    const dir = path.dirname(file),
      pkg = JSON.parse(fs.readFileSync(file, "utf8"));
    const key = `${pkg.name.replace(/[^a-z0-9.-]/gi, "_")}-${pkg.version}`;
    const dest = path.join(root, "licenses", key);
    fs.mkdirSync(dest, { recursive: true });
    const notices = fs
      .readdirSync(dir)
      .filter(
        (name) =>
          /^(licen[cs]e|copying|copyright|notice|third.?party.*notices|ofl)([.-]|$)/i.test(
            name,
          ) && fs.statSync(path.join(dir, name)).isFile(),
      );
    for (const name of notices)
      fs.copyFileSync(path.join(dir, name), path.join(dest, name));
    const fallbackNotices = copyFallbackNotices(key, dest);
    const collectedNotices = [...new Set([...notices, ...fallbackNotices])];
    if (collectedNotices.length === 0)
      throw new Error(
        `Missing license notices for ${pkg.name}@${pkg.version}. Add verified upstream files under third-party-license-sources/${key}/ before distributing.`,
      );
    records.push({
      name: pkg.name,
      version: pkg.version,
      license:
        typeof pkg.license === "string"
          ? pkg.license
          : pkg.license?.type || "See upstream license",
      key,
      notices: collectedNotices,
    });
    for (const dep of Object.keys({
      ...pkg.dependencies,
      ...pkg.optionalDependencies,
      ...pkg.peerDependencies,
    }))
      queue.push([dep, dir]);
  }
  const lines = [
    "# Third-party notices",
    "",
    "Notes for Windows is MIT-licensed. The open-source libraries, fonts, OCR, speech, and math components it uses retain their respective licenses. Unmodified upstream license and notice files are included in the `licenses/` directory.",
    "",
    "This inventory includes dependencies of the browser components; some optional Node-only dependencies are listed conservatively even when not included in the browser bundle. Electron and Chromium license texts are also shipped separately by Electron in the application directory.",
    "",
    "Where an npm package omits license files, checked-in upstream texts or license headers are copied from `third-party-license-sources/`. Their `sources.json` records the upstream URL and SHA-256 digest. Full ONNX Runtime upstream notices may describe components not used in this application's browser/WASM build; the unmodified notices are retained conservatively.",
    "",
    "| Package | Version | License | Upstream notices |",
    "| --- | --- | --- | --- |",
  ];
  for (const r of records.sort((a, b) => a.name.localeCompare(b.name)))
    lines.push(
      `| ${r.name} | ${r.version} | ${r.license.replaceAll("|", "\\|")} | ${r.notices.map((name) => `[${name}](licenses/${r.key}/${name})`).join(", ") || "See package upstream"} |`,
    );
  fs.writeFileSync(
    path.join(root, "THIRD_PARTY_NOTICES.md"),
    lines.join("\n") + "\n",
  );
  console.log(
    `Prepared license notices for ${records.length} dependency packages.`,
  );
};
