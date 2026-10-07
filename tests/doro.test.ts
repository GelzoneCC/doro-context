import { expect, mock, test } from 'claude-code/testing'

import { WIDTH, drawDoro, startWalk, stageOf, stepWalk } from '../hooks/doro'
import type { Walk } from '../hooks/doro'

const run = (percent: number | undefined, ticks: number) => {
  const seen: Walk[] = []
  let walk = startWalk()
  for (let i = 0; i < ticks; i++) seen.push((walk = stepWalk(walk, percent)))
  return seen
}

const BAND = {
  plugin: 'doro-context',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 20,
    bodyColumns: 100,
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

test('stages follow the fill', () => {
  expect(stageOf(undefined).caption).toBe('hungry, waiting for tokens')
  expect(stageOf(9).caption).toBe('hungry, waiting for tokens')
  expect(stageOf(10).caption).toBe('snacking on tokens')
  expect(stageOf(50).caption).toBe('munching happily')
  expect(stageOf(79).caption).toBe('getting stuffed')
  expect(stageOf(80).caption).toBe('about to pop, time to /compact')
  expect(stageOf(140).caption).toBe('about to pop, time to /compact')
})

test('doro walks to the end of the strip, rests, and walks back', () => {
  const seen = run(20, 400)
  const farthest = Math.max(...seen.map(walk => walk.x))
  expect(farthest).toBeGreaterThan(10)
  expect(farthest).toBeLessThan(WIDTH)
  expect(Math.min(...seen.map(walk => walk.x))).toBe(0)
  const turned = seen.findIndex(walk => walk.dir === -1)
  expect(seen[turned]?.rest).toBeGreaterThan(0)
  expect(seen.slice(seen.findIndex(walk => walk.x === farthest)).some(walk => walk.x === 0)).toBe(true)
})

test('a stuffed doro walks slower and a bursting one stays put', () => {
  const distance = (percent: number) => run(percent, 60).filter((walk, i, all) => i > 0 && walk.x !== all[i - 1]!.x).length
  expect(distance(70)).toBeLessThan(distance(20))
  expect(distance(90)).toBe(0)
})

test('no cell of any frame needs more than the two colors a cell can show', () => {
  for (const percent of [undefined, 5, 20, 45, 70, 90, 100]) {
    let walk = startWalk()
    for (let tick = 0; tick < 120; tick++) {
      const sprite = drawDoro(percent, walk)
      for (let y = 0; y < sprite.length; y += 2) {
        for (let x = 0; x < sprite[0]!.length; x += 2) {
          const colors = new Set([sprite[y]![x], sprite[y]![x + 1], sprite[y + 1]![x], sprite[y + 1]![x + 1]])
          expect(colors.size).toBeLessThan(3)
        }
      }
      walk = stepWalk(walk, percent)
    }
  }
})

test('the band repaints doro on a timer once it is drawn', async ($, on) => {
  const clock = mock.clock(on)
  const frames: string[] = []
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200_000 }, rateLimits: [] } }))
  on('ui.blit', ($, e) => {
    if ('cells' in e) frames.push(e.cells)
    return { value: {} }
  })

  await $.session.start({ cwd: '.', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await clock.advance(150 * 40)

  expect(frames.length).toBeGreaterThan(30)
  expect(new Set(frames).size).toBeGreaterThan(2)
  await ui.unmount()
})

test('the band shows a hungry doro before any reading', async $ => {
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ type: 'Text', text: /hungry/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'no reading yet' })).toBeDefined()
    await ui.unmount()
  }
})

test('a measurement fills the bar and grows doro', async ($, on) => {
  on('session.measure', ($, e) => ({ changed: e.changed }))
  await $.session.measure({
    context: { tokens: 170_000, window: 200_000, percent: 85 },
    rateLimits: [],
    changed: ['context'],
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ type: 'Text', text: '85%' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /time to \/compact/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '170k / 200k tokens' })).toBeDefined()
    expect(await ui.find({ type: surface === 'terminal' ? 'Raster' : 'Svg' })).toBeDefined()
    await ui.unmount()
  }
})

test('a narrow band drops the picture and keeps the numbers', async ($, on) => {
  on('session.measure', ($, e) => ({ changed: e.changed }))
  await $.session.measure({
    context: { tokens: 40_000, window: 1_000_000, percent: 4 },
    rateLimits: [],
    changed: ['context'],
  })

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, bodyColumns: 50 } })
  expect(await ui.find({ type: 'Raster' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: '40k / 1M tokens' })).toBeDefined()
  await ui.unmount()
})
