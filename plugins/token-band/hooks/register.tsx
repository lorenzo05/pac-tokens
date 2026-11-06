import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Snapshot } from '../types'
import { DEATH, newGame, step } from './game'
import type { Game } from './game'

const snapshot = atom({ plugin: 'token-band', key: 'snapshot' } as const, null)
const isHidden = atom({ plugin: 'token-band', key: 'isHidden' } as const, false)

const FRAME_MS = 140

// The arcade cabinet's own palette.
const ARCADE = {
  black: '#000000',
  pacman: '#FFFF00',
  dot: '#FFB8AE',
  white: '#FFFFFF',
  red: '#FF0000',
  cyan: '#00FFFF',
  purple: '#9B49FC',
  frightened: '#2121FF',
}
// The maze walls shade from arcade blue through purple and back.
const WALLS = ['#2121DE', '#3B2BE6', '#5A35EE', '#7A3FF5', '#9B49FC', '#7A3FF5', '#5A35EE', '#3B2BE6']
const RAINBOW = ['#FF3B3B', '#FFB852', '#FFFF00', '#3BFF6E', '#00FFFF', '#4D7CFF', '#B266FF', '#FFB8FF']
// The bonus fruit of each level, as the arcade orders them.
const FRUITS = ['🍒', '🍓', '🍊', '🍎', '🍈', '🍇', '🔔', '🔑']

type Cell = { ch: string; color: string }

async function refresh($: EngineInterface) {
  const usage = await $.session.usage()
  const next: Snapshot = {
    limits: usage.rateLimits.map(l => ({ kind: l.kind, percentUsed: l.percentUsed, resetsAt: l.resetsAt })),
  }
  await update($, snapshot, () => next)
}

function resetsIn(resetsAt: string | undefined, now: number): string {
  if (!resetsAt) return ''
  const ms = Date.parse(resetsAt) - now
  if (!(ms > 0)) return ''
  const hours = Math.floor(ms / 3_600_000)
  if (hours >= 24) return ` ${Math.floor(hours / 24)}d${hours % 24}h`
  return ` ${hours}h${Math.floor((ms % 3_600_000) / 60_000)}m`
}

function leftColor(left: number): string {
  if (left <= 15) return '#FF3B3B'
  if (left <= 40) return '#FFB852'
  return '#3BFF6E'
}

function drawTrack(game: Game): Cell[] {
  const blink = game.tick % 6 < 3
  const cells: Cell[] = game.dots.map((dot, x) => {
    if (!dot) return { ch: ' ', color: ARCADE.black }
    if (game.pellets.includes(x)) return { ch: blink ? '●' : ' ', color: ARCADE.dot }
    return { ch: '·', color: ARCADE.dot }
  })

  // The blue ghosts flash white as their fright runs out.
  const flashing = game.frightened > 0 && game.frightened < 12 && game.tick % 2 === 0
  if (game.dying === 0 && game.over === 0) {
    for (const ghost of game.ghosts) {
      if (ghost.eyes > 0) cells[ghost.x] = { ch: '¨', color: ARCADE.white }
      else if (game.frightened > 0) cells[ghost.x] = { ch: 'ᗣ', color: flashing ? ARCADE.white : ARCADE.frightened }
      else cells[ghost.x] = { ch: 'ᗣ', color: ghost.color }
    }
  }

  if (game.over === 0) {
    const mouthOpen = game.tick % 2 === 0
    const pac =
      game.dying > 0
        ? (DEATH[Math.min(DEATH.length - 1, Math.floor(game.dying / 2))] ?? ' ')
        : !mouthOpen
          ? '●'
          : game.dir === 1
            ? 'ᗧ'
            : 'ᗤ'
    cells[game.pac] = { ch: pac, color: ARCADE.pacman }
  }

  const banner =
    game.over > 0
      ? { text: 'GAME  OVER', color: ARCADE.red, at: -1 }
      : game.ready > 0
        ? { text: 'READY!', color: ARCADE.pacman, at: -1 }
        : game.popup
          ? { text: game.popup.text, color: ARCADE.cyan, at: game.popup.x }
          : null
  if (banner) {
    const start =
      banner.at >= 0
        ? Math.max(0, Math.min(game.width - banner.text.length, banner.at - 1))
        : Math.floor((game.width - banner.text.length) / 2)
    ;[...banner.text].forEach((ch, i) => {
      cells[start + i] = { ch, color: banner.color }
    })
  }
  return cells
}

