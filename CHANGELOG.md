# Changelog

## 0.3.1 — 2026-10-31

- Add a performance warning beside Show all dated notes, explaining that large vaults may slow down the interface and that unchecking the option restores normal performance.

## 0.3.0 — 2026-10-31

- Replace Search folder and Search entire vault with a common Planner folder. Empty searches the entire vault; optional entry/thread subfolders are relative to this base and empty saves directly in it.
- Show resolved creation destinations, create missing folders on first note creation, and adapt older settings without moving notes.
- Add Show all dated notes, off by default, to include ordinary notes with a valid configured date. Thread notes remain rows.
- Support mapped edits, drag rescheduling, tasks, connections and exact undo on ordinary dated notes without adding planner_type.

## 0.2.2 — 2026-10-31

- Remove Apply settings. Save switches and dropdowns immediately, and text fields on blur, Enter or closing settings.
- Show inline validation and save feedback, retain the last valid configuration, and restore immediate controls when saving fails.
- Keep Search folder visible so it can be configured before turning off whole-vault search.
- Serialize overlapping saves without losing newer edits or rebuilding the settings controls.

## 0.2.1 — 2026-10-31

- Keep New thread immediately before New entry in a single toolbar group, including when the toolbar wraps.
- Add Ctrl/Cmd + left-button drag to pan the board, preserving Ctrl/Cmd-click selection, ordinary card dragging and interactive controls.

## 0.2.0 — 2026-10-31

- Add Search entire vault, enabled by default, and an optional Search folder with recursive folder-only discovery.
- Make the date, title, thread and connection property names configurable, retaining the default keys date, title, thread and next.
- Apply mappings consistently to note creation, editing, date moves, task updates and connections.
- Organize settings into clear sections with English help, validation and explicit Apply settings.
- Keep search scope independent of note creation folders; explain and notify when new notes are saved outside the visible scope.
- Preserve existing saved settings and notes on update. Mapping changes do not migrate note properties; scope/schema changes clear session history and rebuild the index safely.

## 0.1.3 — 2026-10-31

- Default new installations to `Planner/Entries` and `Planner/Threads`, so initial folder settings are in English for every app language.
- Keep all existing saved folder settings and notes unchanged on update.

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
