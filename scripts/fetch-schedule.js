#!/usr/bin/env node
/**
 * One-time script: fetches the full IPL 2026 match schedule from ESPNCricinfo
 * and writes public/data/schedule.json (dates + teams only, no paths).
 *
 * Run once at season start, or re-run if the fixture list changes.
 * Usage: node scripts/fetch-schedule.js
 */

const { launchBrowser, newPage, sleep } = require('./browser');
const fs = require('fs');
const path = require('path');

const SCHEDULE_JSON = path.join(__dirname, '../public/data/schedule.json');
const SCHEDULE_URL  = 'https://www.espncricinfo.com/series/ipl-2026-1510719/match-schedule-fixtures-and-results';

const SLUG_TO_TEAM = {
  'chennai-super-kings':         'Chennai Super Kings',
  'mumbai-indians':              'Mumbai Indians',
  'kolkata-knight-riders':       'Kolkata Knight Riders',
  'royal-challengers-bengaluru': 'Royal Challengers Bengaluru',
  'sunrisers-hyderabad':         'Sunrisers Hyderabad',
  'rajasthan-royals':            'Rajasthan Royals',
  'delhi-capitals':              'Delhi Capitals',
  'punjab-kings':                'Punjab Kings',
  'lucknow-super-giants':        'Lucknow Super Giants',
  'gujarat-titans':              'Gujarat Titans',
};

function slugToTeam(slug) {
  for (const [key, val] of Object.entries(SLUG_TO_TEAM)) {
    if (slug.includes(key)) return val;
  }
  return null;
}

const MONTH_MAP = {
  jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',
  jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12',
};

// Parse "Sun, 29 Mar '26" or "29 Mar '26" → "2026-03-29"
function parseDate(str) {
  if (!str) return null;
  const m = str.match(/(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s*'(\d{2})/i);
  if (!m) return null;
  const month = MONTH_MAP[m[2].toLowerCase()];
  if (!month) return null;
  return `20${m[3]}-${month}-${m[1].padStart(2, '0')}`;
}

(async () => {
  const browser = await launchBrowser();

  try {
    console.log('Fetching IPL 2026 schedule page...');
    const page = await newPage(browser);
    await page.goto(SCHEDULE_URL, { waitUntil: 'load', timeout: 45000 });
    await sleep(5000);

    // Scroll to trigger lazy-loading of all match cards
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 600) {
        window.scrollTo(0, y);
        await new Promise(r => setTimeout(r, 250));
      }
      window.scrollTo(0, document.body.scrollHeight);
    });
    await sleep(3000);

    // Walk all elements in document order.
    // Date headers on ESPNCricinfo schedule use format "Sun, 29 Mar '26"
    // They appear as near-leaf elements (childElementCount <= 1).
    const raw = await page.evaluate(() => {
      const results = [];
      const seen = new Set();
      let currentDate = null;

      // Matches "29 Mar '26" anywhere in short text
      const DATE_RE = /\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s*'\d{2}/i;

      for (const el of document.querySelectorAll('*')) {
        // Date detection: near-leaf elements only (avoids containers that include all child text)
        if (el.tagName !== 'A' && el.childElementCount <= 1) {
          const text = (el.textContent || '').trim();
          if (text.length < 30 && DATE_RE.test(text)) {
            currentDate = text.replace(/\s+/g, ' ');
          }
        }

        // Match link detection
        if (el.tagName === 'A') {
          const href = el.getAttribute('href') || '';
          if (!/\/series\/ipl-2026-\d+\/[a-z0-9-]+-match-\d+/.test(href)) continue;
          const clean = href.split('?')[0]
            .replace(/\/(match-preview|live-cricket-score|full-scorecard|live-match-blog|commentary|points-table-standings|match-report|match-photo|match-videos|match-news)$/, '');
          if (seen.has(clean)) continue;
          seen.add(clean);
          results.push({ href: clean, dateText: currentDate });
        }
      }

      return results;
    });

    await page.close();
    console.log(`Found ${raw.length} unique match hrefs`);

    // Parse into schedule entries
    const schedule = [];
    const missing = [];

    for (const { href, dateText } of raw) {
      const slugMatch = href.match(/\/([a-z-]+-vs-[a-z-]+)-\d+[a-z]+-match/);
      if (!slugMatch) continue;
      const [t1slug, t2slug] = slugMatch[1].split('-vs-');
      const team1 = slugToTeam(t1slug);
      const team2 = slugToTeam(t2slug);
      if (!team1 || !team2) { console.log(`  Could not map teams: ${slugMatch[1]}`); continue; }

      const date = parseDate(dateText);
      if (!date) {
        console.log(`  No date for ${team1} vs ${team2} (raw: "${dateText}")`);
        missing.push({ team1, team2 });
        continue;
      }

      schedule.push({ date, team1, team2 });
      console.log(`  ${date}  ${team1} vs ${team2}`);
    }

    // Sort by date
    schedule.sort((a, b) => a.date.localeCompare(b.date));

    fs.writeFileSync(SCHEDULE_JSON, JSON.stringify(schedule, null, 2));
    console.log(`\nWrote ${schedule.length} matches to schedule.json`);
    if (missing.length > 0) {
      console.log(`${missing.length} match(es) missing dates — may need re-run after page fully loads`);
    }

  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
