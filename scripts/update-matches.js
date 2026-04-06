#!/usr/bin/env node
/**
 * Production script — runs nightly via launchd.
 *
 * For each match scheduled on TARGET_DATE (today IST by default, yesterday IST
 * with --yesterday flag):
 *   1. Check if a completed scorecard exists on the schedule page
 *   2. Confirm match is done (result string found)
 *   3. Parse both innings, filter to fantasy players
 *   4. Append completed match to matches.json
 *
 * After all matches processed: vercel --prod
 *
 * Usage:
 *   node scripts/update-matches.js             # today IST
 *   node scripts/update-matches.js --yesterday # yesterday IST (for 12:30 AM IST cron)
 */

const { execSync } = require('child_process');
const { launchBrowser, newPage, sleep } = require('./browser');
const fs = require('fs');
const path = require('path');

const MATCHES_JSON  = path.join(__dirname, '../public/data/matches.json');
const TEAMS_JSON    = path.join(__dirname, '../public/data/teams.json');
const SCHEDULE_JSON = path.join(__dirname, '../public/data/schedule.json');
const SCHEDULE_URL  = 'https://www.espncricinfo.com/series/ipl-2026-1510719/match-schedule-fixtures-and-results';

// ---------------------------------------------------------------------------
// Date helpers (IST)
// ---------------------------------------------------------------------------
function dateIST(offset = 0) {
  const d = new Date();
  if (offset !== 0) d.setDate(d.getDate() + offset);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
}

// ---------------------------------------------------------------------------
// Team helpers
// ---------------------------------------------------------------------------
const TEAM_TO_SLUG = {
  'Chennai Super Kings':         'chennai-super-kings',
  'Mumbai Indians':              'mumbai-indians',
  'Kolkata Knight Riders':       'kolkata-knight-riders',
  'Royal Challengers Bengaluru': 'royal-challengers-bengaluru',
  'Sunrisers Hyderabad':         'sunrisers-hyderabad',
  'Rajasthan Royals':            'rajasthan-royals',
  'Delhi Capitals':              'delhi-capitals',
  'Punjab Kings':                'punjab-kings',
  'Lucknow Super Giants':        'lucknow-super-giants',
  'Gujarat Titans':              'gujarat-titans',
};

const TEAM_ABBR = {
  'Chennai Super Kings':         'csk',
  'Mumbai Indians':              'mi',
  'Kolkata Knight Riders':       'kkr',
  'Royal Challengers Bengaluru': 'rcb',
  'Sunrisers Hyderabad':         'srh',
  'Rajasthan Royals':            'rr',
  'Delhi Capitals':              'dc',
  'Punjab Kings':                'pbks',
  'Lucknow Super Giants':        'lsg',
  'Gujarat Titans':              'gt',
};

function matchId(team1, team2, date) {
  const a = TEAM_ABBR[team1] || team1.toLowerCase().replace(/\s/g, '');
  const b = TEAM_ABBR[team2] || team2.toLowerCase().replace(/\s/g, '');
  return `match-${a}-${b}-${date.replace(/-/g, '')}`;
}

// Returns the completed scorecard path for a given pair of teams, or null
function findPathForTeams(completedPaths, team1, team2) {
  const slug1 = TEAM_TO_SLUG[team1];
  const slug2 = TEAM_TO_SLUG[team2];
  if (!slug1 || !slug2) return null;
  return completedPaths.find(p => p.includes(slug1) && p.includes(slug2)) || null;
}

// ---------------------------------------------------------------------------
// Fantasy player map
// ---------------------------------------------------------------------------
function buildFantasyMap(teamsJson) {
  const map = new Map();
  for (const team of teamsJson.teams) {
    for (const player of team.players) {
      map.set(normalize(player.name), player.name);
    }
  }
  map.set('suryakumar yadav', 'SKY');
  map.set('surya kumar yadav', 'SKY');
  map.set('t natarajan', 'T. Natarajan');
  map.set('thangarasu natarajan', 'T. Natarajan');
  map.set('sai sudarshan', 'Sai Sudharsan');
  map.set('digvesh singh', 'Digvesh Rathi');
  map.set('tilak varma', 'Tilak Verma');
  map.set('vaibhav sooryavanshi', 'Vaibhav Suryavanshi');
  return map;
}

