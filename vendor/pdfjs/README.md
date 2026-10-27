# pdf.js (bundled)

[pdf.js](https://mozilla.github.io/pdf.js/) 6.4.299 by Mozilla, Apache-2.0 licence (see `LICENSE`).
Used only when you open a PDF; loaded on demand by `pdfimport.js`.

pdf.js ships as ES modules, which browsers refuse to load from `file://`. These two files are the
**legacy** build (wider browser support) converted once into classic scripts:

```sh
npm i pdfjs-dist@6.4.299 esbuild@0.25
npx esbuild node_modules/pdfjs-dist/legacy/build/pdf.min.mjs        --format=iife --global-name=pdfjsLib    --minify --outfile=pdf.js
npx esbuild node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs --format=iife --global-name=pdfjsWorker --minify --outfile=pdf.worker.js
```

`pdf.worker.js` defines `globalThis.pdfjsWorker`, so pdf.js runs on the main thread – no Web Worker needed,
which also works when `index.html` is opened directly from disk.
