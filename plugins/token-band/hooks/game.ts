// A one-row Pac-Man that plays itself: he laps the track eating dots, the
// ghosts chase him, a power pellet turns them blue and him around to hunt
// them, and a ghost that catches him costs a life.

export type Ghost = {
  name: string
  color: string
  x: number
  // Ticks left as a pair of eyes on the way back to the house; 0 when hunting.
  eyes: number
  // Hunting ghosts skip one tick in this many on average, so each has its own pace.
  pace: number
}

export type Popup = { x: number; text: string; ticks: number }

export type Game = {
  width: number
  tick: number
  // The state of the game's own random numbers, so no two rounds play alike.
  seed: number
  pac: number
  dir: 1 | -1
  dots: boolean[]
  pellets: number[]
  frightened: number
  combo: number
  // Dots eaten since he last paused: he slows down while eating, as in the arcade.
  munched: number
  ghosts: Ghost[]
  score: number
  high: number
  lives: number
  level: number
  ready: number
  dying: number
  over: number
  popup: Popup | null
}

export const FRIGHTENED_TICKS = 45
const READY_TICKS = 12
const EYES_TICKS = 14
const GAME_OVER_TICKS = 20
export const DEATH = ['ᗧ', '◔', '◑', '◕', '○', '✶', '✶', ' ']

const GHOSTS: Omit<Ghost, 'x' | 'eyes'>[] = [
  { name: 'Blinky', color: '#FF0000', pace: 9 },
  { name: 'Pinky', color: '#FFB8FF', pace: 6 },
  { name: 'Inky', color: '#00FFFF', pace: 5 },
  { name: 'Clyde', color: '#FFB852', pace: 4 },
]

export function newGame(width: number, high = 0): Game {
  const game: Game = {
    width,
    tick: 0,
    seed: (high * 7919 + width) % 2147483647 || 1,
    pac: 0,
    dir: 1,
    dots: [],
    pellets: [],
    frightened: 0,
    combo: 0,
    munched: 0,
    ghosts: [],
    score: 0,
    high,
    lives: 3,
    level: 1,
    ready: READY_TICKS,
    dying: 0,
    over: 0,
    popup: null,
  }
  fillDots(game)
  resetPositions(game)
  return game
}

function fillDots(game: Game) {
  const w = game.width
  game.dots = Array.from({ length: w }, () => true)
  game.pellets = [Math.floor(w / 4), Math.floor((3 * w) / 4)]
}

function resetPositions(game: Game) {
  const home = Math.floor(game.width / 2)
  game.pac = 0
  game.dir = 1
  game.frightened = 0
  game.combo = 0
  game.dots[0] = false
  game.ghosts = GHOSTS.map((g, k) => ({ ...g, x: home + k * 3, eyes: 0 }))
}

function random(game: Game): number {
  game.seed = (game.seed * 48271) % 2147483647
  return game.seed / 2147483647
}

export function wrap(game: Game, x: number): number {
  return ((x % game.width) + game.width) % game.width
}

// Steps from a to b the short way round the track: its sign is the way to go.
function toward(game: Game, a: number, b: number): number {
  const d = wrap(game, b - a)
  return d <= game.width / 2 ? d : d - game.width
}

export function step(game: Game) {
  game.tick += 1
  if (game.popup && --game.popup.ticks <= 0) game.popup = null

  if (game.over > 0) {
    if (--game.over === 0) Object.assign(game, newGame(game.width, game.high))
    return
  }
  if (game.ready > 0) {
    game.ready -= 1
    return
  }
  if (game.dying > 0) {
    game.dying += 1
    if (game.dying > DEATH.length * 2) {
      game.dying = 0
      game.lives -= 1
      if (game.lives < 0) {
        game.over = GAME_OVER_TICKS
        return
      }
      resetPositions(game)
      game.ready = READY_TICKS
    }
    return
  }

  const before = { pac: game.pac, ghosts: game.ghosts.map(g => g.x) }

  // While the ghosts are blue Pac-Man turns to hunt the nearest one.
  if (game.frightened > 0) {
    const prey = game.ghosts.filter(g => g.eyes === 0)
    if (prey.length > 0) {
      const nearest = prey.reduce((a, b) =>
        Math.abs(toward(game, game.pac, a.x)) <= Math.abs(toward(game, game.pac, b.x)) ? a : b,
      )
      game.dir = toward(game, game.pac, nearest.x) >= 0 ? 1 : -1
    }
  }
  if (game.munched >= 3) game.munched = 0
  else {
    game.pac = wrap(game, game.pac + game.dir)
    eat(game)
  }

  if (game.frightened > 0 && --game.frightened === 0) {
    game.dir = 1
    game.combo = 0
  }

  for (const ghost of game.ghosts) {
    if (ghost.eyes > 0) {
      if (--ghost.eyes === 0) ghost.x = wrap(game, game.pac + Math.floor(game.width / 2))
      continue
    }
    // Hunting, a ghost comes at him head-on; blue, it runs the way he faces.
    if (game.frightened > 0) {
      if (random(game) < 0.5) ghost.x = wrap(game, ghost.x + game.dir)
    } else if (random(game) >= 1 / ghost.pace) {
      ghost.x = wrap(game, ghost.x - game.dir)
    }
  }

  game.ghosts.forEach((ghost, k) => {
    if (ghost.eyes > 0) return
    const met = ghost.x === game.pac || (ghost.x === before.pac && before.ghosts[k] === game.pac)
    if (!met) return
    if (game.frightened > 0) {
      const points = 200 * 2 ** game.combo
      game.combo = Math.min(game.combo + 1, 3)
      game.score += points
      ghost.eyes = EYES_TICKS
      game.popup = { x: game.pac, text: String(points), ticks: 8 }
    } else if (game.dying === 0) {
      game.dying = 1
    }
  })

  game.high = Math.max(game.high, game.score)
}

function eat(game: Game) {
  if (!game.dots[game.pac]) return
  game.dots[game.pac] = false
  game.munched += 1
  if (game.pellets.includes(game.pac)) {
    game.score += 50
    game.frightened = FRIGHTENED_TICKS
    game.combo = 0
  } else {
    game.score += 10
  }
  if (game.dots.every(dot => !dot)) {
    game.level += 1
    game.popup = { x: game.pac, text: 'LEVEL UP', ticks: 10 }
    fillDots(game)
    resetPositions(game)
    game.ready = READY_TICKS
  }
}
