# Validation

## 0.5.5 native keyboard priority — 2026-11-03

The combined native battery exposed an F2 conflict that isolated DOM-key tests missed: after a Base was active, Obsidian's global F2 handler opened Rename for that file before the Planner's bubbling listener received the event. A focused Planner now pushes a native Obsidian keymap scope for its existing keyboard actions and releases it on focus exit/unload. Already handled keys are not dispatched again by the bubbling listener. Input/button/link handling continues through ordinary Obsidian routing.

The classic editor regression activates its leaf and sends a trusted Chromium F2. The visibility suite adds trusted F2 in a Bases planner and then outside/after closing Planner, checking that Obsidian's file-rename behavior is restored without renaming the fixture. The complete battery is now **152 native checks** (eight visibility checks; the other counts in the table below are unchanged), plus the 63 unit tests and source/package checks. No physical mobile/touch validation is claimed.

## 0.5.4 expanded regression and hidden-tab correction — 2026-11-03

The expanded regression reproduced another runtime issue on 0.5.3: updating a note while its Base tab was hidden saved `scrollLeft: 0` instead of the previously visible 4200 px position. Reopening or revealing the tab could then move its date window. The shared surface now defers rendering while its viewport has no width, retains its last visible scroll position, and applies pending data/restored state when ResizeObserver reports a visible pane. Hidden scroll events cannot extend the date window or overwrite the saved position.

`npm run check` passes all 63 unit tests, strict TypeScript, official lint with zero warnings, the production build and package checks. Native testing uses the installed build in the canonical Windows desktop `@Nexus-dev` vault. The complete battery has 150 checks across twelve suites:

| Suite | Checks | Coverage |
| --- | ---: | --- |
| Migration button | 9 | Banner/command, review, retry/error paths, repeated activation, paused index and a trusted Chromium mouse click on Create Base |
| Bases | 24 | Migration, separate queries/mappings/histories, native creation, graph scope, edit conflicts, persistence and closed sessions |
| Scheduling | 15 | Repetition, limits/exceptions, additional dates, shared note identity, schedule editors and concurrent edits |
| Spans | 12 | Inclusive end dates, overlapping/clipped ranges, graph geometry, drag offsets, durations and exact undo |
| Card sizes | 7 | Empty/full bodies, complete filename fallback, packing, arrows, folding and Notebook |
| Classic UI | 12 | Actual editor controls, cancellation, keyboard editing/moves/undo/redo, multiselection, Tab continuation, search, Notebook, tasks and stale drafts |
| Membership/settings | 18 | Note enrollment/removal, calendar dates, custom properties, creation destinations, autosave and conflict guards |
| Classic index | 12 | One discovery pass, incremental changes, folder moves, opt-in/out, schema reset and stale-read races |
| Middle pan | 7 | Direction, cancellation, defaults, wheel behavior, card drag and unchanged Markdown |
| Modifier pan | 13 | Trusted Ctrl/Cmd mouse input, selection, jitter, movement, release, buttons and blur |
| Connections | 15 | Trusted hover/drag, exposed line/widget hit testing, disconnect/undo, cancellation and accessible picker |
| Visibility | 6 | Hidden updates, reveal, repeated tab switches, hidden close/reopen, pending restoration and Notebook vertical position |

Run `node scripts/qa-exhaustive.mjs` with Obsidian's CLI available and `@Nexus-dev` open. Optional positional arguments select suites, for example `node scripts/qa-exhaustive.mjs visibility migration-button`. The runner snapshots every pre-existing Markdown/Base file's SHA-256, checks original Markdown and the settings file after the run, restores the saved workspace layout and records results under ignored `qa/exhaustive-*/` folders. Existing Base file rewrites are reported separately because native view-state autosave can update them. It never repairs an unexpected source-note change by overwriting it. Fixtures are additive, timestamped and retained as archived notes.

