# Dashboard prototypes (Sept 2026)

Five throwaway HTML mocks of the dashboard, same data in each, each with a
light and a dark theme. Open `index.html` (works from `file://`), or serve the
folder and open `/index.html`. Screenshots are in `shots/`.

One rule all five share: **phase colour and status colour never share a
shape.** Phase colour lives on the phase number badge, the header stripe and
the progress track. Status (red = unassigned/blocked, amber = overdue, green =
delivered) lives only in pills with a count. So a red pill on a rose-coloured
phase 3 card still reads as "something is wrong", not "phase 3".

| | Palette idea | Type | Layout |
|---|---|---|---|
| 1 Spectrum | Nine hues, warm to cool, grey at phase 0 | Sora | Cycle strip hero, chains + attention rail |
| 2 Tiers | Colour by tier (ochre / blues / plums), shade by phase | IBM Plex Sans | Swimlane per chain, promotions run right |
| 3 Harvest | Wine: straw, copper, carmenère, plum, lavender, cobalt, sea, sage | Fraunces + Source Sans 3 | Editorial: serif mastheads, ledger stats |
| 4 Board | Nine pastel/saturated columns | Manrope | Phase columns; every plan and promotion under its phase |
| 5 Timeline | Muted jewel tones | Geist | Calendar gantt, bars segmented by phase, today line |

Trade-offs to know before choosing:

- Nine distinct hues (1, 4, 5) are the most "colourful" and make "which phase"
  instant, but phase 1 gold sits near overdue amber and phase 3 rose near
  alert red. The shape rule above is what keeps them apart.
- Three families (2) keeps red/amber/green fully unique to status; the cost is
  that phases 1 to 4 are shades of one blue, so "phase 2 vs 3" is subtler.
- Harvest (3) is the only one grounded in the client's business rather than in
  the abstract cycle. It is also the least "SaaS dashboard" looking.
- Board (4) and Timeline (5) change the dashboard's shape, not just its skin.
  The tier pages (plan year, chain plan, promotion) would keep the phase colour
  system but not the board/gantt layout.
