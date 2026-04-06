const CR = 10_000_000

export const OWNERS = ['Sparrsh', 'Kathan', 'Aditya', 'Sanjay', 'Kaushal'] as const
export type Owner = typeof OWNERS[number]

// Starting budgets after retention deductions
export const OWNER_BUDGET: Record<Owner, number> = {
  Sparrsh: 70 * CR,
  Kathan:  70 * CR,
  Aditya:  70 * CR,
  Sanjay:  70 * CR,
  Kaushal: 100 * CR,
}

export interface Retention {
  playerName: string // must match name in uploaded CSV exactly
  price: number
  is_captain?: boolean
}

// Hardcoded retentions — static until actual auction
export const OWNER_RETENTIONS: Record<Owner, Retention[]> = {
  Sparrsh: [
    { playerName: 'Sai Sudarshan',       price: 10 * CR },
    { playerName: 'Hardik Pandya',        price: 15 * CR, is_captain: true },
    { playerName: 'Vaibhav Suryavanshi', price:  5 * CR },
  ],
  Kathan: [
    { playerName: 'Yashasvi Jaiswal',    price: 10 * CR },
    { playerName: 'Aiden Markram',       price:  5 * CR },
    { playerName: 'Josh Hazelwood',      price: 15 * CR },
  ],
  Aditya: [
    { playerName: 'SKY',                 price:  5 * CR },
    { playerName: 'Jasprit Bumrah',      price: 10 * CR },
    { playerName: 'Virat Kohli',         price: 15 * CR },
  ],
  Sanjay: [
    { playerName: 'Shreyas Iyer',        price: 15 * CR },
    { playerName: 'Devdutt Padikkal',    price:  5 * CR },
    { playerName: 'Jitesh Sharma',       price:  5 * CR },
  ],
  Kaushal: [],
}
