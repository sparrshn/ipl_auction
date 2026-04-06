import Papa from 'papaparse'
import type { PlayerRole } from '../supabase/types'

const CR = 10_000_000

export interface ParsedPlayer {
  name: string
  nationality: string | null
  role: PlayerRole | null
  ipl_team: string | null
  uncapped: boolean
  is_captain: boolean
  base_price: number
}

export interface ParseResult {
  players: ParsedPlayer[]
  errors: string[]
}

/**
 * Parses the Type field from the final CSV format.
 * Tags: Bt=Batsman, Bw=Bowler, Alr=All-Rounder, Wk=Wicket-Keeper,
 *       Fp=Foreign player, UC=Uncapped, Cpt=Captain (ignored)
 */
function parseTypeField(raw: string): { role: PlayerRole | null; nationality: string; uncapped: boolean; is_captain: boolean } {
  const tags = raw.split(',').map((t) => t.trim().toLowerCase())

  let role: PlayerRole | null = null
  if (tags.includes('wk')) role = 'Wicket-Keeper'
  else if (tags.includes('alr')) role = 'All-Rounder'
  else if (tags.includes('bw')) role = 'Bowler'
  else if (tags.includes('bt')) role = 'Batsman'

  const nationality = tags.includes('fp') ? 'Overseas' : 'India'
  const uncapped = tags.includes('uc')
  const is_captain = tags.includes('cpt')

  return { role, nationality, uncapped, is_captain }
}

export function parseCsvText(text: string): ParseResult {
  const result = Papa.parse<Record<string, string>>(text.trim(), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  })

  const players: ParsedPlayer[] = []
  const errors: string[] = []

  if (!result.data || result.data.length === 0) {
    errors.push('CSV is empty or has no data rows')
    return { players, errors }
  }

  const firstRow = result.data[0]
  // Detect format: new format has "player name", old has "name"
  const isNewFormat = 'player name' in firstRow

  if (!isNewFormat && !('name' in firstRow)) {
    errors.push('CSV must have a "Player Name" or "name" column')
    return { players, errors }
  }

  result.data.forEach((row, i) => {
    const lineNum = i + 2

    const name = (isNewFormat ? row['player name'] : row['name'])?.trim()
    if (!name) {
      errors.push(`Row ${lineNum}: missing player name`)
      return
    }

    const rawPrice = (isNewFormat ? row['base price'] : row['base_price'])?.trim()
    if (!rawPrice) {
      errors.push(`Row ${lineNum} (${name}): missing base price`)
      return
    }
    const priceNum = parseFloat(rawPrice)
    if (isNaN(priceNum)) {
      errors.push(`Row ${lineNum} (${name}): invalid base price "${rawPrice}"`)
      return
    }
    const base_price = Math.round(priceNum * CR)

    if (isNewFormat) {
      const typeRaw = row['type']?.trim() ?? ''
      const { role, nationality, uncapped, is_captain } = parseTypeField(typeRaw)
      const ipl_team = row['team']?.trim() || null
      players.push({ name, nationality, role, ipl_team, uncapped, is_captain, base_price })
    } else {
      // Legacy format
      const nationality = row['nationality']?.trim() || 'India'
      const roleRaw = row['role']?.trim() ?? ''
      const VALID_ROLES: PlayerRole[] = ['Batsman', 'Bowler', 'All-Rounder', 'Wicket-Keeper']
      const role = VALID_ROLES.find(
        (v) => v.toLowerCase() === roleRaw.toLowerCase()
      ) ?? null
      players.push({ name, nationality, role, ipl_team: null, uncapped: false, is_captain: false, base_price })
    }
  })

  return { players, errors }
}

export async function parseCsvFile(file: File): Promise<ParseResult> {
  const text = await file.text()
  return parseCsvText(text)
}