function normalize(name) {
  return name.toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();
}

function lookupFantasy(rawName, map) {
  return map.get(normalize(rawName)) || null;
}

// ---------------------------------------------------------------------------
// Scorecard parser
// ---------------------------------------------------------------------------
function parseScorecard(rawText) {
  const text = rawText.replace(/\t\n(\d+)\n\t/g, '\t$1\t');
  const innings = [];
  const battingHeaderRe = /BATTING\s+R\s+B\s+(?:M\s+)?4s\s+6s\s+SR/gi;
  const bowlingHeaderRe = /BOWLING\s+O\s+M\s+R\s+W\s+ECON/gi;
  const battingStarts = [];
  const bowlingStarts = [];
  let m;
  while ((m = battingHeaderRe.exec(text)) !== null) battingStarts.push(m.index);
  while ((m = bowlingHeaderRe.exec(text)) !== null) bowlingStarts.push(m.index);
  for (let i = 0; i < battingStarts.length && i < bowlingStarts.length; i++) {
    const battingSection = text.slice(battingStarts[i], bowlingStarts[i]);
    const bowlingEnd = battingStarts[i + 1] || text.length;
    const bowlingSection = text.slice(bowlingStarts[i], bowlingEnd);
    innings.push({ batting: parseBatting(battingSection), bowling: parseBowling(bowlingSection) });
  }
  return innings;
}

function parseBatting(text) {
  const batters = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const statsMatch =
      lines[i].match(/^\t(?:not out\t)?(\d+)\t(\d+)\t\d+\t\d+\t\d+\t[\d.]+\s*$/) ||
      lines[i].match(/^\t(?:not out\t)?(\d+)\t(\d+)\t\d+\t\d+\t[\d.]+\s*$/);
    if (!statsMatch) continue;
    const runs = parseInt(statsMatch[1]);
    const balls = parseInt(statsMatch[2]);
    let name = null;
    for (let j = i - 1; j >= Math.max(0, i - 6); j--) {
      const raw = lines[j]; const trimmed = raw.trim();
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

function parseBowling(text) {
  const bowlers = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const statsMatch = lines[i].match(/^\t([\d.]+)\t(\d+)\t(\d+)\t(\d+)\t[\d.]+/);
    if (!statsMatch) continue;
    const overs = parseFloat(statsMatch[1]);
    const runs_conceded = parseInt(statsMatch[3]);
    const wickets = parseInt(statsMatch[4]);
    if (overs > 4.5) continue;
    let name = null;
    for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
      const raw = lines[j]; const trimmed = raw.trim();
      if (!trimmed || raw.startsWith('\t')) continue;
      if (/^[A-Z]/.test(trimmed)) { name = trimmed; break; }
    }
    if (!name || /^BOWLING/i.test(name)) continue;
    name = name.replace(/\s*†\s*/g, '').replace(/\s*\(c\)\s*/gi, '').trim();
    bowlers.push({ name, wickets, overs, runs_conceded });
  }
  return bowlers;
}

const IPL_ABBR_TO_FULL = {
  'CSK': 'Chennai Super Kings',
  'MI':  'Mumbai Indians',
  'KKR': 'Kolkata Knight Riders',
  'RCB': 'Royal Challengers Bengaluru',
  'SRH': 'Sunrisers Hyderabad',
  'RR':  'Rajasthan Royals',
  'DC':  'Delhi Capitals',
  'PBKS':'Punjab Kings',
  'LSG': 'Lucknow Super Giants',
  'GT':  'Gujarat Titans',
};

const IPL_TEAMS_RE = '(?:Chennai Super Kings|Mumbai Indians|Kolkata Knight Riders|Royal Challengers Bengaluru|Sunrisers Hyderabad|Rajasthan Royals|Delhi Capitals|Punjab Kings|Lucknow Super Giants|Gujarat Titans|CSK|MI|KKR|RCB|SRH|RR|DC|PBKS|LSG|GT)';

