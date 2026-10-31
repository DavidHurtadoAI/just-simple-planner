# Validation

## Compact layout — 0.3.3

On 2026-10-31, `npm run check` passed all twenty-nine tests, official Obsidian lint, strict TypeScript, the production build and package checks. The central installer installed and verified the working build in the canonical `@Nexus-dev` vault. The final 0.3.3 release build was checked and installed again before publication.

Native checks and screenshots covered the board, notebook and task panel. Board card height is 116 px (previously 136), ordinary rows are 152 px (178), date headers are 52 px (64), thread labels are 184 px wide (220), and toolbar buttons are 26 px high (30). Folded cards are 24 px high in 46 px rows; they remain inside their rows and connections render after folding. The notebook sidebar is 180 px, with 13 px card titles and 12 px body text. The task panel is 248 px wide, with all twelve pending demo tasks retained.

The original Notebook/Board and Tasks buttons remain; no view dropdown was added. The saved horizontal zoom remains configurable. The view state was restored after inspection, the checks did not write note content or saved plugin settings, and Obsidian captured no errors. Screenshots are retained as ignored QA artifacts.

## Explicit planner notes — 0.3.2

On 2026-10-31, `npm run check` passed all twenty-nine unit tests, official Obsidian lint, strict TypeScript, the production build and package checks. The bundle is 59.5 KiB. Central installation and verification passed for 0.3.2 in the canonical `@Nexus-dev` vault.

The updated `scripts/qa-settings.mjs` passed twenty-six native checks. Notes with a valid mapped date but no entry marker, and notes with other marker values, stay excluded; the planner does not load their bodies. Changing an ordinary note's date never opts it in, stale edits and connections are rejected, removing an entry marker opts out, and marked entries still require a valid mapped date. Dated thread notes remain rows, and empty threads survive changing the Planner folder away and back. Unit tests verify that older saved dated-note flags are ignored while paths, mappings and input data are preserved.

The same native suite retained folder scope, relative creation paths, custom property names, modal editing, connections, task changes, exact undo, validation and serialized autosave. Body-read assertions instrument the planner's reader so reads made by other Obsidian components are not attributed to this plugin. The suite restored all original note bytes, the view and the saved settings; additive Spanish fixtures remain archived. The demo retains twenty entries and four threads, with no captured Obsidian errors.

Both README settings screenshots were captured from the actual native Settings window and visually inspected: the dated-note switch and warning are absent, explicit marker requirements are explained, and the folder and property controls remain. Screenshot capture restored the original settings and index without saving. The saved `data.json` retained SHA-256 `793F0FB3A4279C23FAFA7B337CC081683A2AA480F89E48388AF667A105B50914` through installation, native checks and capture.

The sections below record historical validation for their respective versions; dated-note mode was removed in 0.3.2.

## Dated-note performance warning — 0.3.1

On 2026-10-31, `npm run check` passed all twenty-eight tests, official lint, strict TypeScript, build and package checks. Central installation/verification passed. The warning was checked in the installed settings panel and its native screenshot inspected: it explains that many files can significantly slow the interface and that unchecking the option restores normal performance. The demo retains twenty entries and four threads with no captured errors; screenshot capture preserves the saved settings bytes.

## Common base and ordinary dated notes — 0.3.0

On 2026-10-31, `npm run check` passed official Obsidian lint, strict TypeScript, all twenty-eight unit tests, the build and package audit. The installed development build passed thirty in-app cases in `scripts/qa-settings.mjs`. Coverage includes a named base without whole-vault enumeration, optional relative subfolders, empty child paths, creation of a previously absent base on first note creation, empty-thread recovery, folder boundary events, autosave validation/concurrency/failure recovery, legacy scope/path adaptation and all prior mapped-note editing checks.

