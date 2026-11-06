import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Snapshot } from '../types'

const snapshot = atom({ plugin: 'token-band', key: 'snapshot' } as const, null)
const isHidden = atom({ plugin: 'token-band', key: 'isHidden' } as const, false)
const isPaneOpen = atom({ plugin: 'token-band', key: 'isPaneOpen' } as const, false)

// The band above the prompt is drawn on the terminal and desktop only, so the
// same arcade also lives in a pane, which every surface (the phone too) draws.
const PANE = 'pac-tokens'

const LIMIT_NAMES: Record<string, string> = {
  five_hour: '5h',
  seven_day: '7d',
  spend_limit: 'spend',
}

function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`
  return String(n)
}

async function openPane($: EngineInterface) {
  await $.ui.open({ id: PANE, title: 'PAC-TOKENS' })
  await update($, isPaneOpen, () => true)
}

async function refresh($: EngineInterface) {
  const usage = await $.session.usage()
  const next: Snapshot = {
    tokens: usage.context.tokens ?? null,
    window: usage.context.window,
    percent: usage.context.percent ?? null,
    usd: usage.cost?.usd ?? null,
    limits: usage.rateLimits.map(l => ({ kind: l.kind, percentUsed: l.percentUsed })),
  }
  await update($, snapshot, () => next)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await $.command.register({ name: 'tokens', description: 'Show or hide PAC-TOKENS' })
    await refresh($)
    if (!(await read($, isHidden))) await openPane($)
    return result
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    await refresh($)
    return result
  })

  on('command.run', { command: 'tokens' }, async $ => {
    const hidden = !(await read($, isHidden))
    await update($, isHidden, () => hidden)
    if (hidden) await $.ui.close({ id: PANE })
    else await openPane($)
    return { text: hidden ? 'PAC-TOKENS hidden.' : 'PAC-TOKENS shown.' }
  })

  on('ui.close', async ($, e, next) => {
    if (e.id === PANE) await update($, isPaneOpen, () => false)
    return next(e)
  })

  on('ui.render', async ($, e, next) => {
    const isBand = e.component === 'AbovePrompt'
    const isPane = e.component === 'Pane' && e.requestId === PANE
    if (!isBand && !isPane) return next(e)

    const snap = await read($, snapshot)
    const quiet =
      snap === null ||
      (await read($, isHidden)) ||
      (e.component === 'AbovePrompt' && (e.props.hasSurvey || (await read($, isPaneOpen))))
    if (quiet) return next(e)

    const columns = e.component === 'AbovePrompt' || e.component === 'Pane' ? e.props.bodyColumns : 42
    const TRACK = Math.max(12, Math.min(40, columns - 2))

    const { Box, Button, Text } = $.ui.resolve(e)
    const used = snap.tokens ?? 0
    const percent = snap.percent ?? Math.round((used / snap.window) * 100)

    // Pac-Man eats the context window left to right: the dots ahead are the
    // tokens left. The four ghosts chase him and close in as it fills up.
    const pos = Math.min(TRACK - 1, Math.round((percent / 100) * (TRACK - 1)))
    const isOpen = used % 2 === 0
    const gap = Math.max(1, Math.round((100 - percent) / 8))
    const frightened = percent < 15

    const cells: Cell[] = Array.from({ length: TRACK }, (_, i) => {
      if (i < pos) return { ch: ' ', color: ARCADE.trail, bg: ARCADE.trail }
      const zone = zoneColor(i / (TRACK - 1))
      if ((i + 1) % 10 === 0) return { ch: isOpen ? '●' : '◦', color: zone, bg: ARCADE.black }
      return { ch: '•', color: zone, bg: ARCADE.black }
    })
    GHOSTS.forEach((color, k) => {
      const at = pos - gap - k * 2
      if (at >= 0) {
        cells[at] = { ch: 'ᗣ', color: frightened ? ARCADE.white : color, bg: frightened ? ARCADE.frightened : ARCADE.trail }
      }
    })
    cells[pos] = { ch: isOpen ? 'ᗧ' : '●', color: ARCADE.pacman, bg: ARCADE.black }

    const fiveHour = snap.limits.find(l => l.kind === 'five_hour')
    const lives = fiveHour ? Math.max(0, 3 - Math.floor(fiveHour.percentUsed / 34)) : 3
    const fruits = snap.usd !== null ? FRUITS.slice(0, Math.min(FRUITS.length, 1 + Math.floor(snap.usd))) : []
    const levelColor = percent >= 85 ? ARCADE.red : percent >= 60 ? ARCADE.orange : ARCADE.green
    const bg = ARCADE.black

    return (
      <Box flexDirection="column">
        <Text mono backgroundColor={bg} bold>
          <Text> </Text>
          {TITLE.split('').map((ch, i) => (
            <Text key={`t${i}`} color={RAINBOW[i % RAINBOW.length]}>{ch}</Text>
          ))}
          <Text>  </Text>
          <Text color={ARCADE.black} backgroundColor={ARCADE.red}> 1UP </Text>
          <Text color={ARCADE.pacman}> {compact(used)} </Text>
          <Text color={ARCADE.black} backgroundColor={ARCADE.cyan}> HI </Text>
          <Text color={ARCADE.pink}> {compact(snap.window)} </Text>
        </Text>
        <Text mono backgroundColor={bg} bold>
          {wall('╔', '╗', TRACK).map((w, i) => (
            <Text key={`wt${i}`} color={w.color}>{w.text}</Text>
          ))}
        </Text>
        <Text mono bold>
          <Text color={WALLS[0]} backgroundColor={bg}>║</Text>
          {runs(cells).map((run, i) => (
            <Text key={`c${i}`} color={run.color} backgroundColor={run.bg}>{run.text}</Text>
          ))}
          <Text color={WALLS[WALLS.length - 1]} backgroundColor={bg}>║</Text>
        </Text>
        <Text mono backgroundColor={bg} bold>
          {wall('╚', '╝', TRACK).map((w, i) => (
            <Text key={`wb${i}`} color={w.color}>{w.text}</Text>
          ))}
        </Text>
        <Box>
          <Text mono backgroundColor={bg} bold>
            <Text color={ARCADE.pacman}> {'ᗧ '.repeat(lives)}</Text>
            <Text color={ARCADE.black} backgroundColor={levelColor}> {percent}% FULL </Text>
            {snap.limits.map((l, i) => (
              <Text key={`l${i}`}>
                <Text> </Text>
                <Text color={ARCADE.black} backgroundColor={limitColor(l.percentUsed)}>
                  {' '}{LIMIT_NAMES[l.kind] ?? l.kind} {l.percentUsed}%{' '}
                </Text>
              </Text>
            ))}
            {snap.usd !== null ? (
              <Text>
                <Text> {fruits.join('')} </Text>
                <Text color={ARCADE.black} backgroundColor={ARCADE.pink}> ${snap.usd.toFixed(2)} </Text>
              </Text>
            ) : null}
            <Text> </Text>
          </Text>
          <Text> </Text>
          <Button key="hide" label="Hide" onPress={async () => {
              await update($, isHidden, () => true)
              await $.ui.close({ id: PANE })
            }} />
        </Box>
      </Box>
    )
  })
}

type Cell = { ch: string; color: string; bg: string }

const TITLE = 'PAC-TOKENS'

// The arcade cabinet's own palette.
const ARCADE = {
  black: '#000000',
  trail: '#10104A',
  pacman: '#FFFF00',
  white: '#FFFFFF',
  red: '#FF3B3B',
  orange: '#FFB852',
  green: '#3BFF6E',
  cyan: '#00FFFF',
  pink: '#FFB8FF',
  frightened: '#2121FF',
}

// Blinky, Pinky, Inky and Clyde, in chase order.
const GHOSTS = ['#FF0000', '#FFB8FF', '#00FFFF', '#FFB852']
const RAINBOW = ['#FF3B3B', '#FFB852', '#FFFF00', '#3BFF6E', '#00FFFF', '#4D7CFF', '#B266FF', '#FFB8FF']
// The maze walls shade from arcade blue to purple and back.
const WALLS = ['#2121DE', '#3B2BE6', '#5A35EE', '#7A3FF5', '#9B49FC', '#7A3FF5', '#5A35EE', '#3B2BE6']
// One more piece of fruit for each dollar spent, as the levels go.
const FRUITS = ['🍒', '🍓', '🍊', '🍎', '🍈', '🍇', '🔔', '🔑']

function wall(left: string, right: string, TRACK: number) {
  const seg = Math.ceil((TRACK + 2) / WALLS.length)
  const line = left + '═'.repeat(TRACK) + right
  return WALLS.map((color, i) => ({ color, text: line.slice(i * seg, (i + 1) * seg) }))
}

// Dots run green, then yellow, then red as they near the end of the window.
function zoneColor(t: number): string {
  if (t < 0.6) return '#3BFF6E'
  if (t < 0.85) return '#FFFF00'
  return '#FF3B3B'
}

function limitColor(percentUsed: number): string {
  if (percentUsed >= 80) return '#FF3B3B'
  if (percentUsed >= 50) return '#FFB852'
  return '#00FFFF'
}

function runs(cells: Cell[]): { text: string; color: string; bg: string }[] {
  const out: { text: string; color: string; bg: string }[] = []
  for (const cell of cells) {
    const last = out[out.length - 1]
    if (last && last.color === cell.color && last.bg === cell.bg) last.text += cell.ch
    else out.push({ text: cell.ch, color: cell.color, bg: cell.bg })
  }
  return out
}
