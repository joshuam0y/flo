# flò artwork

The SVG files here are the source artwork. `print/` holds the print-ready PNGs to upload to Printify:
4500 px wide, transparent background, one file per ink colour.

| Design | Source | Print files | Use |
| --- | --- | --- | --- |
| Grand Touring poster | `grand-touring.svg` | `print/grand-touring-black.png` (light shirts), `print/grand-touring-cream.png` (dark shirts) | Back of the Grand Touring Tee |
| Grand Touring crest | `crest.svg` | `print/crest-black.png`, `crest-cream.png`, `crest-white.png` | Front of the hoodie, crewneck, long sleeve and Everyday Tee |
| Wordmark | `wordmark.svg` | `print/wordmark-black.png`, `wordmark-cream.png`, `wordmark-white.png` | Chest marks, backs, sweatpants, cap |

Use black ink on light colours (Bone, Chalk, Oat, Heather, Natural) and cream or white on dark ones
(Onyx, Espresso, Navy, Sage, Rose).

The lettering and outlines in each SVG use `currentColor`, so one file makes every ink colour. The Grand
Touring scene keeps its own colours. Fonts come from `assets/fonts`, so open the SVGs through a local
server (`python -m http.server` in the repo root, then http://localhost:8000/artwork/crest.svg) or in a
design app with Marcellus, Jost and Bodoni Moda installed.

The website uses 1000 px copies of the same files in `assets/img/prints`. After editing a design,
export both sizes and bump the `?v=` number on the print path in `assets/js/garments.js`.