function extractResult(text, team1, team2) {
  const re = new RegExp(IPL_TEAMS_RE + ' won by \\d+ (?:wickets?|runs?)[^\\n]*', 'gi');
  const candidates = [...text.matchAll(re)].map(m => m[0].trim());
  // Prefer result mentioning one of the two playing teams (by abbr or full name)
  const abbr1 = Object.keys(IPL_ABBR_TO_FULL).find(k => IPL_ABBR_TO_FULL[k] === team1);
  const abbr2 = Object.keys(IPL_ABBR_TO_FULL).find(k => IPL_ABBR_TO_FULL[k] === team2);
  const relevant = candidates.find(c =>
    c.includes(team1) || c.includes(team2) ||
    (abbr1 && c.startsWith(abbr1)) || (abbr2 && c.startsWith(abbr2))
  ) || candidates[0];
  if (!relevant) return null;
  return relevant.replace(/^([A-Z]+) won/, (_, abbr) => (IPL_ABBR_TO_FULL[abbr] || abbr) + ' won');
}

// ---------------------------------------------------------------------------
// Browser helpers
// ---------------------------------------------------------------------------
async function getCompletedPaths(browser) {
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
        .replace(/\/(live-cricket-score|full-scorecard|live-match-blog|commentary|points-table-standings|match-report|match-photo|match-videos|match-news)$/, '');
      if (seen.has(clean)) return;
      seen.add(clean);
      results.push(clean);
    });
    return results;
  });
  await page.close();
  return hrefs;
}

async function fetchScorecard(browser, url) {
  const page = await newPage(browser);
  await page.goto(url, { waitUntil: 'load', timeout: 45000 });
  await sleep(5000);
  // Scroll incrementally — each evaluate is synchronous to avoid detached frame errors
  const scrollHeight = await page.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < scrollHeight; y += 400) {
    await page.evaluate((pos) => window.scrollTo(0, pos), y);
    await sleep(200);
  }
  await page.evaluate((h) => window.scrollTo(0, h), scrollHeight);
  await sleep(3000);
  const text = await page.evaluate(() => document.body.innerText);
  await page.close();
  return text;
}

