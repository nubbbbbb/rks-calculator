# Phigros RKS Calculator

A static Phigros RKS calculator for GitHub Pages, laid out like a beatmap browser: a
resizable song list on the left, your RKS breakdown, contributing charts, and an
accuracy editor on the right.

## Song data

There's no scraped dataset — every song is entered by hand. Click **+ Add song** to
add a chart:

1. Enter the song name.
2. Enter a difficulty constant for whichever of EZ / HD / IN / AT / SP / Legacy apply
   to that song — leave the rest blank.
3. Optionally click **Fetch from Phigros Wiki** to look up the jacket art and Wiki
   page link by searching the [Phigros Wiki](https://phigros.fandom.com) for a
   matching page, or paste a jacket URL yourself.

Songs are stored in your browser's `localStorage`, so they persist across visits on
the same browser/device but aren't shared between devices. Reopen a song's editor
(select it, then click **Edit song**) to change its constants or delete it.

## RKS

- ACC < 70% → chart RKS = 0
- Otherwise: `chart RKS = difficulty × ((ACC - 55) / 45)²`
- B27 = the 27 highest chart RKS values
- P3 = the 3 highest difficulty charts with 100% ACC
- B27 and P3 are independent, so a chart can occur in both
- Final RKS = `(B27 sum + P3 sum) / 30`

Only regular **EZ / HD / IN / AT** charts are RKS-eligible. **SP** and **Legacy**
charts can still be added and toggled on in the left-panel filter chips (they're off
by default), but they never contribute to your RKS since Phigros itself excludes them.

## Score storage

Use **Export scores** to create a JSON backup and **Import scores** to restore it.
Note this only backs up your ACCs, not your song library — the song library itself
lives in `localStorage` and isn't included in export/import.