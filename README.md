# obsidian-lessons-templater

A small Obsidian plugin that inserts a lesson template and automatically fills in previous/next navigation links based on a Map of Content (MoC) note.

## How it works

1. You create a note whose name matches an entry in your MoC
2. Run the command from the command palette
3. The plugin inserts your chosen template and sets `poprzednia` / `następna` frontmatter fields to the adjacent entries in the MoC

## Commands

- **Insert template and fill previous/next** — inserts the configured template into the active note, then fills prev/next links
- **Fill previous/next from MoC** — only fills prev/next links (no template insertion)

## Settings

- **Template** — dropdown listing files from your Obsidian core Templates folder

## Assumptions

- The lesson note has a `kurs` frontmatter field with a `[[wikilink]]` pointing to the MoC note
- The MoC contains a line matching `* # Spis treści` (with any leading whitespace/indentation) — only `[[wikilinks]]` below that line are parsed
- Duplicate links in the MoC are deduplicated (first occurrence wins)
- The note's filename (basename) must exactly match a link target in the MoC
- Previous/next are stored in frontmatter fields `poprzednia` and `następna`
- First and last entries get an empty string for their missing neighbour
- The template dropdown reads the folder path from Obsidian's built-in Templates core plugin settings

## Build

```sh
npm install
npm run build
```

Copy `main.js` and `manifest.json` to `<vault>/.obsidian/plugins/moc-prev-next/`.
