// Small pixel-art props for Abe's scenes, in the same palette as his poses.
// Each pixel is drawn at --px (set in CSS), so props stay crisp at any scale.
import type { CSSProperties } from 'react'
import { toRects } from './pixels.ts'

export type PropName = 'house' | 'tree' | 'coins' | 'piggy' | 'family' | 'sun' | 'cloud' | 'plant' | 'receipt' | 'spark' | 'heart'

const SPRITES: Record<PropName, string[]> = {
  house: [
    '.......K.......',
    '......KTK......',
    '.....KTtTK.....',
    '....KTTtTTK....',
    '...KTTTtTTTK...',
    '..KTTTTtTTTTK..',
    '.KTTTTTtTTTTTK.',
    'KKKKKKKKKKKKKKK',
    '.KcccccccccccK.',
    '.KcKKKcccKKKcK.',
    '.KcKuKcccKvKcK.',
    '.KcKKKcccKvKcK.',
    '.KcccccccKvKcK.',
    '.KKKKKKKKKKKKK.'
  ],
  tree: [
    '...KKKKK...',
    '.KKbbbbbKK.',
    'KbbbbbbbbiK',
    'KbbbbbbbiiK',
    'KbbbbbbbbiK',
    'KibbbbbbiiK',
    '.KiibbbiiK.',
    '..KKiiiKK..',
    '....KvK....',
    '....KvK....',
    '....KvK....',
    '...KKvKK...'
  ],
  coins: [
    '.KKKKKKK.',
    'KlNNNNNNK',
    'KIIIIIIIK',
    '.KKKKKKK.',
    'KlNNNNNNK',
    'KIIIIIIIK',
    '.KKKKKKK.',
    'KlNNNNNNK',
    'KIIIIIIIK',
    '.KKKKKKK.'
  ],
  piggy: [
    '...K..KKKKK...',
    '..KZKKZZZZZKK.',
    '.KZZZZZZZZZZZK',
    'KZZEZZZZZZZZZK',
    'KXXZZZZZZZZZZK',
    'KXXZZZZZZZZZZK',
    '.KZZZZZZZZZZK.',
    '..KZKKKKKKZK..',
    '..KK......KK..'
  ],
  family: [
    '.KKK.......KKK.',
    'KSSSK.....KSSSK',
    'KSSSK.KKK.KSSSK',
    '.KKK.KSSSK.KKK.',
    'KXXXKKSSSKKRRRK',
    'KXXXK.KKK.KRRRK',
    'KXXXKKOOOKKRRRK',
    'KXXXKKOOOKKRRRK',
    '.KKK.KOOOK.KKK.',
    '.K.K..K.K..K.K.',
    '.K.K..K.K..K.K.'
  ],
  sun: [
    '.....V.....',
    '.V...V...V.',
    '..V.NNN.V..',
    '...NNNNN...',
    '..NNlNNNN..',
    'VVNNNNNNNVV',
    '..NNNNNNI..',
    '...NNNNI...',
    '..V.NII.V..',
    '.V...V...V.',
    '.....V.....'
  ],
  cloud: [
    '......eeee......',
    '....eeWWWWee....',
    '..eeWWWWWWWWeee.',
    '.eWWWWWWWWWWWWWe',
    'eWWWWWWWWWWWWWWe',
    '.eeeeeeeeeeeeee.'
  ],
  plant: [
    '...K.K...',
    '..KbKbK..',
    '.KbbKbbK.',
    '.KbiKibK.',
    '..KKbKK..',
    '...KbK...',
    '.KKKKKKK.',
    '.KvjjjvK.',
    '..KvjvK..',
    '..KKKKK..'
  ],
  receipt: [
    'KKKKKKKKK',
    'KcccccccK',
    'KceeeeccK',
    'KcccccccK',
    'KceeecccK',
    'KcccccccK',
    'KceeeeecK',
    'KcccccccK',
    'KcccTTTcK',
    'KcccccccK',
    'KcKcKcKcK',
    '.K.K.K.K.'
  ],
  spark: [
    '..V..',
    '..V..',
    'VVWVV',
    '..V..',
    '..V..'
  ],
  heart: [
    '..KKK...KKK..',
    '.KXXXK.KXXXK.',
    'KXZZXXKXXXXXK',
    'KXZXXXXXXXXXK',
    'KXXXXXXXXXXXK',
    '.KXXXXXXXXXK.',
    '..KXXXXXXXK..',
    '...KXXXXXK...',
    '....KXXXK....',
    '.....KXK.....',
    '......K......'
  ]
}

const RECTS = Object.fromEntries(Object.entries(SPRITES).map(([n, rows]) => [n, toRects(rows)])) as Record<PropName, ReturnType<typeof toRects>>

export function Prop({ name, className, style }: { name: PropName; className?: string; style?: CSSProperties }) {
  const rows = SPRITES[name]
  const w = rows[0].length, h = rows.length
  return (
    <svg
      className={'prop prop--' + name + (className ? ' ' + className : '')} viewBox={`0 0 ${w} ${h}`}
      style={{ ['--w' as string]: w, ['--h' as string]: h, ...style }} shapeRendering="crispEdges" aria-hidden="true"
    >
      {RECTS[name].map((r, i) => <rect key={i} x={r.x} y={r.y} width={r.w} height={1} fill={r.fill} />)}
    </svg>
  )
}