The older index/membership drivers now use the current baseline rather than a fixed 20-entry demo. The new classic UI suite replaces the old fixed-demo smoke assumptions for this battery. Dialog checks wait for Obsidian's closing transition before sending the next keyboard action. The classic editor test explicitly activates its workspace leaf and sends trusted Chromium F2 input, so it does not depend on synthetic keyboard routing or the previously active Base. Each suite checks the native error buffer; focus emulation is disabled and the workspace restored at the end. This is desktop integration and trusted-input coverage; physical mobile/touch and older Obsidian versions have not been validated.

## 0.5.3 migration-button correction — 2026-11-03

Reproduced the 0.5.2 failure by opening the review, filling a new QA path and clicking the actual Create Base DOM control: it looked enabled, but no creation ran. The ButtonComponent had been disabled through its API and re-enabled only by removing the HTML attribute, leaving its internal disabled state set. All migration-button state changes now use ButtonComponent.setDisabled.

`npm run check` passes the existing 63 unit tests, official lint, strict TypeScript, production bundle and package audit. `node scripts/qa-migration-button.mjs` adds eight native UI scenarios that activate the classic banner and command, then click the actual dialog controls rather than call the creation helper. They cover initial creation and verification, no classic view open, Refresh review, existing and invalid paths with retry, a changed-note review requiring refresh, and repeated clicks. Original notes/settings and workspace layout are checked/restored; the fixture and created Bases are retained. The UI suite also checks resuming classic discovery after a note was unenrolled while monitoring was paused. Fresh discovery now removes those stale cached entries before the migration review. The 24 existing Bases integration checks also pass on the installed build.

The regression uses DOM button activation through the official Obsidian CLI; it does not claim physical mouse/touch coverage. The error buffer is empty. The earlier 0.5.2 suite verified the creation helper and cancellation but missed this disabled-component behavior in the primary button.

## 0.5.2 public release preparation — 2026-11-03

The consolidated public release includes the Bases transition and both scheduling/rendering corrections below. The final source passes `npm run check`: zero-warning official lint, strict TypeScript, 63 unit tests, production bundling and package audit. The installable build is installed and verified through the central installer in `@Nexus-dev`.

All six native suites pass again on the release build: 12 spans, 15 scheduling, 24 Bases transition, seven card-size, seven pan and fifteen trusted-input connection checks, for 80 in-app checks. Original notes and classic settings are compared with snapshots; the Obsidian error buffer is empty.

Seven new screenshots were captured directly from Obsidian with fictional Spanish notes: Bases board, separate planners, multi-day source properties, Optional scheduling, Notebook/tasks, the classic deprecation banner and migration review. `scripts/capture-bases-release.mjs` guards the canonical vault, retains its examples as archived, checks original notes/settings and restores the saved workspace layout. README, release notes and the English/Spanish migration guides explain the same-plugin transition, the retained classic view without a removal date, additive migration, query/creation differences and scheduling limits. Relative documentation/image links and the exact release tag/notes file are checked before publication. GitHub Actions runs the source checks again, then builds and attests/verifies the three release assets.

## 0.5.2 local multi-day rendering correction — 2026-11-03

The configured End date now extends a card through its inclusive last day. Interval packing accounts for the entire range, variable card heights, the Base's order and folded rows. Ongoing notes and repeated occurrences are projected when any part overlaps the loaded window; only their drawing is clipped. Notebook retains ordinary historical notes and displays their full ranges. Single-day boards keep their original per-day packing path.

`npm run check` passes lint, strict TypeScript, 63 unit tests, production bundling and package validation. Eight new tests cover inclusive columns, mixed-height collisions, Base order, compact rows, board clipping, invalid ends, ongoing ranges, repeated durations and historical Notebook ranges.

`node scripts/qa-spans.mjs` passes 12 in-app scenarios: two-column cards with the correct height; overlapping spans; both board edges; repeated durations; malformed ends and separate additional days; connection geometry; dragging from the second day; dragging a clipped range; connected-flow moves with exact undo/redo; compact rows; Notebook/tasks; and clearing/remapping the End date selector without rewriting the note. Written timestamps and UTC offsets survive moves. Spanish fixtures are additive and retained as archived, and every original note and the classic settings file are compared with their pre-test bytes. The CLI preparation is split into small calls because oversized Windows CLI evaluations can return no result.