Ordinary-note checks create Spanish fixtures with a custom `scheduled` date property and no entry marker. Enabling the switch discovers them without changing bytes; missing titles and threads use the filename and Unassigned. Dated thread notes remain rows. Other marker values with valid dates qualify, while invalid dates and the wrong date key do not. Actual modal edits, DOM drag/drop rescheduling, tasks, connections, disconnect and exact undo work without adding planner_type. Adding/removing a date updates inclusion incrementally; disabling the mode removes ordinary cards without rewriting them and rejects stale edits to excluded notes.

The suite restores original settings bytes, all original note contents and the original view, and leaves twenty demo entries, four threads and no captured errors. Additive QA fixtures remain archived. Folder-event checks use `Vault.rename`; full incoming-link rewriting is outside this suite. Native settings screenshots were refreshed with temporary English defaults and inspected. Capturing restores the original index and does not save the example settings.

The final 0.3.0 package passed central installation/verification and an in-app check after reload: all four new controls present, obsolete scope/apply controls absent, twenty entries, four threads, no invalid notes, no pending saves and no captured errors. The saved `data.json` retained the same SHA-256 through installation, reload and opening/closing settings.

## Automatic settings saving — 0.2.2

On 2026-10-31, `npm run check` passed official Obsidian lint, strict TypeScript, all twenty-four unit tests, the build and package audit. The installed development build passed all twenty-three cases in `scripts/qa-settings.mjs`, including the existing property-mapping operations and the new autosave cases: no Apply button, immediate scope switches, recovery of an empty thread, blur/Enter/close saving, inline errors, independent edits while another field is invalid, failed-switch rollback, immediate dropdowns, preservation of unfinished text, overlapping saves with a newer edit, simulated storage failure and successful retry, and legacy rendering with autosave.

Controls synchronize in place. Programmatic updates do not trigger another save, and a restored switch's native checkbox state matches its visual state. The suite restores the exact original `data.json` bytes and original Markdown, retains additive QA notes as archived, and ends with twenty entries, four threads and no captured Obsidian errors. Scope-transition checks use `Vault.rename` events; automatic incoming-link rewriting through `FileManager` is outside this suite. Focus emulation permits background rendering and is disabled after the run.

README settings screenshots were refreshed from the native Settings window using temporary in-memory English defaults. Capture does not save those defaults or edit note files.

The final 0.2.2 package passed central installation/verification and an in-app smoke check after loading the release build: no Apply settings button, the autosave help is present, twenty entries, four threads, no invalid notes, no pending saves and no captured errors. The saved settings file retained the same SHA-256 through installation, loading and opening/closing the settings panel.

## Release build — 0.2.1

On 2026-10-31, the final 0.2.1 build passed `npm run check`, including all twenty-four tests, official Obsidian lint with zero warnings, strict TypeScript and package validation. Central installation and verification reported 0.2.1 OK. After reloading inside Obsidian, the installed plugin showed the new pan hint and adjacent New thread / New entry buttons, with twenty entries, four threads, no invalid notes and no captured errors. The saved `data.json` remained byte-for-byte unchanged through installation and reload.

## Adjacent creation buttons — 0.2.1

On 2026-10-31, `npm run check` and central installation/verification passed. Inside Obsidian, at viewport widths of 1200 and 640 pixels, New thread immediately precedes New entry in one group, on the same row with a 10-pixel gap. Both buttons opened their respective dialogs and were cancelled without creating notes. Native screenshots were inspected; the demo retains twenty entries and four threads, with no captured Obsidian errors.

## Ctrl/Cmd + left-drag pan — 0.2.1

On 2026-10-31, the build passed `npm run check` (official lint, strict TypeScript, twenty-four tests and package audit) and central installation/verification in `@Nexus-dev`. `scripts/qa-modifier-pan.mjs` passed thirteen checks using trusted Chromium mouse input: Ctrl/Cmd clicks select, small jitter stays a click, both modifiers pan from a card without rescheduling or changing selection, the next click remains usable, releasing the modifier mid-drag finishes normally, empty day space supports pan, card buttons retain their action, focus loss cancels a pending pan, and source Markdown is unchanged. Cmd is exercised as the Meta modifier in desktop Windows Obsidian; a physical Mac has not been tested.

