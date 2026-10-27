# CV Editor

A small, local editor for building and editing a CV (or any document) and exporting it as a PDF.
It also **opens any PDF and makes it editable**.
No install, no build, no server, no internet: **open `index.html` in Chrome, Edge or Firefox.**

## What it does

- **Text with a real hierarchy** – Heading 1 (name), Heading 2 (section), Heading 3 (role / degree), Heading 4 (dates / meta), Body and Small.
  Every style is defined once in the **Text styles** tab; change it there and every piece of text using it updates.
  Per-item tweaks (size, color, bold, align…) are overrides, and **Reset to style** removes them.
- **Inside text** – double-click a word: editing starts with that word highlighted; pick **Regular · Medium · Semibold · Bold** in the
  bar that floats above the text; it writes `**(500)words**`, `**(600)words**` or `**words**` (Ctrl+B also bolds).
  **U** in the same bar (or **Ctrl+U**) underlines the selected words and writes `__words__`; press it again to remove the
  underline. It combines with bold and links. To underline a whole text box, use the **U** button in *Format* (also in *Text styles*).
  Underlines are drawn in the PDF; the text an ATS reads is unchanged.
  Press **Tab** to push the rest of a line to the
  right edge (job title left, dates right – or use **Title ⇥ Date**). Emails, web addresses and phone numbers become
  clickable links in the PDF automatically.
- **Drag everything** – drag items to move them (snapping to margins, page centre and other items' edges; hold Alt
  to move freely), drag the handles on every side and corner to resize, **drag a button from the Add panel onto the
  page** to place it right there, and **drop an image file** on the page to place it – or onto a picture to replace it.
- **Design tools** – lines (solid/dashed/dotted, horizontal or vertical), boxes and circles (fill, stroke, rounded
  corners, opacity), bullet lists (•, –, ▸, 1.), photos (round crop), **tags / chips** (text in a rounded box that fits
  its text) and a **box around any text** (fill, border, radius, padding). **Align** and **distribute** several items
  (left, centre, right, top, middle, bottom, equal gaps).
- **Theme colours** – five document colours (Text styles tab) shown as swatches next to every colour picker. Change one
  and every heading, line, box and icon using it follows.
- **Pages** – A4 or US Letter, as many pages as you need.
- **Select & arrange** – drag on an empty part of the page to select several items, **group** them (Ctrl+G) to move a whole
  section as one block, copy / cut / paste (also between pages), undo / redo.
- **Safety checks** – anything that would be cut off at the page edge gets a red outline and a warning in the top bar
  (text crossing the margins gets an orange one). Export asks before cutting anything off.
- Your work autosaves in the browser.

## Several documents at once

Every open document is a **tab** under the top bar, so you can keep several PDFs and CVs open and move between them.

- **Open…** (or drop files on the page) takes several files at once: each PDF or `.cv.json` opens in its own tab.
  **New** (or the page icon beside the tabs) starts a template or a blank page in a new tab.
- Click a tab to switch. Each tab keeps its own undo history, selection, zoom and the *Original* overlay.
  `Alt+Shift+←/→` moves to the previous or next tab; the arrow keys work on a focused tab too.
- Rename a document in the name box and its tab follows. **×** (or a middle-click) closes a tab after asking, since a
  closed tab's changes are gone unless you saved a file. Closing the last tab leaves a blank page.
- **Save** and **Export PDF** work on the tab you are looking at. All tabs are kept in this browser between visits
  (see *Privacy*), and the autosave switch and *Clear saved CV* cover every tab.

## Translate (Hebrew ⇄ English)