The final installed build also passes all 68 existing in-app scheduling/Bases/card-size/pan/connection checks (80 including the new span suite). The connection driver presses inside the connector and chooses an exposed line segment, so intersecting arrows or pane boundaries cannot redirect the test; cleanup verifies exact original bytes even after a failed gesture. Card-size fixtures now use timestamped folders so a date change cannot overwrite yesterday's fixtures.

The user's actual "Preparar la publicación" card was reopened and visually inspected in Obsidian: it occupies November 3 and 4 as one 260 px card at the Compact day width. All 25 original entry/thread files and classic settings match their pre-QA snapshots. The Obsidian error buffer is empty. These checks preceded the public release preparation documented above.

## 0.5.1 local scheduling correction — 2026-11-02

Optional scheduling now projects repeat and additional dates in Bases planners. The 0.5.0 main-day-only limitation below is superseded. Every appearance retains one source file, one task set and note-level connections; classic scheduling behavior is unchanged. The user-created weekly meeting is retained as originally written. No GitHub publication was made.

`npm run check` covers 55 unit tests, strict TypeScript, lint, the production bundle and package audit. Twelve scheduling tests cover weekly windows beyond the anchor, repeat-until/exclusions, month/year clamping, malformed values, additional-date deduplication, durations, long-duration projection and Notebook history.

`node scripts/qa-scheduling.mjs` passes 15 scenarios in actual Obsidian: weekly and additional-date cards, shared selection, note-level graph anchors, connections from/to later appearances, move guards, original-date editing, Notebook/tasks, folding, both schedule editors and exact undo. Concurrent body edits survive schedule saves; concurrent schedule edits reject Save and retain the draft. Malformed limits warn, removing a mapping never rewrites the note, Cancel never writes, and closing a Base closes its schedule editor. Timestamped Spanish fixtures are retained as archived; original notes and classic settings are checked byte for byte. The Obsidian error buffer is empty.

The final installed build also passes the 24 Bases integration scenarios, seven card-size checks, seven pan checks and fifteen connection checks, including trusted Chromium mouse input. Native screenshots were inspected for the user's weekly note on a later Monday and the expanded Optional scheduling group. All 25 entry/thread source files match the pre-QA snapshot, including the user's existing end-date edit; classic settings are unchanged. The new scheduling projection is independent of Calendar; that plugin is not modified or required.

## 0.5.0 local Bases transition — 2026-11-02

This is a local preview; no GitHub push, tag or release was made. The central installer installs and verifies the same plugin ID in the canonical `@Nexus-dev` vault, preserving `data.json` and backing up replaced assets.

`npm run check` passes official lint with zero warnings, strict TypeScript, 43 unit tests, the production bundle and package audit. Tests cover migration configuration and order-independent graph/thread comparison, no copied note bodies or folder search filters, datetime/range preservation, invalid dates, and Base-sorted same-day stacking as well as the existing model/history/settings cases.

`node scripts/qa-bases.mjs` passes 24 scenarios in actual Windows desktop Obsidian 1.15.0. It guards the canonical path, creates additive Spanish fixtures in timestamped `Pruebas/Just Simple Planner/Transición Bases QA/` folders, retains them as `qa-archived`, and checks original note bytes and the classic settings file before finishing. Coverage includes:

