# Contributing

Thanks for helping improve Notes for Windows. Focused bug fixes, accessibility improvements, documentation, and tests are welcome.

## Set up

Use Windows, Node.js 24, and npm. Follow the development instructions in [README.md](README.md). Install from the committed lockfile with `npm ci`; do not commit `node_modules`, `dist`, `release`, cached models, real notebook data, or test output.

## Report an issue

Include the app version, Windows version, steps to reproduce, and what you expected. Use fictional notes in screenshots and attachments. Never upload your password or private notebook backup. For data loss, stop editing and preserve the data and recovery files locally before trying repairs.

## Propose a change

1. Open an issue for substantial behavior changes so scope can be discussed.
2. Make a focused change on a branch. Keep storage migrations compatible with existing notebooks and keep new network access explicit.
3. Run `npm test`, `npm run build`, and `npm run test:ui`. For storage, encryption, IPC, or packaging changes, also run `node scripts/desktop-smoke.cjs` and `node scripts/release-safety-smoke.cjs` after building.
4. Include the problem, resulting behavior, test results, and screenshots for visual changes in your pull request. Explain anything you could not verify.

Use the isolated test profile used by the Electron smoke script rather than your real notebook. Do not overwrite user data to capture screenshots or test a migration.

## Dependencies and assets

Keep dependency changes intentional and commit the updated lockfile. Include the original license and copyright notices for fonts and other redistributed assets, and preserve upstream NOTICE files. This project's MIT license does not replace dependency or font licenses. See [third-party licensing notes](docs/third-party-licenses.md).

Contributions to original project code are accepted under the project's MIT license. Include attribution for third-party code and assets rather than implying authorship.

## Releases

Update the version in `package.json` and `package-lock.json`, update `CHANGELOG.md`, and complete the documented checks. Push a tag matching the package version, such as `v1.0.3`, to trigger the Windows release workflow. The workflow validates the version, builds without automatic electron-builder publishing, and attaches the unsigned installer and checksums to GitHub Releases. Review the release assets and notices before announcing a release.
