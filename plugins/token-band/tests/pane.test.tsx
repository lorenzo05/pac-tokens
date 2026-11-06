import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'token-band',
  component: 'Pane',
  requestId: 'pac-tokens',
  props: {
    title: 'PAC-TOKENS',
    isFocused: false,
    bodyColumns: 34,
    placement: 'inline',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

test('the arcade draws in the pane on every surface', async ($, on) => {
  on('command.register', () => ({ value: { command: 'tokens' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.usage', () => ({
    value: {
      startedAt: 0,
      context: { tokens: 84_000, window: 200_000, percent: 42 },
      rateLimits: [{ kind: 'five_hour', percentUsed: 23 }],
      cost: { usd: 0.37 },
    },
  }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'mobile', isInteractive: true })

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /84k/ }))?.text).toContain('84k')
    expect((await ui.find({ type: 'Text', text: /42% FULL/ }))?.text).toContain('42%')
    await ui.unmount()
  }
})