- Migration of the 20-entry, four-thread demo, verification of connections/thread metadata, empty rows, refusal to overwrite an existing Base or traverse outside the vault, and cancelling the review.
- Two simultaneous Base queries, unmarked selected notes, independent property mappings and histories, and no classic discovery while only Bases planners are used.
- Short/full cards, Markdown body search, Notebook, task rail, folding, exact undo/redo and complete-flow drag through the shared DOM surface.
- Native Bases creation of dated entries with a body and a connected continuation, and thread notes retained as empty rows. Folder selection follows the Base rather than the classic settings.
- Preserved written times, UTC offsets and end-date durations; refusal of configured repeating-schedule moves and computed-date writes.
- Stale snapshot rejection, refusal to edit outside the query, outside-connection indicators and refusal of incomplete-flow moves.
- Concurrent edits through a second planner: undo rejects the conflict, and ordered undos restore the exact original Markdown.
- Invalid configuration displayed in an empty Base, old editor drafts retained after mapping changes, closed-session refusal, and saved mapping/folding/scroll position after closing and reopening the Base.

Classic regression suites also pass: seven card-size checks, seven pan checks and fifteen connection checks. Connections include trusted Chromium pointer/keyboard events through the official CLI; the captured Obsidian error buffer is empty. These scripts now reach the shared surface through the retained classic workspace view. Focus emulation is enabled only for automation and restored afterward.

Native screenshots from Obsidian's CLI were inspected for the Bases board, Notebook/task rail and the classic transition banner. The final development vault contains `Pruebas/Just Simple Planner/Planner - Bases para probar.base` and a Spanish testing guide. All 24 original entry/thread Markdown files also match a baseline saved before the first migration attempt. No original notes or classic settings were moved, renamed or rewritten.

Physical mobile/touch behavior, older Obsidian versions and very large vaults have not been validated. The new view represents one card per note, at its main day; occurrence-specific graph nodes are outside this preview. End dates and schedule protection apply to properties explicitly selected in the Base view.

## README drag-and-drop recording — 2026-11-01

The README's GIF was recorded in desktop Obsidian 1.15.0 with the installed 0.4.1 plugin in the canonical `@Nexus-dev` vault. A fictional `Pruebas/Notas dispersas/Reunión con Aurora.md` note starts without `planner_type`, outside the plugin's creation folders. The recording starts a real file-explorer drag using trusted Chromium mouse input, intercepts the drag data produced by Obsidian, drops onto the course thread, reviews the unchanged date and proposed properties, clicks Add to planner, and shows the new card alongside the original explorer file.

`scripts/record-drag-demo.mjs` provides prepare, record, restore and encode modes. Chromium screencast frames capture the actual application; a recording-only cursor overlay makes the pointer visible. ImageMagick samples and optimizes the frames and crops window chrome and unused lower space. The original note is restored by exact Undo after recording; all twenty original entries, four threads, their Markdown bytes, the saved settings and history are preserved. The explorer and planner view are restored, and Obsidian captures no errors. Raw frames and session logs stay out of source control. Physical macOS/mobile recording is outside this check.

## Left-aligned thread titles — 0.4.1

On 2026-10-31, `npm run check` passed all thirty-three unit tests, official lint with zero warnings, strict TypeScript, the build and package audit. Central installation and verification passed in `@Nexus-dev`.

Native checks covered all four demo threads in expanded and folded states. Computed styles use `justify-content: flex-start` and `text-align: left`; arrows start at their button's left edge, and all titles share the same horizontal starting position regardless of title length. A direct Chromium screenshot was visually inspected. The demo retains twenty entries and four threads, with no captured errors; the view was restored and saved settings kept their original SHA-256.

## Existing notes and storage-only folders — 0.4.0

On 2026-10-31, `npm run check` passed all thirty-three unit tests, official Obsidian ESLint rules with zero warnings, strict TypeScript, the production build and package audit. Central installation and verification passed in the canonical `@Nexus-dev` vault. The final bundle is 69.9 KiB.

`node scripts/qa-membership.mjs` passed eighteen in-app checks: legacy destinations, cancellation without writes, thread and day drops, Obsidian-prevented drops, shared calendar-date warnings, exact addition/removal Undo and Redo, no-op duplicate prevention, ordinary internal card moves, concurrent body-edit protection, rename and mapping guards, other marker types, scattered files surviving destination changes, creation paths, incremental metadata discovery and settings autosave/validation. It verifies all original note bytes and restores the saved settings exactly. Spanish QA fixtures are additive and retained as archived; the demo returns to twenty entries and four threads. `qa-settings.mjs` now delegates to this current suite; older scope tests remain in previous release tags.

