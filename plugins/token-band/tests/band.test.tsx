import { expect, test } from 'claude-code/testing'

const BAND = {
  plugin: 'token-band',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

test('the band shows the 5-hour and weekly usage left', async ($, on) => {
  on('command.register', () => ({ value: { command: 'tokens' } }))
  on('session.usage', () => ({
    value: {
      startedAt: 0,
      context: { tokens: 1, window: 200_000, percent: 0 },
      rateLimits: [
        { kind: 'five_hour', percentUsed: 23 },
        { kind: 'seven_day', percentUsed: 90 },
      ],
    },
  }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('clock.now', () => ({ value: 0 }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect((await ui.find({ type: 'Text', text: /77% left/ }))?.text).toContain('77% left')
    expect((await ui.find({ type: 'Text', text: /10% left/ }))?.text).toContain('10% left')
    await ui.unmount()
  }
})
