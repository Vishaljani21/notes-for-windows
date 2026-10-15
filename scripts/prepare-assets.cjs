const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
async function main() {
  const { ACCENTS, getAccentVariables } = await import(
    pathToFileURL(path.join(__dirname, "../src/accents.mjs")).href
  );
  fs.writeFileSync(
    path.join(__dirname, "../public/accents.json"),
    JSON.stringify(
      Object.fromEntries(
        ACCENTS.map(({ id }) => [
          id,
          {
            light: getAccentVariables(id, false),
            dark: getAccentVariables(id, true),
          },
        ]),
      ),
    ),
    "utf8",
  );
  const target = path.join(__dirname, "../public/ocr");
  fs.mkdirSync(target, { recursive: true });
  fs.copyFileSync(
    require.resolve("tesseract.js/dist/worker.min.js"),
    path.join(target, "worker.min.js"),
  );
  const core = path.dirname(require.resolve("tesseract.js-core/package.json"));
  for (const name of fs.readdirSync(core)) {
    if (name.endsWith(".wasm") || name.endsWith(".wasm.js"))
      fs.copyFileSync(path.join(core, name), path.join(target, name));
  }
  await require("./prepare-fonts.cjs")();
  require("./prepare-notices.cjs")();
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
