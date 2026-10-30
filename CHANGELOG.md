# Changelog

## 0.1.2 — 2026-10-30

- Build and publish releases in GitHub Actions with verified provenance attestations for all three installable files.
- Discover planner notes from vault-wide cached metadata once per load; refresh known planner paths thereafter.
- Ignore edits and renames of unrelated notes, retain dynamic opt-in/opt-out and folder moves, and reject stale indexing reads.
- Document the necessary initial Vault Enumeration capability and note-reading scope.
- Replace the container's `!important` with a scoped, more specific selector and check its absence in the package audit.

## 0.1.1 — 2026-10-30

- Use the workflow icon (two connected squares) for the ribbon, view tab and planner heading.
- Name Máquina in the README's account of the experiment.

## 0.1.0 — 2026-10-30

- Initial independent, fully local plugin.
- Dated Markdown entries grouped into threads, independent of file location.
- Continuous timeline, zoom, filters, colors and collapsible rows.
- Markdown entry editor, native note opening and connected-entry creation.
- Connections, flow selection, Spotlight, drag rescheduling and session undo/redo.
- Notebook view and pending-task rail.
- Portable Spanish demonstration with twenty entries and four threads.

- Keep compact, single-line entry previews visible when a thread is folded, including connections, menus and drag interactions.

- Add hover connection handles with pointer drag-and-drop, a live arrow, target highlighting, edge scrolling and cancellation.
- Add a hover disconnect button on connection lines while retaining the card menu actions and session undo/redo.
- Hide a card's connection handle when the mouse leaves, including selected cards; retain keyboard access and active-drag visibility.

- Match Visual Card Writer's middle-button grab-to-pan gesture instead of browser autoscroll; keep left-drag for moving entries.
- Add explicit Shift+wheel horizontal scrolling and suppress native middle-button defaults.

- Add the official Obsidian ESLint rules to CI, searchable settings on Obsidian 1.13+, and the settings fallback for older supported versions.
- Publish installable release assets and the illustrated usage guide with attribution to Haftio.