All seven existing pan checks and fifteen connection checks also passed, including middle-drag, cancellation, Shift+wheel, ordinary card rescheduling with undo, direct connection dragging and disconnect controls. The new script restores the original view and selection, creates no notes and checks for captured Obsidian errors.

## Search scope and property mapping — 0.2.0

On 2026-10-31, `npm run check` passed the official Obsidian lint rules with zero warnings, strict TypeScript, all twenty-four tests, the build and package audit. The central installer installed and verified 0.2.0 in the canonical `@Nexus-dev` vault.

The focused `scripts/qa-settings.mjs` run passed seventeen checks inside desktop Obsidian 1.15.0: English fresh defaults and legacy settings; rejected invalid configurations without saving; folder-only discovery without whole-vault enumeration or out-of-scope reads; custom-key creation and editing through the actual entry modal; connections, disconnect and undo; date moves and stale-date rejection; task edits and filename fallback; the settings help, draft controls, validation and explicit Apply button; legacy rendering; hidden out-of-scope creation with its continuation link retained; marked notes and previously unknown folders entering and leaving the scope; history reset without automatic property migration; byte-for-byte preservation of all original notes; and no captured Obsidian errors.

Regression suites also passed: eleven index/discovery checks, fifteen direct-connection checks and seven pan checks. Rapid folder renames now ignore stale in-flight reads instead of reporting transient missing-file errors. These are automated in-app checks; the connection suite uses trusted Chromium input and the pan suite uses synthetic events.

The configuration suite restores the exact original `data.json` bytes, the original view and all original Markdown. Additive Spanish QA notes remain under `Pruebas/Just Simple Planner/Ensayos QA` with `planner_type: qa-archived`. The demo still has twenty entries and four threads. No notes, prior fixtures or backups are deleted.

Both README settings screenshots were captured from the real Obsidian Settings window and visually inspected. English defaults and a folder-filter example were supplied temporarily without applying them; the saved configuration remained unchanged. The older rendering fallback was exercised in the current desktop version, not an actual older Obsidian installation.

## English initial folder settings — 0.1.3

On 2026-10-31, `npm run check` passed the official Obsidian lint rules, strict TypeScript, all fourteen model tests, the build and package audit. The central installer installed and verified 0.1.3 in `@Nexus-dev`.

A new plugin instance's constructor defaults were checked as `Planner/Entries` and `Planner/Threads`. Those defaults were temporarily supplied in memory to the installed settings tab, where both English paths rendered correctly. The original settings object was restored without saving. The existing `data.json` remained byte-for-byte unchanged through installation, plugin reload and the in-app check; its two configured creation folders and zoom were retained. The demo still had twenty entries and four threads, and Obsidian captured no errors.

## Community review update — 0.1.2

On 2026-10-30, `npm run check` passed all fourteen model tests, the official lint rules, strict TypeScript, the build and package audit. The package audit now rejects `!important` in the stylesheet.

The canonical-vault `scripts/qa-index.mjs` run passed eleven checks: one-time discovery reads only marked notes; later and overlapping refreshes do not enumerate files; unrelated edits and renames are ignored; newly marked notes are discovered and updated; folder moves preserve membership while ignoring unrelated children; opt-out removes a card without deleting its file; an in-flight cached read cannot overwrite a newer snapshot; the scoped container still has zero padding and hidden overflow; all original Markdown and demo counts are retained; and Obsidian captures no errors. Two additive QA notes remain archived in `Ensayos QA/Privacidad del índice QA`; the test restores their content and never deletes them.

Release 0.1.2 uses `.github/workflows/release.yml` to build, check, attest and publish all three installable files. The workflow verifies provenance before publishing. SHA-pinned actions and job-scoped signing permissions are used. The README documents independent verification with `gh attestation verify` and discloses the intentional initial Vault Enumeration capability.

## Workflow icon update — 0.1.1