// ---------------------------------------------------------------------------
// Upcoming: next unplayed match day from schedule
// ---------------------------------------------------------------------------
function computeUpcoming(schedule, completedIds) {
  const today = dateIST();
  // Find the earliest date in schedule that has at least one unplayed match
  const dateGroups = new Map();
  for (const entry of schedule) {
    if (!dateGroups.has(entry.date)) dateGroups.set(entry.date, []);
    dateGroups.get(entry.date).push(entry);
  }
  // Sort dates ascending
  const sortedDates = [...dateGroups.keys()].sort();
  for (const date of sortedDates) {
    if (date < today) continue; // past
    const matches = dateGroups.get(date);
    const unplayed = matches.filter(m => {
      const id = matchId(m.team1, m.team2, date);
      return !completedIds.has(id);
    });
    if (unplayed.length > 0) {
      return unplayed.map(m => ({
        ipl_team1: m.team1,
        ipl_team2: m.team2,
        date,
      }));
    }
  }
  return [];
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
(async () => {
  const useYesterday = process.argv.includes('--yesterday');
  const targetDate = useYesterday ? dateIST(-1) : dateIST(0);
  console.log(`Target date: ${targetDate}${useYesterday ? ' (--yesterday)' : ''}`);

  const schedule = JSON.parse(fs.readFileSync(SCHEDULE_JSON, 'utf8'));
  const data = JSON.parse(fs.readFileSync(MATCHES_JSON, 'utf8'));
  const teamsData = JSON.parse(fs.readFileSync(TEAMS_JSON, 'utf8'));
  const fantasyMap = buildFantasyMap(teamsData);

  // Matches scheduled on target date
  const todayMatches = schedule.filter(m => m.date === targetDate);
  if (todayMatches.length === 0) {
    console.log(`No matches scheduled on ${targetDate} — nothing to do.`);
    process.exit(0);
  }
  console.log(`Scheduled on ${targetDate}: ${todayMatches.map(m => `${m.team1} vs ${m.team2}`).join(', ')}`);

  // Already-completed IDs
  const completedIds = new Set(data.matches.map(m => m.id));

  // Filter to unprocessed matches
  const toProcess = todayMatches.filter(m => !completedIds.has(matchId(m.team1, m.team2, targetDate)));
  if (toProcess.length === 0) {
    console.log('All matches for this date already in matches.json — nothing to do.');
    process.exit(0);
  }
  console.log(`To process: ${toProcess.map(m => `${m.team1} vs ${m.team2}`).join(', ')}\n`);

  const browser = await launchBrowser();
  const completed = [];

  try {
    console.log('Fetching completed match paths from schedule page...');
    const completedPaths = await getCompletedPaths(browser);
    console.log(`Found ${completedPaths.length} completed match path(s)\n`);

    for (const match of toProcess) {
      const { team1: ipl_team1, team2: ipl_team2 } = match;
      console.log(`--- Processing: ${ipl_team1} vs ${ipl_team2} (${targetDate}) ---`);

      const matchPath = findPathForTeams(completedPaths, ipl_team1, ipl_team2);
      if (!matchPath) {
        console.log('  Not yet completed on schedule page — skipping.\n');
        continue;
      }

      const scorecardUrl = `https://www.espncricinfo.com${matchPath}/full-scorecard`;
      console.log(`  Scorecard URL: ${scorecardUrl}`);

      let text;
      try {
        text = await fetchScorecard(browser, scorecardUrl);
      } catch (e) {
        console.log(`  Failed to fetch scorecard: ${e.message} — skipping.\n`);
        continue;
      }

      if (text.includes('Access Denied') || text.length < 500) {
        console.log('  Page blocked — skipping.\n');
        continue;
      }

      const result = extractResult(text, ipl_team1, ipl_team2);
      if (!result) {
        console.log('  No result string found — match may still be in progress — skipping.\n');
        continue;
      }
      console.log(`  Result: ${result}`);

      const innings = parseScorecard(text);
      if (innings.length === 0) {
        console.log('  Could not parse any innings — skipping.\n');
        continue;
      }
      console.log(`  Parsed ${innings.length} innings`);

      // Build fantasy performances
      const playerMap = new Map();
      for (const inn of innings) {
        for (const b of inn.batting) {
          const canonical = lookupFantasy(b.name, fantasyMap);
          if (!canonical) continue;
          if (!playerMap.has(canonical)) playerMap.set(canonical, {});
          playerMap.get(canonical).batting = { runs: b.runs, balls: b.balls };
        }
        for (const b of inn.bowling) {
          const canonical = lookupFantasy(b.name, fantasyMap);
          if (!canonical) continue;
          if (!playerMap.has(canonical)) playerMap.set(canonical, {});
          playerMap.get(canonical).bowling = { wickets: b.wickets, overs: b.overs, runs_conceded: b.runs_conceded };
        }
      }

      const performances = [];
      for (const [name, perf] of playerMap.entries()) {
        performances.push({ player_name: name, ...perf });
      }

      const entry = {
        id: matchId(ipl_team1, ipl_team2, targetDate),
        ipl_team1,
        ipl_team2,
        date: targetDate,
        result,
        performances,
      };

      console.log(`  Fantasy players found: ${performances.length}`);
      performances.forEach(p => {
        const bat = p.batting ? `${p.batting.runs}(${p.batting.balls}b)` : '';
        const bowl = p.bowling ? `${p.bowling.wickets}w` : '';
        console.log(`    ${p.player_name}: ${[bat, bowl].filter(Boolean).join(' ')}`);
      });

      completed.push(entry);
      completedIds.add(entry.id);
      console.log('');
    }

    if (completed.length === 0) {
      console.log('No new completed matches found — matches.json not modified.');
      process.exit(0);
    }

    // Append to matches.json and update upcoming_matches
    data.matches.push(...completed);
    data.upcoming_matches = computeUpcoming(schedule, completedIds);
    fs.writeFileSync(MATCHES_JSON, JSON.stringify(data, null, 2));
    console.log(`Wrote ${completed.length} completed match(es) to matches.json`);
    console.log(`Next upcoming: ${data.upcoming_matches.map(m => `${m.ipl_team1} vs ${m.ipl_team2} (${m.date})`).join(', ') || 'none'}`);

    // Deploy
    console.log('\nDeploying to Vercel...');
    try {
      const token = process.env.VERCEL_TOKEN ? `--token ${process.env.VERCEL_TOKEN}` : '';
      execSync(`vercel --prod ${token}`, { cwd: path.join(__dirname, '..'), stdio: 'inherit' });
      console.log('Deploy successful.');
    } catch (e) {
      console.error('Deploy failed:', e.message);
      process.exit(1);
    }

  } catch (e) {
    console.error('Fatal error:', e.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
