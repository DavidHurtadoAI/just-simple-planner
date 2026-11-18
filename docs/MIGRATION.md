# From classic notes to Bases

[Guía en español](MIGRACION.es.md) · [README](../README.md)

## Classic is retired in 0.6.0

Just Simple Planner now runs in the **Simple Planner layout inside Obsidian Bases**. This remains the same plugin ID and the same ordinary Markdown notes. Existing Base files continue working.

The classic timeline and its global editing/index controller have been removed. Old workspace tabs restore a **Planner migration** page; their saved board state is retained for import. The ribbon and **Open planner** command open a Base or a chooser when several exist. Old command IDs remain available, with creation and membership actions scoped to a selected Base.

## Migrate

1. Update the same plugin. Keep your Markdown notes, existing Base files and plugin `data.json`.
2. Enable the built-in **Bases** plugin, then reload Just Simple Planner if necessary. Just Simple Calendar is independent.
3. Run **Just Simple Planner: Create Bases planner from classic notes**, use **Review migration** in settings or the restored migration page.
4. Review entry/thread/connection/invalid counts, the saved property mapping, day width and former creation destinations.
5. Choose a new vault-relative `.base` path and click **Create Base**. Existing files are never overwritten.
6. Wait for **Migration verified** before customizing the Base filters. The initial comparison includes titles, dates, thread membership, connection targets, thread metadata, empty thread rows and invalid-note counts.
7. Try editing, connections, Tasks, Notebook and Undo/Redo in the new Base.

The migrator reads the marked notes on demand. It creates only the new Base and missing parent folders: it does not move, rename, duplicate or rewrite source notes or replace saved settings. A changed source or migration setting invalidates an open review; use **Refresh review** before creating.

## What is retained

- Old common-parent/child folder settings load as full destinations without moving files. These paths are migration information, not query filters or new-note destinations.
- Saved date/title/thread/connections properties and day width are imported per Base.
- Empty thread notes are explicitly pinned as rows.
- Board state from a restored classic tab can be imported. In-memory undo history is not transferred.
- Unknown saved settings survive edits. Global migration settings affect only future imports, never an existing Base.

The initial Base query selects `planner_type: entry` OR `planner_type: thread` throughout the vault. After verification you can filter each Base independently. The verified banner records that initial comparison; it is not a backup or continuous equality check.

## Working in Bases

Each Base owns its query, result limit, property mapping, day width and history. Native Bases creation chooses new-note locations. A restrictive query can exclude a newly created file; the plugin never silently broadens it.

Use **Thread notes** for empty rows, including thread notes outside the query. Removing a row reference does not delete the note. A note shared by several Bases is still one file: editing the same date property or thread metadata changes the same underlying data.

Optional scheduling is selected explicitly in **Configure view**: End date, Repeat, Repeat until, Repeat except and Additional dates. End dates are inclusive. Repeated appearances share their source note; unsupported/ambiguous schedule moves are refused.

**Remove note from planner…** removes only `planner_type: entry`, keeps the file and other data, and supports Undo/Redo. Every Base filtering on that marker is affected. Broader queries can still select the unmarked note.

## Troubleshooting

- **Checking migration persists:** wait for query/body loading, then review filters, result limit, Date property and invalid counts. Resolve differences before treating the import as verified.
- **Simple Planner is absent from Layout:** enable Bases and reload the plugin. The classic timeline is no longer a fallback.
- **Several planners exist:** choose the intended Base. Global creation/membership commands never silently write through another planner's mapping.
- **Old settings look different:** common-parent paths were flattened; source files are untouched. Configure current planners inside their Base.
- **Need the old timeline:** use a previous plugin release with your retained notes/settings. 0.6.0 provides migration, not the classic renderer.

See [TESTING.md](../TESTING.md) for checks and platform limits.
