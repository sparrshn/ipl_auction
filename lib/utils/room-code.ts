/**
 * Generate a random 6-character alphanumeric room code (uppercase)
 */
export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no O, 0, I, 1 to avoid confusion
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

/**
 * Generate a random 12-character join token
 */
export function generateJoinToken(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let token = ''
  for (let i = 0; i < 12; i++) {
    token += chars[Math.floor(Math.random() * chars.length)]
  }
  return token
}
