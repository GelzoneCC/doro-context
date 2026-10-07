// Doro, drawn the way Clawd is: flat colors, no outline, built from quadrant
// blocks (four pixels to a cell, two across and two down). One character of
// the art is one of those pixels. A cell shows two colors, so every feature
// sits on whole cells: two columns wide, starting on an even column, and
// within one of the row pairs 0-1, 2-3, 4-5, 6-7, 8-9.

const COLORS: Record<string, number> = {
  H: 0xf4a6c4, // hair
  F: 0xfaf9f5, // face and body (Claude ivory)
  E: 0x7e4fa0, // eyes
  B: 0xf7c3d2, // blush
  M: 0x5a3b46, // mouth
  R: 0xb48ad8, // ribbon
  O: 0xd97757, // tangerine (Claude orange)
  D: 0x8ec5ff, // sweat drop
}

// Front view, rows 0-6 of the strip; the mouth's second row and the body
// below are drawn per stage.
const HEAD = [
  '.......HHHHHHHHHHHHH..HHHH..',
  '...HHHHHHHHHHHHHHHHHHHHHHHRR',
  '..HHHHHHHHHHHHHHHHHHHHHHHHRR',
  '..HHHHFFFFFFFHHFFFFFFFHHHH..',
  '..HHHHFFFFFFFFFFFFFFFFHHHH..',
  '..HHHHBBFFFFFFFFFFFFBBHHHH..',
  '..HHHHFFFFFFFFFFFFFFFFHHHH..',
]

const EYES = {
  open: ['FEEE', 'EEEE'],
  happy: ['.EE.', 'E..E'],
  sleepy: ['....', 'EEEE'],
  strain: ['EE..', '..EE'],
}

const MOUTHS = {
  small: ['.MM.', '....'],
  tangerine: ['.OO.', 'OOOO'],
  omega: ['M..M', '.MM.'],
  flat: ['MMMM', '....'],
  clenched: ['.MM.', 'M..M'],
}

/** The Raster's size: the strip doro walks along, in cells. */
export const WIDTH = 34
export const ROWS = 5

/** The same strip in pixels: two across and two down in every cell. */
const PIXELS_ACROSS = WIDTH * 2
const PIXELS_DOWN = ROWS * 2

/** Doro's own width in pixels, room for her fullest belly included. */
const SPRITE_WIDTH = 40
/** Where the head sits in it, and the column her middle falls between. */
const HEAD_X = 6
const MIDDLE = HEAD_X + 14

export type Stage = {
  from: number
  caption: string
  eyes: keyof typeof EYES
  mouth: keyof typeof MOUTHS
  isSweating: boolean
  /** Ticks per cell walked; 0 stays put. */
  walkEvery: number
  /** Ticks per half breath. */
  breathEvery: number
}

export const STAGES: Stage[] = [
  { from: 0, caption: 'hungry, waiting for tokens', eyes: 'open', mouth: 'small', isSweating: false, walkEvery: 2, breathEvery: 6 },
  { from: 10, caption: 'snacking on tokens', eyes: 'open', mouth: 'tangerine', isSweating: false, walkEvery: 2, breathEvery: 6 },
  { from: 35, caption: 'munching happily', eyes: 'happy', mouth: 'omega', isSweating: false, walkEvery: 3, breathEvery: 7 },
  { from: 60, caption: 'getting stuffed', eyes: 'sleepy', mouth: 'flat', isSweating: false, walkEvery: 5, breathEvery: 8 },
  { from: 80, caption: 'about to pop, time to /compact', eyes: 'strain', mouth: 'clenched', isSweating: true, walkEvery: 0, breathEvery: 2 },
]

export function stageOf(percent: number | undefined): Stage {
  const p = percent ?? 0
  return STAGES.findLast(stage => p >= stage.from) ?? STAGES[0]!
}

const fillOf = (percent: number | undefined) => Math.min(Math.max(percent ?? 0, 0), 100) / 100

/** Where doro is on her walk, `x` in cells; `tick` counts every frame since she set off. */
export type Walk = { x: number; dir: -1 | 1; rest: number; tick: number }

const REST_TICKS = 14
const ROOM = (PIXELS_ACROSS - SPRITE_WIDTH) / 2

export const startWalk = (): Walk => ({ x: 0, dir: 1, rest: REST_TICKS, tick: 0 })

/** One frame on: a cell along every `walkEvery` ticks, turning and resting at each end. */
export function stepWalk(walk: Walk, percent: number | undefined): Walk {
  const stage = stageOf(percent)
  const tick = walk.tick + 1
  const x = Math.min(walk.x, ROOM)

  if (walk.rest > 0 || stage.walkEvery === 0) {
    return { ...walk, x, tick, rest: Math.max(0, walk.rest - 1) }
  }
  if (tick % stage.walkEvery !== 0) {
    return { ...walk, x, tick }
  }
  const next = x + walk.dir
  if (next < 0 || next > ROOM) {
    return { x, dir: walk.dir === 1 ? -1 : 1, rest: REST_TICKS, tick }
  }
  return { ...walk, x: next, tick }
}