On 2026-10-30, `npm run check` passed the official Obsidian lint rules, strict TypeScript, all fourteen model tests, the build and package audit. The central installer installed and verified 0.1.1 in `@Nexus-dev`. After reloading the plugin, an in-app check confirmed `lucide-workflow` in the ribbon, the view tab and the planner heading, with twenty entries, four threads and no captured Obsidian errors.

## Initial release validation

Recorded on 2026-10-30. The only integration test vault is the canonical `@Nexus-dev` inside the Obsidian-dev workspace. The maintainer scripts verify its resolved absolute path before testing.

Result: **14 unit tests and 12 in-app integration checks passed**. The central installer verification reports `just-simple-planner 0.1.0: OK`. The final demo has 20 entries, 4 threads, 18 connections and 12 pending tasks.

## Automatic checks

`npm run check` runs the official Obsidian ESLint rules with zero warnings, strict TypeScript checking, twenty-eight Node tests, the production bundle and the package audit. The tests exercise invalid dates, leap years and DST boundaries, wikilinks, cyclic/branched connections, Spotlight, date-gap preservation, overlapping cards, fenced-code task exclusion, CRLF preservation, multi-file rollback, rollback conflicts and history behavior. Settings tests cover isolated English defaults, legacy loading, folder validation and scope boundaries, independent creation folders, reserved and duplicate keys, exact mapped reads, simultaneous mapped writes, index-reset conditions and history clearing.

The package audit checks matching versions, required distribution files and zero runtime dependencies. The JavaScript bundle is approximately 60.7 KiB, with Obsidian as its only external runtime module.

## Direct connection widgets — 2026-10-30

`npm run check` passes all fourteen unit tests. The focused `scripts/qa-connections.mjs` run passed fifteen checks inside the canonical vault, using Chromium mouse input through Obsidian's official CLI:

- Hovering an actual card reveals a usable connector.
- Dragging shows a live arrow and highlights the cross-thread target.
- Dropping saves a normal `next` wikilink without moving either note.
- Repeated drops do not duplicate links or create extra history.
- The three-dot menu retains Connect to and Disconnect.
- Hovering a line reveals its clickable disconnect widget.
- Clicking the widget disconnects; undo restores the link and then the exact original note.
- Dropping in empty space cancels without creating notes.
- Escape cancels a gesture even over a valid destination.
- Self-connections are not created.
- Holding the pointer near the board edge scrolls while preserving the gesture.
- Pointer cancellation removes the preview without writes.
- Keyboard activation of a card handle opens the target picker.
- Every fixture retains its exact original Markdown contents after the run.
- No Obsidian errors are captured during hover, drag and disconnect. Disconnect controls use native HTML buttons inside the SVG so Obsidian's tooltips receive a supported HTMLElement.

The script temporarily enables focus emulation so requestAnimationFrame runs while Obsidian is in the background, then disables it and restores the original view and source notes. These are automated Chromium input events, not a human mouse session. The pointer-cancel case uses a synthetic PointerEvent. No additional notes are created by this suite.

Real screenshots were saved and inspected: `qa/conexion-arrastrando.png` shows a source handle, live arrow and highlighted target; `qa/desconexion.png` shows the line's hover disconnect control. The pan regression suite is run separately after the update.

## Pan consistency update — 2026-10-30

`npm run check` still passes all fourteen unit tests. Seven focused checks in `scripts/qa-pan.mjs` passed inside the installed plugin in the canonical vault:

- Middle-drag right/down moves the content right/down, using the same scroll-delta signs as Visual Card Writer.
- The reverse gesture also works when it starts on a card, without rescheduling the entry.
- Pointer cancellation and lost capture end panning; the left button does not start viewport pan.
- Native middle-button autoscroll and auxiliary-click defaults are prevented.
- Shift+wheel uses Visual Card Writer's horizontal direction and normalizes line deltas.
- Card dragging to the right still advances the date by one day and can be undone.
- All participating Markdown files retain their exact original contents after the checks.

These are synthetic pointer/drag/wheel events executed inside Obsidian, not a human mouse session. The script restores the temporary viewport size and scroll position. The central installer verification reports OK after installation.

