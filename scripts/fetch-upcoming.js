#!/usr/bin/env node
/**
 * Fetches upcoming IPL matches from ESPNCricinfo schedule page
 * and writes them to public/data/matches.json upcoming_matches array.
 *
 * All dates are handled in IST (Asia/Kolkata) throughout.
 * Usage: node scripts/fetch-upcoming.js
 */

const { launchBrowser, newPage, sleep } = require('./browser');
const fs = require('fs');
const path = require('path');

const MATCHES_JSON = path.join(__dirname, '../public/data/matches.json');
const SCHEDULE_URL = 'https://www.espncricinfo.com/series/ipl-2026-1510719/match-schedule-fixtures-and-results';

// Today's date in IST — avoids UTC drift regardless of where Mac clock is
function todayIST() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

// Parse "Apr 5", "April 5", "Sat, Apr 5", "April 5, 2026" → "2026-04-05"
// Never goes through Date() to avoid timezone conversion issues
const MONTH_MAP = {
  jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',
  jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12',
  january:'01',february:'02',march:'03',april:'04',june:'06',
  july:'07',august:'08',september:'09',october:'10',november:'11',december:'12'
};

function parseMatchDate(str) {
  if (!str) return null;
  const cleaned = str.replace(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\s+/i, '').trim();
  const m = cleaned.match(/^(\w+)\s+(\d{1,2})(?:,?\s+\d{4})?$/i);
  if (!m) return null;
  const month = MONTH_MAP[m[1].toLowerCase()];
  if (!month) return null;
  const day = m[2].padStart(2, '0');
  const year = new Date().getFullYear();
  return `${year}-${month}-${day}`;
}

// Map URL slug fragments → full IPL team names
const SLUG_TO_TEAM = {
  'chennai-super-kings': 'Chennai Super Kings',
  'mumbai-indians': 'Mumbai Indians',
  'kolkata-knight-riders': 'Kolkata Knight Riders',
  'royal-challengers-bengaluru': 'Royal Challengers Bengaluru',
  'sunrisers-hyderabad': 'Sunrisers Hyderabad',
  'rajasthan-royals': 'Rajasthan Royals',
  'delhi-capitals': 'Delhi Capitals',
  'punjab-kings': 'Punjab Kings',
  'lucknow-super-giants': 'Lucknow Super Giants',
  'gujarat-titans': 'Gujarat Titans',
};

function slugToTeam(slug) {
  for (const [key, val] of Object.entries(SLUG_TO_TEAM)) {
    if (slug.includes(key)) return val;
  }
  return null;
}

(async () => {
  const TODAY = todayIST();
  console.log(`Today (IST): ${TODAY}`);

  const browser = await launchBrowser();

  try {
    console.log('Fetching IPL 2026 schedule...');
    const page = await newPage(browser);
    await page.goto(SCHEDULE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(4000);

    // Extract unique upcoming match hrefs from DOM
    const matchHrefs = await page.evaluate(() => {
      const seen = new Set();
      const results = [];
      document.querySelectorAll('a[href]').forEach(link => {
        const href = link.getAttribute('href') || '';
        if (!/\/series\/ipl-2026-\d+\/[a-z0-9-]+-match-\d+/.test(href)) return;
        if (!href.includes('match-preview')) return;
        const clean = href.split('?')[0].replace(/\/match-preview$/, '');
        if (seen.has(clean)) return;
        seen.add(clean);
        results.push(clean);
      });
      return results;
    });
    await page.close();

    console.log(`Found ${matchHrefs.length} unique upcoming IPL match(es)`);

    const upcoming = [];

    for (const href of matchHrefs) {
      // Extract team names from slug
      const slugMatch = href.match(/\/([a-z-]+-vs-[a-z-]+)-\d+[a-z]+-match/);
      if (!slugMatch) { console.log(`  Skipping unrecognised slug: ${href}`); continue; }
      const [t1slug, t2slug] = slugMatch[1].split('-vs-');
      const team1 = slugToTeam(t1slug);
      const team2 = slugToTeam(t2slug);
      if (!team1 || !team2) { console.log(`  Could not map teams: ${slugMatch[1]}`); continue; }

      // Fetch preview page to get the match date (most reliable source)
      let date = null;
      try {
        const previewPage = await newPage(browser);
        await previewPage.goto(`https://www.espncricinfo.com${href}/match-preview`, {
          waitUntil: 'domcontentloaded', timeout: 20000
        });
        await sleep(2000);
        const text = await previewPage.evaluate(() => document.body.innerText);
        await previewPage.close();

        const patterns = [
          /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}/i,
          /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s+2026\b/i,
        ];
        for (const pat of patterns) {
          const m = text.match(pat);
          if (m) {
            date = parseMatchDate(m[0]);
            console.log(`  Raw date text found: "${m[0]}" → ${date}`);
            break;
          }
        }
      } catch (e) {
        console.log(`  Could not fetch preview for ${team1} vs ${team2}: ${e.message}`);
      }

      if (date && date < TODAY) {
        console.log(`  Skipping ${team1} vs ${team2} — ${date} is in the past (today IST: ${TODAY})`);
        continue;
      }

      console.log(`  ✓ ${team1} vs ${team2} — ${date || 'date unknown'}`);
      upcoming.push({ ipl_team1: team1, ipl_team2: team2, ...(date ? { date } : {}) });
    }

    if (upcoming.length === 0) {
      console.log('No upcoming matches found — matches.json not modified.');
      process.exit(0);
    }

    const data = JSON.parse(fs.readFileSync(MATCHES_JSON, 'utf8'));
    data.upcoming_matches = upcoming;
    fs.writeFileSync(MATCHES_JSON, JSON.stringify(data, null, 2));
    console.log(`\nWrote ${upcoming.length} upcoming match(es) to matches.json`);

  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
