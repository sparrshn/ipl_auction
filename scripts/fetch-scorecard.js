#!/usr/bin/env node
/**
 * Test script: fetches a completed IPL match scorecard, parses batting + bowling,
 * and filters to fantasy players. Does NOT write to matches.json.
 *
 * Usage:
 *   node scripts/fetch-scorecard.js                  # auto-picks latest completed match
 *   node scripts/fetch-scorecard.js <scorecard-url>  # use specific URL
 */

const { launchBrowser, newPage, sleep } = require('./browser');
const fs = require('fs');
const path = require('path');

const TEAMS_JSON = path.join(__dirname, '../public/data/teams.json');
const SCHEDULE_URL = 'https://www.espncricinfo.com/series/ipl-2026-1510719/match-schedule-fixtures-and-results';

// ---------------------------------------------------------------------------
// Fantasy player map: normalized name → canonical name
// ---------------------------------------------------------------------------
function buildFantasyMap(teamsJson) {
  const map = new Map();
  for (const team of teamsJson.teams) {
    for (const player of team.players) {
      map.set(normalize(player.name), player.name);
    }
  }
  // Hard-coded aliases for common scorecard name mismatches
  map.set('suryakumar yadav', 'SKY');
  map.set('surya kumar yadav', 'SKY');
  map.set('t natarajan', 'T. Natarajan');
  map.set('thangarasu natarajan', 'T. Natarajan');
  map.set('sai sudarshan', 'Sai Sudharsan');
  map.set('digvesh singh', 'Digvesh Rathi');
  map.set('tilak varma', 'Tilak Verma');
  return map;
}

function normalize(name) {
  return name.toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();
}

function lookupFantasy(rawName, map) {
  return map.get(normalize(rawName)) || null;
}

// ---------------------------------------------------------------------------
// Scorecard text parser
// ---------------------------------------------------------------------------
function parseScorecard(rawText) {
  // ESPNCricinfo renders wickets on a separate line: \t4\t0\t48\t\n1\n\t12.00
  // Collapse back into a single line
  const text = rawText.replace(/\t\n(\d+)\n\t/g, '\t$1\t');

  const innings = [];
  // M (minutes) column may or may not appear between B and 4s
  const battingHeaderRe = /BATTING\s+R\s+B\s+(?:M\s+)?4s\s+6s\s+SR/gi;
  const bowlingHeaderRe = /BOWLING\s+O\s+M\s+R\s+W\s+ECON/gi;

  const battingStarts = [];
  const bowlingStarts = [];
  let m;
  while ((m = battingHeaderRe.exec(text)) !== null) battingStarts.push(m.index);
  while ((m = bowlingHeaderRe.exec(text)) !== null) bowlingStarts.push(m.index);

  console.log(`  Found ${battingStarts.length} batting section(s), ${bowlingStarts.length} bowling section(s)`);

  for (let i = 0; i < battingStarts.length && i < bowlingStarts.length; i++) {
    const battingSection = text.slice(battingStarts[i], bowlingStarts[i]);
    const bowlingEnd = battingStarts[i + 1] || text.length;
    const bowlingSection = text.slice(bowlingStarts[i], bowlingEnd);
    innings.push({
      batting: parseBattingSection(battingSection),
      bowling: parseBowlingSection(bowlingSection),
    });
  }
  return innings;
}

function parseBattingSection(text) {
  const batters = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    // Stats line: \tR\tB\t[M\t]4s\t6s\tSR — try 6-field (with M) then 5-field
    const statsMatch =
      lines[i].match(/^\t(?:not out\t)?(\d+)\t(\d+)\t\d+\t\d+\t\d+\t[\d.]+\s*$/) ||
      lines[i].match(/^\t(?:not out\t)?(\d+)\t(\d+)\t\d+\t\d+\t[\d.]+\s*$/);
    if (!statsMatch) continue;
    const runs = parseInt(statsMatch[1]);
    const balls = parseInt(statsMatch[2]);
    let name = null;
    for (let j = i - 1; j >= Math.max(0, i - 6); j--) {
      const raw = lines[j];
      const trimmed = raw.trim();
      if (!trimmed || raw.startsWith('\t')) continue;
      if (/^(c |b |lbw|run out|not out|hit wicket|retired|stumped|caught)/i.test(trimmed)) continue;
      if (/^[A-Z]/.test(trimmed)) { name = trimmed; break; }
    }
    if (!name || name === 'Extras' || /^total/i.test(name) || /^fall/i.test(name) || /^BATTING/i.test(name)) continue;
    name = name.replace(/\s*†\s*/g, '').replace(/\s*\(c\)\s*/gi, '').trim();
    batters.push({ name, runs, balls });
  }
  return batters;
}

function parseBowlingSection(text) {
  const bowlers = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const statsMatch = lines[i].match(/^\t([\d.]+)\t(\d+)\t(\d+)\t(\d+)\t[\d.]+/);
    if (!statsMatch) continue;
    const overs = parseFloat(statsMatch[1]);
    const runs_conceded = parseInt(statsMatch[3]);
    const wickets = parseInt(statsMatch[4]);
    if (overs > 4.5) continue; // T20 sanity check
    let name = null;
    for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
      const raw = lines[j];
      const trimmed = raw.trim();
      if (!trimmed || raw.startsWith('\t')) continue;
      if (/^[A-Z]/.test(trimmed)) { name = trimmed; break; }
    }
    if (!name || /^BOWLING/i.test(name)) continue;
    name = name.replace(/\s*†\s*/g, '').replace(/\s*\(c\)\s*/gi, '').trim();
    bowlers.push({ name, wickets, overs, runs_conceded });
  }
  return bowlers;
}