## Inside Obsidian

`scripts/qa-obsidian.mjs` uses the installed official Obsidian CLI against `vault=@Nexus-dev`. Both the host script and each evaluation check the exact canonical vault path. It does not require a CDP listening port or create another vault.

The integration run checks:

1. The plugin loads and indexes twenty entries, four threads and no invalid notes.
2. Multi-note moves, undo and redo preserve source Markdown.
3. Creating a connection and undoing it restores the note.
4. Completing a task updates its Markdown checkbox and can be undone.
5. A stale editing snapshot is rejected without writing.
6. Filtering and the Board/Notebook buttons display the expected cards.
7. Notebook date navigation scrolls to the requested entry.
8. Drag/drop DOM events move a connected eight-entry flow, including a cross-thread branch, and undo restores every date.
9. Double-click opens the card editor.
10. Selecting a card and pressing Tab opens creation, inherits the next day and thread, saves a real Spanish Markdown note, and connects it to the source.
11. Moving a fixture to another folder and back retains its thread and total entry count.
12. The final board still has the original twenty entries and four threads.

The additional capture fixtures are retained in `Pruebas/Just Simple Planner/Ensayos QA` with `planner_type: qa-archived`; they are not planner entries. No notes or backups are deleted. The original continuation link is restored after the capture test. Moving files through Obsidian may normalize their incoming wikilinks and YAML quoting. The additive demo generator deliberately refuses to reset such changed files.

After the run, the plugin is reloaded to clear test history and the planner is left open. New-note folders in this development vault point to the demo's `Entradas` and `Hilos` directories.

## Visual review

Real screenshots were captured using `dev:screenshot` and inspected for the installed plugin in Obsidian 1.15.0 with the vault's existing light theme:

- `qa/tablero-final.png`: timeline, sticky labels, colors and cross-thread connections.
- `qa/tareas.png`: twelve pending tasks from the demo, with note references.
- `qa/cuaderno.png`: chronological notebook with the same source notes and task rail.

DOM drag events are automated integration checks. A human mouse-drag session, physical phones/tablets, very large vaults and simultaneous multi-device synchronization have not been validated.

## Folded previews and README screenshots

Collapsed threads were checked inside Obsidian: all five entries remain as compact, single-line cards; the row is 54 pixels high for one entry per day; body previews are omitted while note menus and connection handles remain. Expanding restores full cards. The README's native viewport captures use only fictional planner notes. The entry-menu close-up is the original user-provided screenshot. No note contents were changed during capture.

## Connector visibility

Trusted Chromium mouse and keyboard events verified that hovering reveals the circular connector, and leaving hides it even while the card remains selected and mouse-focused. Repeated hover, keyboard focus, and visibility during a connection drag were also checked. Cancelling the drag hides the connector again; every entry's Markdown remained unchanged, and Obsidian reported no errors.

## First public release audit — 2026-10-30

The final 0.1.0 bundle passed `npm run check`, including the official Obsidian recommended lint rules with no suppressed rules and zero warnings. `npm audit` reported zero vulnerabilities across development dependencies as well; the development-only Moment dependency is pinned to its patched version through an override. The package audit checks manifest fields, synchronized versions, required files, absence of network/dynamic-code primitives, and that only `obsidian` remains external to the bundle.

After central installation and verification, the release build passed all fifteen connection checks and seven pan checks in desktop Obsidian 1.15.0. An additional read-only in-app check verified the four searchable settings definitions, the two folder inputs and zoom dropdown, their stored values, and the pre-1.13 rendering fallback. Obsidian's hidden measuring dropdown was excluded when counting controls. Compact previews were checked again; the demo retains twenty entries, four threads, eighteen connections and no invalid notes. No Obsidian errors were captured.

The current official community registry had no matching plugin ID or name. The review scope and minimum-version/mobile limitations are documented in [the Obsidian review notes](docs/OBSIDIAN_REVIEW.md). Community directory submission is performed separately by the maintainer.
