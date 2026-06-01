# CLAUDE.md

## Project

Private Obsidian plugin — not published to community plugins. Single-file TypeScript plugin (`main.ts`).

## Build

```sh
npm run build
```

Produces `main.js` via esbuild. Deploy by copying `main.js` + `manifest.json` to the vault's plugin directory.

## Target vault

`/home/zniszcz/Dokumenty/zniszcz-home/.obsidian/plugins/moc-prev-next/`

## Conventions

- Keep it minimal — one file, no unnecessary abstractions
- Obsidian API types imported from `obsidian` package (external in bundle)
- Frontmatter fields are in Polish: `poprzednia`, `następna`, `kurs`