// ---------------------------------------------------------------------------
// Browser helpers
// ---------------------------------------------------------------------------
async function fetchScorecard(browser, url) {
  const page = await newPage(browser);
  await page.goto(url, { waitUntil: 'load', timeout: 45000 });
  await sleep(5000);
  // Scroll to trigger lazy-loading of both innings
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 400) {
      window.scrollTo(0, y);
      await new Promise(r => setTimeout(r, 200));
    }
    window.scrollTo(0, document.body.scrollHeight);
  });
  await sleep(3000);
  const text = await page.evaluate(() => document.body.innerText);
  await page.close();
  return text;
}

async function findCompletedMatchPaths(browser) {
  const page = await newPage(browser);
  await page.goto(SCHEDULE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(4000);
  const hrefs = await page.evaluate(() => {
    const seen = new Set();
    const results = [];
    document.querySelectorAll('a[href]').forEach(link => {
      let href = link.getAttribute('href') || '';
      href = href.replace(/^https?:\/\/www\.espncricinfo\.com/, '');
      if (!/\/series\/ipl-2026-\d+\/[a-z0-9-]+-match-\d+/.test(href)) return;
      if (href.includes('match-preview')) return;
      const clean = href.split('?')[0]
        .replace(/\/(live-cricket-score|full-scorecard|live-match-blog|commentary|points-table-standings|match-report|match-photo|match-videos)$/, '');
      if (seen.has(clean)) return;
      seen.add(clean);
      results.push(clean);
    });
    return results;
  });
  await page.close();
  return hrefs;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
(async () => {
  const teamsData = JSON.parse(fs.readFileSync(TEAMS_JSON, 'utf8'));
  const fantasyMap = buildFantasyMap(teamsData);
  console.log(`Loaded ${fantasyMap.size} fantasy player entries\n`);

  const browser = await launchBrowser();

  try {
    let scorecardUrl = process.argv[2];

    if (!scorecardUrl) {
      console.log('No URL provided — finding latest completed match from schedule...');
      const paths = await findCompletedMatchPaths(browser);
      console.log(`Found ${paths.length} completed match path(s)`);
      paths.slice(0, 5).forEach(p => console.log(' ', p));
      if (paths.length === 0) { console.log('No completed matches found.'); process.exit(1); }
      scorecardUrl = `https://www.espncricinfo.com${paths[0]}/full-scorecard`;
    }

    console.log(`\nFetching scorecard: ${scorecardUrl}`);
    const text = await fetchScorecard(browser, scorecardUrl);
    console.log(`Page text length: ${text.length}`);

    if (text.includes('Access Denied') || text.length < 500) {
      console.log('Page blocked. Sample:', text.slice(0, 300));
      process.exit(1);
    }

    const battingIdx = text.search(/BATTING\s+R\s+B/);
    if (battingIdx === -1) {
      console.log('No BATTING table found. Page sample:');
      console.log(text.slice(0, 1000));
      process.exit(1);
    }
    console.log('\n=== RAW SCORECARD SAMPLE ===');
    console.log(text.slice(battingIdx, battingIdx + 600));
    console.log('...');

    const innings = parseScorecard(text);
    console.log(`\nParsed ${innings.length} innings\n`);

    const playerMap = new Map();
    for (const [i, inn] of innings.entries()) {
      console.log(`--- Innings ${i + 1}: ${inn.batting.length} batters, ${inn.bowling.length} bowlers ---`);
      for (const b of inn.batting) {
        const canonical = lookupFantasy(b.name, fantasyMap);
        if (canonical) {
          if (!playerMap.has(canonical)) playerMap.set(canonical, {});
          playerMap.get(canonical).batting = { runs: b.runs, balls: b.balls };
          console.log(`  ✓ BAT  ${canonical} (${b.name}): ${b.runs} (${b.balls}b)`);
        } else {
          console.log(`  - bat  ${b.name}: ${b.runs} (${b.balls}b) — not in fantasy`);
        }
      }
      for (const b of inn.bowling) {
        const canonical = lookupFantasy(b.name, fantasyMap);
        if (canonical) {
          if (!playerMap.has(canonical)) playerMap.set(canonical, {});
          playerMap.get(canonical).bowling = { wickets: b.wickets, overs: b.overs, runs_conceded: b.runs_conceded };
          console.log(`  ✓ BOWL ${canonical} (${b.name}): ${b.wickets}w ${b.overs}ov ${b.runs_conceded}r`);
        } else {
          console.log(`  - bowl ${b.name}: ${b.wickets}w — not in fantasy`);
        }
      }
    }

    const performances = [];
    for (const [name, perf] of playerMap.entries()) {
      performances.push({ player_name: name, ...perf });
    }

    console.log('\n=== FANTASY PERFORMANCES (JSON) ===');
    console.log(JSON.stringify(performances, null, 2));
    console.log(`\nTotal fantasy players found: ${performances.length}`);

  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
