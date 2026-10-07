import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderNode, SessionContextUsage } from 'claude-code'

import type { DoroFill } from '../types'
import { ROWS, WIDTH, drawDoro, stageOf, startWalk, stepWalk, toCells, toSvg } from './doro'

const fill = atom({ plugin: 'doro-context', key: 'fill' } as const, null)

/** One animation frame; the terminal repaints doro in place this often. */
const TICK_MS = 150

// Keeps only the figures the band draws, leaving out the ones not reported yet.
const toFill = (context: SessionContextUsage): DoroFill => ({
  window: context.window,
  ...(context.tokens !== undefined && { tokens: context.tokens }),
  ...(context.percent !== undefined && { percent: context.percent }),
})

const refresh = async ($: EngineInterface) => {
  const { context } = await $.session.usage()
  await update($, fill, () => toFill(context))
}

const formatTokens = (n: number) =>
  n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`

export const register: Register = on => {
  // The band's picture as last drawn on the terminal, which the timer repaints.
  let band: { requestId: string; percent: number | undefined } | undefined
  let walk = startWalk()

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    $.clock.every(TICK_MS, () => {
      if (!band) return
      walk = stepWalk(walk, band.percent)
      void $.ui.blit({ requestId: band.requestId, key: 'doro', cells: toCells(drawDoro(band.percent, walk)) })
    })
    await refresh($)

    return started
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('context')) {
      await update($, fill, () => toFill(e.context))
    }

    return next(e)
  })

  // A compacted window reports no fill until its next response: doro is hungry again.
  on('session.compact', async ($, e, next) => {
    const compacted = await next(e)
    if (compacted.messages && e.agentId === undefined && e.trigger !== 'precompute') {
      await refresh($)
    }

    return compacted
  }).catch(($, e, next) => next(e))

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') {
      await update($, fill, last => last && { window: last.window })
    }

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) {
      return next(e)
    }

    const usage = await read($, fill)
    const percent = usage?.percent
    const stage = stageOf(percent)
    const sprite = drawDoro(percent, walk)
    const hasRoomForArt = e.props.bodyColumns >= WIDTH + 30
    if (e.surface === 'terminal') {
      band = hasRoomForArt ? { requestId: e.requestId, percent } : undefined
    }

    let art: RenderNode | null = null
    if (hasRoomForArt && e.surface === 'terminal') {
      const { Raster } = $.ui.resolve(e)
      art = <Raster key="doro" columns={WIDTH} rows={ROWS} cells={toCells(sprite)} />
    } else if (hasRoomForArt && e.surface === 'desktop') {
      const { Svg } = $.ui.resolve(e)
      art = <Svg source={toSvg(sprite)} alt={`doro, ${stage.caption}`} width={WIDTH * 4} height={ROWS * 8} />
    }

    const { Box, Text } = $.ui.resolve(e)
    const barWidth = Math.max(10, Math.min(30, e.props.bodyColumns - (art ? WIDTH : 0) - 12))
    const filled = Math.round((barWidth * Math.min(percent ?? 0, 100)) / 100)
    const isFull = percent !== undefined && percent >= 80
    const amount =
      usage?.tokens !== undefined
        ? `${formatTokens(usage.tokens)} / ${formatTokens(usage.window)} tokens`
        : usage
          ? `0 / ${formatTokens(usage.window)} tokens`
          : 'no reading yet'

    return (
      <Box flexDirection="row" alignItems="center">
        {art}
        <Box flexDirection="column" paddingLeft={art ? 2 : 0}>
          <Text>
            <Text color="claude" bold>
              doro
            </Text>
            <Text color={isFull ? 'warning' : undefined} dimColor={!isFull}>
              {' '}· {stage.caption}
            </Text>
          </Text>
          <Text>
            <Text color="claude">{'█'.repeat(filled)}</Text>
            <Text dimColor>{'░'.repeat(barWidth - filled)}</Text>
            <Text bold> {percent === undefined ? '--' : `${percent}%`}</Text>
          </Text>
          <Text dimColor>{amount}</Text>
        </Box>
      </Box>
    )
  })
}
