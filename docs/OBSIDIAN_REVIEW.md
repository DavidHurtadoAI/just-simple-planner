# Obsidian release review

Reviewed on 2026-10-30 against the official [developer policies](https://docs.obsidian.md/community-directory/developer-policies), [submission requirements](https://docs.obsidian.md/community-directory/submission-requirements-for-plugins), [plugin guidelines](https://github.com/obsidianmd/obsidian-developer-docs/blob/main/en/Plugins/Releasing/Plugin%20guidelines.md) and [release instructions](https://docs.obsidian.md/Plugins/Releasing/Submit%20your%20plugin).

## Community recommendations — 0.1.2

- Release files are built and attested by [a GitHub-hosted release workflow](../.github/workflows/release.yml), then verified before those same files are published. Actions are pinned by SHA and signing/publishing permissions are job-scoped. See GitHub's [provenance documentation](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations).
- **Vault Enumeration** is an explicit optional capability. From 0.2.0, Search entire vault is on by default; turning it off limits discovery to a selected folder and its subfolders without enumerating the whole vault. Discovery runs on load and when search scope or property mapping changes. Body reads are limited to marked planner notes in the active scope. Later refreshes revisit known paths, while metadata and rename events discover notes entering the scope. The README discloses both modes.
- The container uses a scoped selector instead of `!important`; the package audit rejects that CSS override.

## Code and lifecycle

- `eslint-plugin-obsidianmd` recommended rules run with zero warnings in `npm run check` and GitHub Actions. Strict TypeScript and model tests run in the same check.
- Runtime code uses the public Obsidian API and browser APIs. No Node.js or Electron imports, global debugging `app`, dynamic code execution or unbundled package dependencies.
- Vault changes use `Vault.process` with exact-content conflict checks, including undo and rollback. Whole-document snapshots keep edits to properties and note bodies in one atomic write rather than separate frontmatter/body updates. YAML formatting may be normalized; this is disclosed in the README.
- App events and persistent DOM listeners use registration helpers. Markdown previews have a render-scoped component; observers and animation frames are cleaned up. Plugin unload does not detach workspace leaves.
- UI uses sentence case, theme variables and namespaced CSS. Inline values describe computed timeline geometry or user-selected colors. Commands have stable IDs and no default global hotkeys.
- Settings are searchable through definitions on Obsidian 1.13+, with an imperative fallback for older supported versions. Creation paths are normalized and remain inside the vault.
- Search scope, creation folders and entry-property mapping are explained separately in English. Settings autosave: immediate controls save on change, text fields on blur, Enter or closing the panel. Validation errors remain beside the affected control and preserve the last valid configuration. Saves are serialized and merged into current settings so overlapping edits cannot overwrite each other; controls update in place without discarding other edits. Scoped search requires an existing folder; the four keys must be distinct and cannot use reserved names. Mapped keys are used consistently for reading and writing. Configuration changes do not migrate notes; scope/schema changes clear in-memory undo/redo and reject stale in-flight reads. Saved legacy folders and zoom are preserved.

## Privacy, licensing and packaging

- No account, payment, ads, telemetry, self-updater or network requests of its own. No access to files outside the vault. Embedded resources in user-authored Markdown follow Obsidian's normal renderer behavior.
- MIT license is included. The README prominently credits Haftio as inspiration for this independent implementation.
- Manifest and package versions match `versions.json`. The ID is `just-simple-planner`; the manifest description is within 250 characters and ends with a period.
- GitHub release tags exactly match the manifest version, with `main.js`, `manifest.json` and `styles.css` attached individually. From 0.1.2, these files have GitHub build-provenance attestations. Generated JavaScript and development caches stay out of source control.
- The README includes installation, gestures, property definitions, privacy, screenshots and portable fictional examples.

## Validation limits

In-app checks use the canonical `@Nexus-dev` vault in desktop Obsidian 1.15.0. Minimum-version API availability is checked by the official linter; an actual Obsidian 1.10.2 installation has not been exercised. The runtime avoids desktop-only APIs, so `isDesktopOnly` is false, but physical iOS/Android devices and touch dragging have not been tested. Very large vaults and simultaneous multi-device edits are also untested. See [TESTING.md](../TESTING.md) for the checks and their methods.

This review prepares the repository for submission. Approval and listing in the community directory are determined by Obsidian's review process.
