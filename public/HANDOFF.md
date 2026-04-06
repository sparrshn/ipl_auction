# IPL Fantasy Dashboard — Handoff Notes

## Project Overview
A vanilla JS + Tailwind CSS fantasy cricket dashboard for IPL 2026. No build step — open `dashboard.html` directly in a browser (served locally so `fetch('/data/*.json')` works).

**Key files:**
- `dashboard.html` — entire app (HTML + JS, ~450 lines)
- `data/teams.json` — 5 fantasy teams, 16 players each
- `data/matches.json` — match performances (populated manually from scorecards)

---Com

## Fantasy Teams

| Team | Owner | Colour |
|------|-------|--------|
| Aditya Knight Riders | Aditya | Blue `#3B82F6` |
| Durandhar Kings | Kaushal | Red `#EF4444` |
| Kathan's XI | Kathan | Purple `#8B5CF6` |
| LMPCRT | Sanjay | Amber `#F59E0B` |
| The Swashbucklers | Sparrsh | Teal `#14B8A6` |

---

## Scoring Rules

### Base scores (mid-season)
- **Batting:** raw runs scored
- **Bowling:** raw wickets taken

### End-of-season adjustments (NOT YET APPLIED — apply manually when season ends)
- **SR multiplier (batting):** aggregate SR > 160 → ×1.25 | SR < 130 → ×0.75 (min 20 balls)
- **Economy multiplier (bowling):** aggregate economy < 8 → ×1.25 | economy > 9.5 → ×0.75 (min 4 overs)
- **Orange Cap holder:** batting score ×1.5
- **Purple Cap holder:** bowling score ×1.5
- **MVP:** both batting and bowling ×1.5

These are intentionally NOT applied mid-season. Set `season_bonuses` in `matches.json` and the multipliers will need to be re-enabled in `dashboard.html` at season end.

### Where the multiplier code lives
`dashboard.html` — the `applySeasonMultipliers()` function exists but is NOT called. The bonus application block was also removed from `computeStats()`. To re-enable at season end, call `applySeasonMultipliers()` and restore the bonus scaling block.

---

## matches.json — How to Add a Match

Only include players who are in `teams.json`. Player names must match exactly (case-insensitive).

**Special name:** `"SKY"` = Suryakumar Yadav (stored as "SKY" in teams.json)

```json
{
  "id": "match-N",
  "ipl_team1": "Team A",
  "ipl_team2": "Team B",
  "date": "YYYY-MM-DD",
  "result": "Team A won by X runs (...)",
  "performances": [
    { "player_name": "Name", "batting": { "runs": 0, "balls": 0 } },
    { "player_name": "Name", "bowling": { "wickets": 0, "overs": 0, "runs_conceded": 0 } },
    { "player_name": "Name", "batting": { "runs": 0, "balls": 0 }, "bowling": { "wickets": 0, "overs": 0, "runs_conceded": 0 } }
  ]
}
```

---

## Matches Logged So Far

| ID | Match | Result | Notes |
|----|-------|--------|-------|
| match-2 | PBKS vs MI | PBKS won by 3 runs (187/3 vs 184/7) | Date estimated ~Apr 6 2025 |
| match-3 | KKR vs SRH | SRH won by 110 runs (278/3 vs 168) | Date estimated ~Apr 8 2025 |
| match-70 | RCB vs LSG | RCB won by 3 runs (230/4 vs 227/3) | Date estimated May 18 2025 |

> Match IDs and dates are estimates — verify against official IPL 2025 schedule if needed.

---

## Dashboard Features

- **Points table** — teams ranked by Score (run% + wicket%). Sortable by any column (click header, toggles asc/desc). LEADER badge stays pinned to highest `final_score` team regardless of sort.
- **Expandable rows** — click a team row to see per-player breakdown (runs, SR, wickets, economy, contribution %).
- **Season Stats section** — Total Runs and Total Wickets cards (above Season Awards).
- **Season Awards section** — Orange Cap / Purple Cap / MVP cards (show "TBD — End of Season" until set).
- **Match Log** — lists all matches with result and performance entry count.

---

## Pending / In-Progress Ideas

- **Compare tab** — two dropdowns to select teams and compare. Proposed stats (not yet built):
  - \ %)
  - User hasn't decided which stats to include yet.

---

## Known Gaps / Watch-outs

- Match IDs are not sequential with actual IPL match numbers — just used as identifiers.
- Overs stored in cricket notation (e.g. `3.3` = 3 overs 3 balls). Economy calc not currently used (multipliers disabled), but be aware if re-enabling.
- No validation on `matches.json` — wrong player names silently produce no contribution.