function runs(cells: Cell[]): { text: string; color: string }[] {
  const out: { text: string; color: string }[] = []
  for (const cell of cells) {
    const last = out[out.length - 1]
    if (last && last.color === cell.color) last.text += cell.ch
    else out.push({ text: cell.ch, color: cell.color })
  }
  return out
}

// The wall's colors roll along it a step every few frames.
function wall(left: string, right: string, width: number, shift: number) {
  const line = left + '═'.repeat(width) + right
  const seg = Math.ceil(line.length / WALLS.length)
  return WALLS.map((_, i) => ({
    color: WALLS[(i + shift) % WALLS.length] ?? ARCADE.black,
    text: line.slice(i * seg, (i + 1) * seg),
  }))
}

export const register: Register = on => {
  let game = newGame(40)

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await $.command.register({ name: 'tokens', description: 'Show or hide the Pac-Man usage bar' })
    await refresh($)
    $.clock.every(FRAME_MS, () => {
      step(game)
      $.ui.invalidate('ui.render')
    })
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
    return { text: hidden ? 'Pac-Man bar hidden.' : 'Pac-Man bar shown.' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const snap = await read($, snapshot)
    if (e.props.hasSurvey || snap === null || (await read($, isHidden))) {
      return next(e)
    }

    const width = Math.max(20, Math.min(60, e.props.bodyColumns - 2))
    if (width !== game.width) game = newGame(width, game.high)

    const { Box, Button, Text } = $.ui.resolve(e)
    const now = await $.clock.now()
    const bg = ARCADE.black
    const shift = Math.floor(game.tick / 3)
    const fruit = FRUITS[(game.level - 1) % FRUITS.length] ?? '🍒'
    const windows = [
      { label: '5H', limit: snap.limits.find(l => l.kind === 'five_hour') },
      { label: 'WEEK', limit: snap.limits.find(l => l.kind === 'seven_day') },
    ]

    return (
      <Box flexDirection="column">
        <Text mono backgroundColor={bg} bold>
          <Text color={game.tick % 8 < 4 ? ARCADE.white : ARCADE.red}> 1UP </Text>
          <Text color={ARCADE.white}>{String(game.score).padStart(6)}   </Text>
          {[...'HIGH SCORE'].map((ch, i) => (
            <Text key={`h${i}`} color={RAINBOW[(i + shift) % RAINBOW.length]}>{ch}</Text>
          ))}
          <Text color={ARCADE.white}> {String(game.high).padStart(6)} </Text>
        </Text>
        <Text mono backgroundColor={bg} bold>
          {wall('╔', '╗', game.width, shift).map((w, i) => (
            <Text key={`wt${i}`} color={w.color}>{w.text}</Text>
          ))}
        </Text>
        <Text mono backgroundColor={bg} bold>
          <Text color={WALLS[shift % WALLS.length]}>║</Text>
          {runs(drawTrack(game)).map((run, i) => (
            <Text key={`c${i}`} color={run.color}>{run.text}</Text>
          ))}
          <Text color={WALLS[(shift + WALLS.length - 1) % WALLS.length]}>║</Text>
        </Text>
        <Text mono backgroundColor={bg} bold>
          {wall('╚', '╝', game.width, shift).map((w, i) => (
            <Text key={`wb${i}`} color={w.color}>{w.text}</Text>
          ))}
        </Text>
        <Box>
          <Text mono backgroundColor={bg} bold>
            <Text color={ARCADE.pacman}> {'ᗧ '.repeat(Math.max(0, game.lives))}</Text>
            <Text> {fruit} </Text>
            {windows.map(({ label, limit }) => {
              if (!limit) return <Text key={label} color={ARCADE.purple}> {label} ?? </Text>
              const left = Math.max(0, Math.round(100 - limit.percentUsed))
              return (
                <Text key={label}>
                  <Text color={ARCADE.black} backgroundColor={leftColor(left)}> {label} {left}% LEFT </Text>
                  <Text color={ARCADE.cyan}>{resetsIn(limit.resetsAt, now)} </Text>
                </Text>
              )
            })}
          </Text>
          <Text> </Text>
          <Button key="hide" label="Hide" onPress={() => update($, isHidden, () => true)} />
        </Box>
      </Box>
    )
  })
}