/** Rows of 0xRRGGBB colors, `undefined` where the pixel is clear. */
export type Sprite = (number | undefined)[][]

export function drawDoro(percent: number | undefined, walk: Walk): Sprite {
  const stage = stageOf(percent)
  const fill = fillOf(percent)
  const isWalking = walk.rest === 0 && stage.walkEvery > 0
  const isInhaling = Math.floor(walk.tick / stage.breathEvery) % 2 === 1

  const canvas = Array.from({ length: PIXELS_DOWN }, () => Array<string>(PIXELS_ACROSS).fill('.'))
  const left = 2 * walk.x
  const at = (x: number, y: number) => canvas[y]?.[left + x]
  const put = (x: number, y: number, ch: string) => {
    const row = canvas[y]
    if (row && left + x >= 0 && left + x < PIXELS_ACROSS) row[left + x] = ch
  }
  // `under` fills the '.' of a stamp; without it they stay see-through.
  const stamp = (rows: string[], x: number, y: number, under?: string) =>
    rows.forEach((row, j) =>
      [...row].forEach((ch, i) => {
        if (ch !== '.' || under) put(x + i, y + j, ch === '.' ? under! : ch)
      }),
    )

  stamp(HEAD, HEAD_X, 0)
  // The right eye is the left one mirrored.
  const eye = EYES[stage.eyes]
  stamp(eye, HEAD_X + 8, 4, 'F')
  stamp(eye.map(row => [...row].reverse().join('')), HEAD_X + 16, 4, 'F')
  stamp(MOUTHS[stage.mouth], HEAD_X + 12, 6, 'F')
  if (stage.isSweating) stamp(['.D', 'DD'], HEAD_X, 2)

  // The belly behind her: wider and taller the fuller the window, a cell
  // wider on each breath in. Its edges stay on whole cells; a top corner
  // rounds off only where nothing sits above it.
  const half = 8 + 2 * Math.round(5 * fill) + (isInhaling ? 2 : 0)
  const top = 7 - Math.round(2 * fill) - (isInhaling ? 1 : 0)
  for (let y = top; y <= 8; y++) {
    for (let x = MIDDLE - half; x < MIDDLE + half; x++) {
      const isCorner = y === top && (x === MIDDLE - half || x === MIDDLE + half - 1)
      if (at(x, y) === '.' && !(isCorner && at(x, y - 1) === '.')) put(x, y, 'F')
    }
  }
  // Clawd's stubby legs under it, shuffling a pixel with every step.
  const shuffle = isWalking && walk.x % 2 === 1 ? 1 : 0
  for (const x of [MIDDLE - 8, MIDDLE - 4, MIDDLE + 3, MIDDLE + 7]) put(x + shuffle, 9, 'F')

  return canvas.map(row => row.map(ch => COLORS[ch]))
}

// The quadrant blocks, indexed by which pixels of the cell take the
// foreground: 1 top left, 2 top right, 4 bottom left, 8 bottom right.
const QUADRANTS = [
  0x20, 0x2598, 0x259d, 0x2580, 0x2596, 0x258c, 0x259e, 0x259b,
  0x2597, 0x259a, 0x2590, 0x259c, 0x2584, 0x2599, 0x259f, 0x2588,
]
const DEFAULT_COLOR = 0x01000000

/** One cell from its four pixels (top left, top right, bottom left, bottom right). */
function toCell(pixels: (number | undefined)[]): number[] {
  const [fg, bg] = [...new Set(pixels)].sort((a, b) => (a === undefined ? 1 : b === undefined ? -1 : 0))
  if (fg === undefined) return [QUADRANTS[0]!, DEFAULT_COLOR, DEFAULT_COLOR]
  const mask = pixels.reduce<number>((bits, p, i) => (p === fg ? bits | (1 << i) : bits), 0)
  return [QUADRANTS[mask]!, fg, bg ?? DEFAULT_COLOR]
}

/** The sprite as a terminal Raster's `cells`. */
export function toCells(sprite: Sprite): string {
  const words = new Uint32Array(WIDTH * ROWS * 3)
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < WIDTH; c++) {
      const [upper, lower] = [sprite[2 * r], sprite[2 * r + 1]]
      const pixels = [upper?.[2 * c], upper?.[2 * c + 1], lower?.[2 * c], lower?.[2 * c + 1]]
      words.set(toCell(pixels), (r * WIDTH + c) * 3)
    }
  }
  let text = ''
  for (const byte of new Uint8Array(words.buffer)) text += String.fromCharCode(byte)
  return btoa(text)
}

/** The sprite as an SVG of half-width pixels, for surfaces that draw Svg. */
export function toSvg(sprite: Sprite): string {
  const rects = sprite.flatMap((row, y) =>
    row.flatMap((color, x) =>
      color === undefined
        ? []
        : [`<rect x="${x}" y="${2 * y}" width="1" height="2" fill="#${color.toString(16).padStart(6, '0')}"/>`],
    ),
  )
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PIXELS_ACROSS} ${2 * PIXELS_DOWN}" shape-rendering="crispEdges">${rects.join('')}</svg>`
}
