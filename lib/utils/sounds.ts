function getCtx(): AudioContext | null {
  try {
    return new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
  } catch {
    return null
  }
}

function note(ctx: AudioContext, freq: number, startAt: number, duration: number, volume = 0.3) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.frequency.value = freq
  gain.gain.setValueAtTime(volume, startAt)
  gain.gain.exponentialRampToValueAtTime(0.001, startAt + duration)
  osc.start(startAt)
  osc.stop(startAt + duration)
}

export function playTick(urgent: boolean) {
  const ctx = getCtx()
  if (!ctx) return
  note(ctx, urgent ? 880 : 660, ctx.currentTime, 0.12, 0.3)
  setTimeout(() => ctx.close(), 300)
}

export function playBid() {
  const ctx = getCtx()
  if (!ctx) return
  const t = ctx.currentTime
  // Quick two-note upward chime
  note(ctx, 520, t, 0.1, 0.25)
  note(ctx, 780, t + 0.08, 0.15, 0.2)
  setTimeout(() => ctx.close(), 500)
}

export function playSold() {
  const ctx = getCtx()
  if (!ctx) return
  const t = ctx.currentTime
  // Ascending 3-note fanfare: C5 → E5 → G5
  note(ctx, 523, t,        0.18, 0.35)
  note(ctx, 659, t + 0.16, 0.18, 0.35)
  note(ctx, 784, t + 0.32, 0.35, 0.45)
  setTimeout(() => ctx.close(), 1200)
}

export function playUnsold() {
  const ctx = getCtx()
  if (!ctx) return
  const t = ctx.currentTime
  // Descending 2-note wah-wah: G4 → D4
  note(ctx, 392, t,        0.25, 0.28)
  note(ctx, 294, t + 0.22, 0.35, 0.28)
  setTimeout(() => ctx.close(), 900)
}

export function playNewPlayer() {
  const ctx = getCtx()
  if (!ctx) return
  const t = ctx.currentTime
  // Single clean ding: A5
  note(ctx, 880, t, 0.05, 0.3)
  note(ctx, 880, t + 0.08, 0.25, 0.2)
  setTimeout(() => ctx.close(), 600)
}

export function playNewCategory() {
  const ctx = getCtx()
  if (!ctx) return
  const t = ctx.currentTime
  // Dramatic 4-note ascending fanfare: C4 → E4 → G4 → C5
  note(ctx, 262, t,        0.15, 0.35)
  note(ctx, 330, t + 0.13, 0.15, 0.35)
  note(ctx, 392, t + 0.26, 0.15, 0.35)
  note(ctx, 523, t + 0.39, 0.4,  0.5)
  setTimeout(() => ctx.close(), 1500)
}
