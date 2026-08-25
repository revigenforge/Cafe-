# Cafe Mehrban — demo site

A one-page site for Cafe Mehrban, built from the cafe's own photographs.
Static HTML, CSS and a little vanilla JS. No build step, no dependencies —
open `index.html` or serve the folder.

```bash
python3 -m http.server 8000    # then visit http://localhost:8000
```

## What still needs filling in

Every unverified value is marked `PLACEHOLDER` in `index.html` and renders
with a dotted underline so it's obvious on the page. Search the file for
`PLACEHOLDER` to find them all:

| # | What | Where |
|---|------|-------|
| 1 | Street address | contact strip, Visit, footer |
| 2 | Phone number | contact strip, Visit, footer (`tel:` links too) |
| 3 | Opening hours | contact strip, Visit table |
| 4 | Google Maps link | every "Get directions" / "Open in Maps" (`data-maps`) |
| 5 | Instagram handle | Visit, footer |
| 6 | Real menu + prices | the three-column menu card |

The Google Maps listing could not be read when this was built — the
environment blocks Google's domains — so none of the above could be
pulled automatically.

## What is accurate

Taken from the photographs, not invented: the name and its three scripts
(Latin, Gurmukhi ਮੇਹਰਬਾਨ, Devanagari मेहरबान), the three seating areas,
the three photographed dishes, the espresso bar and syrup shelf, and the
whole colour palette.

## Layout

```
index.html
assets/
  css/fonts.css     self-hosted @font-face rules
  css/styles.css    all styling; palette tokens at the top
  js/main.js        drawer, sticky-nav shadow, scroll reveals
  fonts/            4 woff2 files, subset to the scripts used
  images/           7 photos, Maps UI cropped out, resized to web
docs/
  BRAND-EXTRACTION.md   what was pulled from the photos
  reference-design.jpg  the supplied reference layout
```

## Design notes

**Colour** is sampled from the cafe itself — the signboard brown `#3B2A1E`,
its gold lettering `#E8C24A`, the fluted teak counter, and the amber LED
`#F2A93B` burning underneath it. `--teak` is the one deliberate deviation:
the true sampled value `#A8602C` only reaches 3.8:1 against the blush
background, so it's darkened to `#8B5025` to clear WCAG AA at small sizes.

**Type** is Fraunces for display and Karla for body, with Noto Serif
Gurmukhi and Noto Serif Devanagari for the other two scripts. Fraunces has
`SOFT` and `WONK` axes; they're dialled up on the script "Cafe" and the
italic hero line, and flattened to 0 on the big `MEHRBAN` so it holds the
same authority as the real signboard.

**The signature** is that signboard, rebuilt in live type — gold on brown,
gold rule, all three scripts underneath.

**The angled section dividers** echo the pitched roof over the entrance.
The counter band's light rakes upward, the way the LED strip lights the
fluted wood in the hall.

Fonts are self-hosted (SIL Open Font License 1.1) rather than pulled from
a CDN, so the site works offline and behind restrictive networks.

Accessibility floor: all body and label text meets WCAG AA contrast, focus
is visible, the page is keyboard-navigable, motion respects
`prefers-reduced-motion`, and there's no horizontal scroll at any width.
