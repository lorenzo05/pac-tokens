import { expect, test } from 'claude-code/testing'

import { newGame, step } from '../hooks/game'

test('the game plays itself through deaths, blue ghosts and levels', async () => {
  const game = newGame(40)
  const seen = { frightened: false, eaten: false, died: false, level: false, over: false }
  for (let i = 0; i < 20_000; i++) {
    const score = game.score
    step(game)
    if (game.frightened > 0) seen.frightened = true
    if (game.score - score >= 200) seen.eaten = true
    if (game.dying > 0) seen.died = true
    if (game.level > 1) seen.level = true
    if (game.over > 0) seen.over = true
    expect(game.pac >= 0 && game.pac < 40).toBe(true)
    for (const g of game.ghosts) expect(g.x >= 0 && g.x < 40).toBe(true)
  }
  expect(seen).toEqual({ frightened: true, eaten: true, died: true, level: true, over: true })
})
