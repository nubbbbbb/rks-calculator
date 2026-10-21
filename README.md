# Phigros RKS Calculator

Track your Phigros scores, see your current RKS, and find out which charts are
contributing to it.

Note: This project is made with usage of AI.

## Sidebar

Use the difficulty buttons to filter the song list. Search by song name with the
search field, then choose a sorting criterion:

- **Alphabetical**
- **Difficulty**
- **Accuracy**
- **RKS value**

Use the arrow button beside the criterion to switch between increasing and
decreasing order. The arrow points down for increasing order and up for
decreasing order.

The format toggle changes the sidebar between:

- **Normal**: shows the song title, an initials tile, and one clickable row for
  every filtered difficulty. Each row shows the chart constant, current
  accuracy, required accuracy, and single-chart RKS.
- **Compact**: shows a smaller song card. When only one filtered difficulty is
  present, its accuracy and single-chart RKS are shown on the initials tile.

## Accuracy And RKS

Enter accuracy as a percentage, such as `98.75`. Charts below 70% accuracy do
not provide RKS.

The calculator uses the standard chart RKS formula:

`chart RKS = difficulty × ((accuracy - 55) / 45)²`

Your total RKS is calculated from:

- **B27**: your 27 highest chart RKS values
- **P3**: your 3 highest-difficulty charts with 100% accuracy

Only EZ, HD, IN, and AT charts are included and contribute to RKS.

## Backups

Use **Export scores** to download a backup of your entered accuracies. Use
**Import scores** to restore them later. The chart catalog is part of the
repository and is not included in score exports.