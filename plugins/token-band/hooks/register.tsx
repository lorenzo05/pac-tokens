import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Snapshot } from '../types'

const snapshot = atom({ plugin: 'token-band', key: 'snapshot' } as const, null)
const isHidden = atom({ plugin: 'token-band', key: 'isHidden' } as const, false)

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
  if (hours >= 24) return ` (resets in ${Math.floor(hours / 24)}d ${hours % 24}h)`
  return ` (resets in ${hours}h ${Math.floor((ms % 3_600_000) / 60_000)}m)`
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await $.command.register({ name: 'tokens', description: 'Show or hide your usage limits' })
    await refresh($)
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
    return { text: hidden ? 'Usage bar hidden.' : 'Usage bar shown.' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const snap = await read($, snapshot)
    if (e.props.hasSurvey || snap === null || (await read($, isHidden))) {
      return next(e)
    }

    const { Box, Button, Text } = $.ui.resolve(e)
    const now = await $.clock.now()
    const windows = [
      { label: '5-hour', limit: snap.limits.find(l => l.kind === 'five_hour') },
      { label: 'Weekly', limit: snap.limits.find(l => l.kind === 'seven_day') },
    ]

    return (
      <Box>
        {windows.map(({ label, limit }) => {
          if (!limit) return <Text key={label} dimColor>{label}: no reading yet   </Text>
          const left = Math.max(0, Math.round(100 - limit.percentUsed))
          const color = left <= 15 ? 'red' : left <= 40 ? 'yellow' : 'green'
          return (
            <Text key={label}>
              <Text dimColor>{label}: </Text>
              <Text color={color} bold>{left}% left</Text>
              <Text dimColor>{resetsIn(limit.resetsAt, now)}   </Text>
            </Text>
          )
        })}
        <Button key="hide" label="Hide" onPress={() => update($, isHidden, () => true)} />
      </Box>
    )
  })
}
