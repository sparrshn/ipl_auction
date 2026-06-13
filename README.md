# IPL Fantasy Auction

A real-time fantasy cricket auction webapp built for a private IPL fantasy league. Participants bid on players in a live auction room, then score points based on their players' real IPL performances across the season.

## Features

- **Live auction rooms** — create or join a room with a code, bid on players in real time
- **Real-time bidding** — powered by Supabase Realtime; all participants see bids instantly
- **Race-safe** — bids go through a Postgres RPC (`place_bid`) with row-level locking
- **Fantasy scoring** — points calculated from real match data using batting SR and bowling economy multipliers
- **Match data pipeline** — nightly GitHub Actions workflow scrapes ESPNCricinfo and deploys updated stats to Vercel

## Tech Stack

- **Frontend** — Next.js 14 (App Router), TypeScript, Tailwind CSS
- **Backend** — Supabase (Postgres + Realtime)
- **Deployment** — Vercel (region: `bom1`)
- **Automation** — GitHub Actions + Puppeteer for nightly match scraping

## URL Structure

| Route | Description |
|---|---|
| `/` | Create or join a room |
| `/room/[code]` | Pick your team name |
| `/room/[code]/lobby` | Pre-auction setup |
| `/room/[code]/auction` | Live bidding UI |
| `/room/[code]/results` | Final standings |

## Points System

**Batting** — points = total runs, with SR multiplier applied to aggregate:
- SR > 160 → 1.25x
- SR < 130 → 0.75x
- Minimum 20 balls faced for multiplier to apply

**Bowling** — points = total wickets, with economy multiplier applied to aggregate:
- Economy < 8 → 1.25x
- Economy > 9.5 → 0.75x
- Minimum 4 overs bowled for multiplier to apply

**Bonus multipliers** (stack multiplicatively):
- Orange Cap holder → 1.5x on batting
- Purple Cap holder → 1.5x on bowling
- MVP → 1.5x on both batting and bowling

## Data Files

| File | Description |
|---|---|
| `public/data/matches.json` | All completed matches with player performances |
| `public/data/schedule.json` | Full season schedule (source of truth for the cron) |
| `public/data/teams.json` | Fantasy team rosters |
| `public/data/swashbucklers_stats.csv` | Season stats for The Swashbucklers |

## Setup

1. Create a Supabase project and run `supabase/schema.sql` in the SQL Editor
2. Copy `.env.local.example` to `.env.local` and fill in:
   ```
   NEXT_PUBLIC_SUPABASE_URL=
   NEXT_PUBLIC_SUPABASE_ANON_KEY=
   SUPABASE_SERVICE_ROLE_KEY=
   ```
3. Install dependencies and run locally:
   ```bash
   npm install
   npm run dev
   ```

## Nightly Match Updates

The GitHub Actions workflow (`.github/workflows/update-matches.yml`) runs twice daily during the IPL season:
- **7:30 PM IST** — scrapes the evening match
- **12:30 AM IST** — scrapes any late/double-header matches

It uses Puppeteer to scrape ESPNCricinfo, updates `matches.json`, commits the result, and triggers a Vercel redeploy.
