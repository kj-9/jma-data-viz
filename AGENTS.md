# Repository Guidelines

## Project Structure & Module Organization
`docs/` holds the MapLibre client served via GitHub Pages: `index.html` bootstraps MapLibre and pmtiles while `main.js` swaps point sources, updates the legend, and wires UI events. Generated artefacts live in `docs/tile/temperature/` (`style.json`, `dates.json`, `{YYYYMMDD}.pmtiles`). Data-production helpers live in `scripts/` and expect the sibling `jma-data/` folder created by `scripts/clone-data.sh`.

## Build, Test, and Development Commands
- `bash scripts/clone-data.sh` — clones the sparse `jma-data` repo and decompresses `jma.db.gz`.
- `bash scripts/make-dates-json.sh` — pulls distinct forecast dates via `sqlite-utils` + `jq`, writing `docs/tile/temperature/dates.json`.
- `bash scripts/make-tile.sh 20240923` — exports the date to GeoJSON with Spatialite (clipped to `data/japan-land.geojson`) and builds `{date}.pmtiles` via Tippecanoe.
- `bash scripts/run-maptunik.sh` — serves the sample tile with `tileserver-gl-light` and launches Maputnik on port 8888.

Run commands from the repo root so relative paths resolve.

## Coding Style & Naming Conventions
Use 2-space indentation in JS/HTML/CSS, favor `const`/`let`, arrow functions, and camelCase (e.g., `getPmtileSource`). Keep UI strings in Japanese to match existing labels. Store derived assets inside `docs/tile/temperature/` using `YYYYMMDD` filenames. When editing `style.json`, preserve `points-source` and layer ids (`pmtiles`, `pmtiles-symbol`) so `main.js` stays declarative.

## Testing Guidelines
Manual verification only. After generating tiles, serve `docs/` (e.g., `python -m http.server`) to confirm MapLibre loads dates and toggles min/max. For symbol checks, run `bash scripts/run-maptunik.sh` and compare Maputnik with the served tiles. Ensure `dates.json` stays in descending order and matches the `.pmtiles` set. 新しい最寒地点検索ではクリック→半径入力→結果カード更新→半透明円表示まで確認し、ズーム変更時にも再検索できるかチェックする。

## Commit & Pull Request Guidelines
History currently uses timestamp-only subjects; switch to concise imperative messages (`feat: add 20240923 tiles`). Mention data vintage or tool versions in bodies. PRs should include purpose, commands run, before/after screenshots, validation notes (Maputnik or browser), and links to issues or forecast cycle IDs so reviewers can reproduce the dataset quickly.

## Data & Configuration Tips
`sqlite-utils`, the `spatialite` extension, `jq`, `tippecanoe`, and Docker must be available; export `SPATIALITE_SECURITY=relaxed` only while building tiles. Keep the raw `jma-data` checkout outside `docs/` to avoid publishing heavy artefacts. Maintain `data/japan-land.geojson` (Natural Earth 110m equivalent) so `make-tile.sh` can drop points that never intersect land before tile generation. Reference MapLibre, PMTiles, and similar libraries via CDN to keep GitHub Pages deployments light.