**Translate** in the top bar turns the open document into Hebrew or English in a **new tab**; the original is not changed.
It uses [OpenRouter](https://openrouter.ai), so you choose the model.

- **Needs your own OpenRouter key.** It works only when the editor is opened **from the file on your computer**
  (`index.html`); the hosted Netlify site blocks every outside connection, so the button is switched off there. Give the
  key to the editor in one of two ways:
  - **From your environment (no pasting):** run `node tools/make-local-config.mjs` with `OPENROUTER_API_KEY` set. It writes
    `local-config.js` next to `index.html` (gitignored, never committed, never printed); the Translate window then fills the
    key in by itself. A browser page cannot read environment variables directly, which is why this one step is needed.
  - **Paste it once** in the Translate window. After the first successful translation it is remembered in this browser
    (untick *Remember* to prevent that), so you never paste it again on this computer. *Forget the saved key* and
    *Clear saved CV* remove it.
- **Model:** type or pick an OpenRouter model name (default `anthropic/claude-haiku-5.5`, the cheap one; pick `anthropic/claude-sonnet-5.5` for a more careful translation). If it is not available you get a
  clear message; pick another from openrouter.ai/models.
- **What is sent:** only when you press *Translate to Hebrew / English*, the text of the document goes to `openrouter.ai`
  with your key (and on to the model's provider). E-mails, web addresses, phone numbers, icons and link targets are replaced
  by markers before sending and put back after, and nothing else is sent.
- **Formatting is kept:** bold, underline, links, icons, tabs and line breaks. Any text whose structure does not come back
  intact is left as it was and listed, so nothing is silently garbled.
- **Hebrew is right to left:** the whole layout is **mirrored** (a sidebar changes sides, dates go to the left edge, bullets to
  the right, left/right alignment swaps), fonts without Hebrew letters change to Heebo or Frank Ruhl Libre, and the reading
  order for the ATS check runs from the right. Translating back to English mirrors it again. Untick *Mirror the whole layout*
  to translate the words only.
- **Always read the result.** It is a machine translation: check names, job titles, dates, and that nothing now overflows its
  box (Hebrew and English differ in length; the *outside the page* warning will tell you).

## Rulers and guides

**Rulers** (top and left, toggle with the Rulers button or Shift+R) measure from the page's top-left corner; click the
small square where they meet to switch between mm, px and pt. The selected items show as a shaded band on both.
**Drag from a ruler onto the page** to pull out a guide; a tag shows its exact position, and it pulls towards the margins
and the page centre (hold Alt to place it freely). Drag a guide to move it, or back onto its ruler to remove it.
Items snap to guides. Guides are saved with the document and shared by all pages, and they never appear in the PDF.
The Page card in Text styles adds **guides at the margins** or clears them all.

## Layers and reading order

The **Layers** tab (left) lists every item on every page. That list order *is* the document order:

- **Top of the list is read first** – it is the order of the text in the exported PDF, so it is what ATS software
  reads. The number on each text row is its reading position.
- **Lower items are drawn on top** – put a background box above the text it sits behind.

Drag rows to reorder them (also onto another page); click to select (Shift/Ctrl adds), double-click to rename,
the eye hides an item (hidden items are not shown, printed or read) and the lock stops it moving on the page.
**Auto reading order** (on by default) keeps shapes behind and sorts text the way a reader sees the page: top to
bottom, a sidebar after the main column, labels before their content in a grid. Reordering by hand switches to manual
order; tick Auto again (or **Sort by position**) to go back. Ctrl+] / Ctrl+[ move items forward / backward,
with Shift to the front / back.

## Templates

**New** (or **Templates…** in the Add panel) opens seven designs with placeholder text – replace it with yours.
Picking one replaces the current document; Ctrl+Z brings it back.

| Template | Look | Good for |
| --- | --- | --- |
| Classic | EB Garamond + Source Serif 4, centred header, ruled sections, burgundy accent | Finance, law, consulting, academia |
| Modern | Inter, one teal accent, skill tags | Product, marketing, most office roles |
| Executive | Merriweather + Source Sans 3, navy, three-column competencies | Directors and C-level |
| Swiss Grid | Geist, section labels in a left column, red accent | Designers who want restraint |
| Sidebar | Manrope, main column + tinted side column (read after the main one) | Tech and data roles |
| Creative | Playfair Display + DM Sans, dark header with a photo, coral tags | Brand, design, marketing |
| Compact Tech | Roboto, dense one-pager | Software engineers |

They follow what recruiter and ATS research agrees on: a single reading path (one column, or a main column with a
narrow side column read after it), strong headings, one accent colour on near-black text, real text for skills
(no skill bars), and a photo only in the design where it is customary.

## Export to PDF

Click **Export PDF**, choose **Save as PDF** as the destination. Page size and zero margins are set for you
(in Chrome you can also untick "Headers and footers"). The result has real, selectable text, so it works with
applicant tracking systems (ATS).

## Opening PDFs

**Open…** (or drop a file on the page) opens any PDF. Every page is rebuilt as editable items:

| In the PDF | In the editor |
| --- | --- |
| Text | Text boxes with Heading 1–4 / Body / Small styles, bold words, links, bullets and right-aligned dates |
| Embedded fonts | Reused when they work in the browser; otherwise the closest installed font, with spacing adjusted to keep the original line breaks |
| Divider lines, boxes | Line and box items |
| Bullet dots, contact icons, "\|" separators | • bullets, `:icons:` and "\|" in the text |
| Photos, logos, charts, gradients, rotated text | Pictures in the same place (move, resize or delete them) |
| Scanned pages (no text inside) | One picture per page – add text boxes on top |
| Password-protected PDFs | You're asked for the password |

After opening, a short report lists what was converted, which fonts were reused or replaced and what became a picture.
**Original** in the toolbar shows the PDF faintly behind your edits so you can compare (it is never printed or saved).

It is a rebuild, not a byte-level edit: the exported PDF is new, with clean, selectable text in reading order.
Fonts that aren't on your computer are replaced, so check spacing before exporting.

## Fonts

Besides the fonts on your computer, the editor bundles 19 free fonts (SIL Open Font License). They look the same on
every computer, work offline, and are embedded in the exported PDF as normal text fonts, so ATS software reads them.
Click **Aa** next to any Font field to browse them, each shown in its own face.

| Group | Fonts | Why |
| --- | --- | --- |
| Best for CVs | Inter, Roboto, Open Sans, Lato, Source Sans 3, Carlito, Merriweather, Lora, EB Garamond, Source Serif 4 | The most used text fonts on the web (Roboto, Open Sans, Lato), the most-installed modern sans (Inter), and the free fonts CV guides recommend. **Carlito** has exactly the same letter widths as Calibri, so Word/LibreOffice CVs keep their line breaks. |
| Modern | Manrope, Geist, DM Sans | Clean, current favourites with designers in 2026 |
| Headings | Montserrat, Playfair Display | Popular display faces – use them for names and section titles, not body text (the ATS check warns) |
| Hebrew | Rubik, Heebo, Assistant, Frank Ruhl Libre (Open Sans also covers Hebrew) | Hebrew + Latin; Rubik also covers Russian |

Most bundled fonts also cover Russian (Cyrillic). Font files only load when a font is actually used.
When you open a PDF set in one of these fonts, the editor uses its own complete copy, so every letter and weight is
available. Details and versions: `fonts/doc/LICENSES.md`.

## Links and icons

- **Automatic links:** emails, web addresses (`linkedin.com/in/you`) and phone numbers are clickable in the PDF.
- **Your own links:** select words and press **Ctrl+K** (or the 🔗 Link button) → `[words](address)`.
- **Icons:** LinkedIn, GitHub, GitLab, X, Dribbble, Behance, Medium, Stack Overflow, email, phone, location, website
  and link. Click one in the panel, or type `:github:`, `:linkedin:`, `:mail:` … in the text. **Icon color** sets
  their color for that text box. **✉ Contact line** adds a ready-made line.

**Best practice (what the ATS check enforces):** keep the address *visible* and put the icon next to it –
`:linkedin: linkedin.com/in/you` – rather than a bare word or icon that only *links* to it. ATS software and printed
copies only see the visible text, so a link hidden behind "LinkedIn" or behind an icon loses the address.
The ATS check warns about such links.

## ATS check

**ATS check** shows the plain text an applicant tracking system would pull out of your PDF – in the same order – plus
simple checks: items off the page, missing email, small or unusual fonts, images, side-by-side text columns, and
**wide letter spacing**: more than about 0.04 × the font size makes the browser's PDF write each letter with a gap, and
extractors then read a heading as "EXPERI ENC E". The templates and default styles stay under that limit.
The text comes out in the order of the Layers list (see *Layers and reading order*).

## Saving your CV for later

**Save** downloads the current tab as `<name>.cv.json`; **Open…** loads it again, in a new tab. Keep that file (or commit it to git) as your editable source —
the PDF is the output.

## Privacy

Your CV never leaves your computer.

- **Where it lives.** In the page you have open, and (so a refresh does not lose your work) every open tab, in *this browser's* own storage on
  *this* computer. Another person who opens the editor, on another computer or in another browser profile, gets a blank
  start with a made-up sample, never your CV.
- **Nothing is uploaded.** Opening a PDF, editing, the ATS check and Export all run in the browser. There is no server
  copy and no database. The page carries a Content-Security-Policy that lets it reach one address only,
  `openrouter.ai`, used by *Translate* (see above) and only from a local file; the hosted site additionally sends
  `connect-src 'none'`, so there the browser refuses every outside request.
- **What a host can see.** Whoever hosts the files (Netlify) can see that the page was loaded, as with any website. They
  never receive what you type or the PDFs you open.
- **Shared computer?** In the left panel, under *Privacy*, untick **Keep a copy in this browser** to stop the autosave
  (it also removes what was kept), or press **Clear saved CV** when you are done. **Save** gives you a `.cv.json` file you
  keep yourself.
- **Keeping the repository clean.** `.gitignore` excludes `*.pdf` and `*.cv.json`, and `tests/privacy.test.mjs` fails if a
  PDF or saved CV is tracked, if any file other than `translate.js` gains a network call, if `translate.js` reaches anything but
  `openrouter.ai`, or if the policy is loosened.
  Run it with `node --test "tests/*.test.mjs"`.

## Shortcuts

| Key | Action |
| --- | --- |
| double-click / Enter | edit text (Esc to finish) |
| Ctrl+B / Ctrl+U / Ctrl+K / Tab (while editing) | bold / underline / link / push rest of line right |
| Shift-click, drag on empty page | multi-select |
| Ctrl+A | select everything on the page |
| Ctrl+G / Ctrl+Shift+G | group / ungroup |
| Ctrl+] / Ctrl+[ | bring forward / send backward (with Shift: to front / to back) |
| Shift+R | show / hide rulers and guides |
| Ctrl+C / Ctrl+X / Ctrl+V | copy / cut / paste (pasting text from elsewhere makes a new text box) |
| Arrows / Shift+Arrows | nudge 1px / 10px |
| Ctrl+D | duplicate |
| Delete | delete |
| Ctrl+Z / Ctrl+Shift+Z | undo / redo |
| Ctrl+S | save file |

## CV tips baked into the defaults

Body 10pt, section headings 13pt, name 28pt, a sans-serif font (Arial) and a single column keep the CV readable
and ATS-friendly. Fonts come from your computer, so pick one you have installed.

## Files

`tests/privacy.test.mjs` – privacy guards (see *Privacy*).
`index.html` · `style.css` · `app.js` · `icons.js` · `layers.js` · `rulers.js` · `templates.js` · `pdfimport.js` · `translate.js` – the app.
Bundled, so it works offline: [pdf.js](https://mozilla.github.io/pdf.js/) (Apache-2.0, `vendor/pdfjs`, used only to open PDFs),
IBM Plex Sans/Mono for the interface and 19 document fonts (SIL OFL, `fonts/`), icons from [Simple Icons](https://simpleicons.org) (CC0) and
[Lucide](https://lucide.dev) (ISC).