The final build passed the membership suite again after reload. The driver waits for the scheduled render of a thread it creates directly, since this bypasses ThreadModal's immediate refresh. This is a maintainer-test synchronization change and does not change the release assets.

The existing `qa-index.mjs` suite passed twelve checks, including one cached-property discovery pass, no body reads for unrelated notes, incremental enrollment, moves, opt-out and stale-read protection. A new regression case reproduces a schema reset during asynchronous discovery and verifies that a fresh pass restores every marked note. `qa-connections.mjs` passed fifteen checks with trusted Chromium mouse input: hover controls, cross-thread connection dragging, repeated drops, menus, disconnect/Undo, cancellation, edge scrolling and preserved Markdown. The connection driver now focuses and restores the visible test viewport around menu dismissal; hidden or scrolled-away fixtures cannot provide valid pointer coordinates.

Windows UI checks exercised the actual file-explorer Add and Remove menus and review buttons. Chromium's trusted `Input.dispatchDragEvent` protocol exercised an Obsidian URI drop onto a thread header, followed by saving in the real review modal and removing through the real explorer menu. The note kept its date, calendar flag, original path and body. Synthetic DOM cases additionally cover day-cell and already-prevented drops. The Windows drag helper did not produce a complete OS dragover/drop sequence; a fully physical explorer-to-board gesture is therefore not claimed. Physical macOS/mobile dragging and very large vaults remain untested.

All completed suites ended without captured Obsidian errors. Settings screenshots were captured from the actual native Settings window using temporary in-memory defaults, inspected visually, and restored without saving. The enrollment screenshot uses an additive fictional Spanish note and the real modal, captured through Chromium and cancelled without enrollment. The saved development settings retained SHA-256 `5829BBCCCE431B4C9D56B3C0A5E2FC7988C9CFEED2366B8FFFD946F70AB97887` through installation, tests and capture.

## Zoom toolbar buttons removed — included in 0.4.0

On 2026-10-31, `npm run check` passed all twenty-nine tests, official lint, strict TypeScript, the build and package checks. Central installation and verification passed in `@Nexus-dev`. Native checks confirmed that both board and notebook omit Zoom in/out while retaining Earlier, Today, Later, Undo, Redo and Tasks. Day width remains configurable in settings. The original view was restored, the twenty entries and four threads remain, saved settings retained the same SHA-256, and Obsidian captured no errors.

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

## Automatic card sizes and filename fallback — 2026-11-02

Version 0.4.2 passes `npm run check`, including all thirty-six unit tests. New model cases cover empty/whitespace-only bodies, Markdown content, mixed-height same-day stacking and folded spacing.

After central installation and verification, `node scripts/qa-card-sizes.mjs --preview` passed seven checks inside desktop Obsidian 1.15.0 in the canonical `@Nexus-dev` vault:

- Title-only cards are 68 px high; cards with content retain their 116 px preview. Two-line titles and card controls remain available.
- A configured title takes precedence. Missing or empty titles use the complete filename without `.md`, preserving date prefixes.
- Mixed-height cards on the same day retain 16 px gaps, fit inside their row and have correctly centered connection arrows.
- Adding content increases the height; undo restores the short card and exact original Markdown.
- Folding gives every card the existing 24 px compact height; expanding restores the content-based sizes.
- Notebook title-only cards omit the empty preview and shrink accordingly.

The installed view was also inspected visually with the existing light theme, including a filename beginning with `2026-11-02 - `. These are DOM-based integration checks and visual inspection; no physical mobile/touch validation was performed. `--cleanup` archives the named QA fixtures without deleting them and verifies that all original planner notes remain byte-for-byte unchanged. The script refuses to write outside the canonical vault or overwrite differing existing fixtures.
