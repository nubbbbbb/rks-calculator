# Phigros RKS Calculator

A static Phigros RKS calculator for GitHub Pages, laid out like a beatmap browser: a
resizable song list on the left, your RKS breakdown, contributing charts, and an
accuracy editor on the right.

## Data source: Phigros Wiki

## RKS

- ACC < 70% → chart RKS = 0
- Otherwise: `chart RKS = difficulty × ((ACC - 55) / 45)²`
- B27 = the 27 highest chart RKS values
- P3 = the 3 highest difficulty charts with 100% ACC
- B27 and P3 are independent, so a chart can occur in both
- Final RKS = `(B27 sum + P3 sum) / 30`

Only regular **EZ / HD / IN / AT** charts are RKS-eligible. Legacy and SP charts are
hidden from the left-panel filters by default (toggle chips only cover EZ/HD/IN/AT),
but still exist in the data if you want to extend the UI to show them.

## Score storage

Use **Export scores** to create a JSON backup and **Import scores** to restore it.