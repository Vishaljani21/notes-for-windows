# Third-party licenses

The [MIT license](../LICENSE) covers original Notes for Windows project source. It does not change the licenses of third-party packages, font files, OCR data, or the desktop runtime.

## Bundled fonts

Bundled Fontsource families retain the license and exact copyright notice supplied in each package's `LICENSE` file. Many Google Fonts families use the SIL Open Font License 1.1; inspect each package rather than assuming every font has the same terms. Preserve each complete license text when redistributing its font files. Windows system fonts are referenced by name and are not copied from Windows into this repository.

Font licenses permit use in the application without applying the font license to the app's original code. Changes to a font itself may carry additional conditions, such as reserved font names.

## JavaScript, WebAssembly, and desktop runtime

The renderer and workers bundle code from packages listed in `package-lock.json`, including their transitive dependencies. Some production-used packages are classified as development dependencies because Vite embeds them in the built renderer; an inventory restricted to `npm --omit=dev` would miss them.

Examples include React and Tiptap (MIT), mathjs (Apache-2.0), Tesseract.js (Apache-2.0), and the license alternatives and notices supplied with DOMPurify. These examples are not a complete inventory. OCR assets copied from `tesseract.js` and `tesseract.js-core` also require the relevant upstream notices.

The generated [third-party inventory](../THIRD_PARTY_NOTICES.md) links to the collected texts under `licenses/`. Some npm packages omit a standalone license file. For those packages, checked-in upstream texts or original license headers live under `third-party-license-sources/`, with upstream URLs and SHA-256 digests recorded in each `sources.json`. The build verifies those digests and copies the files into the packaged notices without network access. Updating one of these package versions requires reviewing and recording the corresponding upstream texts again.

Electron and Chromium ship their own license materials, including `LICENSE` and `LICENSES.chromium.html`. Keep those alongside the redistributed desktop runtime. The installer must also include the project's license and collected dependency/font notices.

## Downloaded OCR data

OCR downloads English trained data from the configured Tesseract language-data host on demand rather than committing it to this source repository. The upstream license and data notices continue to apply. If a future release bundles language data, include the relevant notices with those files.

## Maintainer release check

For every dependency or font update:

1. Review package metadata and the actual LICENSE/COPYING/NOTICE files for all distributed packages and assets, including transitive dependencies.
2. Preserve exact license and copyright texts, plus any upstream NOTICE files, in the application's collected third-party notices.
3. Regenerate notices from the committed lockfile/dependency set before packaging. Do not treat an unrecognized or missing license as permission to redistribute.
4. Inspect the packaged application to verify that original source, font/dependency, and Electron/Chromium notices are present. Check any separately downloaded OCR data terms before changing how that data is distributed.

The package lockfile identifies exact resolved packages. Upstream license files are authoritative if a summary label differs.
