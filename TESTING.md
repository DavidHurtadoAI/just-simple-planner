# Validation

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

`npm run check` runs the official Obsidian ESLint rules with zero warnings, strict TypeScript checking, fourteen Node tests, the production bundle and the package audit. The tests exercise invalid dates, leap years and DST boundaries, wikilinks, cyclic/branched connections, Spotlight, date-gap preservation, overlapping cards, fenced-code task exclusion, CRLF preservation, multi-file rollback, rollback conflicts and history behavior.

The package audit checks matching versions, required distribution files and zero runtime dependencies. The JavaScript bundle is approximately 45 KiB including the connection widgets, with Obsidian as its only external runtime module.

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
