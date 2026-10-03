// Abe in a few poses for the Basics form: the same head as Avatar.tsx on a small body.
// 48×48, transparent. Show at multiples of 48 (96, 144) so the pixels stay crisp.

export type PoseName = 'wave' | 'point' | 'think' | 'clipboard' | 'thumbs' | 'cheer'

// One letter per pixel, '.' is transparent. Letters map to the colors below.
const POSES: Record<PoseName, string[]> = {
  wave: [
    '................................................',
    '..................KKKKKKKKKKKK..................',
    '..................KAaaAAAAAAAK..................',
    '..................KAaaAAAAAAAK..................',
    '..................KAaAAAAAAAAK..................',
    '..................KAaAAAAAAAAK..................',
    '..................KAaAAAAAAAAK..................',
    '..................KTttTTTTTTTK..................',
    '..................KTTTTTTTTTTK.....O............',
    '..............KAaaaaaAAAAAAAAAAAAKO.............',
    '...............KKKKKKKKKKKKKKKKKK...............',
    '...............HHhssssssssssssHHH....z.z.z...O..',
    '...............HHHHSSSSSSSSSSHHHH...zSzSzSz...O.',
    '................hHSBBBSSSSBBBSHH....zSSSSSz.....',
    '................zHSsssSSSSsssSHz...zSSSSSSz.....',
    '...............zSHSSwESSsSwESSHSz..zzsSSSSz..O..',
    '...............zSHSSEESSsSEESSHSz....zSSSz....O.',
    '................sDDCSSSSsSSSCDDs.....KccK.......',
    '................DdDDSMSzzSSSDDDD....KrccK.......',
    '................DdDDDSnmmnSDdDDD....KrccK.......',
    '................DDgDDDSSSSDDdDDD....KrJJK.......',
    '................DDDdDDDgDDDDDDDD....KrJJK.......',
    '.................KDdDDDgDdDgDdK....KrJJJK.......',
    '..................KDDdDDDdDDDK.....KrJJK........',
    '...................DDdDDgDDDD.....KrJJJK........',
    '.....................DDDDDD......KrJJJJK........',
    '.............KKK.KKYYYccccYYYKK.KrJJJJK.........',
    '............KrrrKJJYYYYyyYYYYJJKrJJJJK..........',
    '............KrJJKrJYYLecccLYYJJKrJJJK...........',
    '............KrJJKrJJJLLccLLJoJJKrJJK............',
    '............KrJJKrJJJJLLLLJJOJJKKKK.............',
    '............KrJJKrJJJJJJKJJJJJJK................',
    '............KrJJKrJJJJJaKJJJJJJK................',
    '............KccJKrJJJJJJKJJJJJJK................',
    '............KccJKrJJJJJJKJJJJJJK................',
    '............zSSzKrJJJJJaKJJJJJJK................',
    '...........zSSSSzKrJJJJJKJJJJJK.................',
    '............zSSz.KrJJJJJKJJJJJK.................',
    '.............zz..KrJJJJQQJJJJJK.................',
    '.................KrJJJKPPKJJJJK.................',
    '.................KKKKKKQQKKKKKK.................',
    '..................QpPPQ..QpPPQ..................',
    '..................QpPPQ..QpPPQ..................',
    '..................QpPPQ..QpPPQ..................',
    '..................FfFF....FfFF..................',
    '.................FfFFFF..FfFFFF.................',
    '..................QQQQQ...QQQQQ.................',
    '................xxxxxxxxxxxxxxxx................'
  ],
  point: [
    '................................................',
    '..................KKKKKKKKKKKK..................',
    '..................KAaaAAAAAAAK..................',
    '..................KAaaAAAAAAAK..................',
    '..................KAaAAAAAAAAK..................',
    '..................KAaAAAAAAAAK..................',
    '..................KAaAAAAAAAAK..................',
    '..................KTttTTTTTTTK..................',
    '..................KTTTTTTTTTTK..................',
    '..............KAaaaaaAAAAAAAAAAAAK..............',
    '...............KKKKKKKKKKKKKKKKKK...............',
    '...............HHhssssssssssssHHH...............',
    '...............HHHHSSSSSSSSSSHHHH...............',
    '................hHSBBBSSSSBBBSHH................',
    '................zHSsssSSSSsssSHz................',
    '...............zSHSSwESSsSwESSHSz...............',
    '...............zSHSSEESSsSEESSHSz...............',
    '................sDDCSSSSsSSSCDDs................',
    '................DdDDSMSzzSSSDDDD................',
    '................DdDDDSnmmnSDdDDD................',
    '................DDgDDDSSSSDDdDDD................',
    '................DDDdDDDgDDDDDDDD................',
    '.................KDdDDDgDdDgDdK.................',
    '..................KDDdDDDdDDDK..................',
    '...................DDdDDgDDDD...................',
    '.....................DDDDDD.....................',
    '.............KKK.KKYYYccccYYYKK.KKKKKKKKKzz.....',
    '............KrrrKJJYYYYyyYYYYJJKrrrrrrrrrSSzzz..',
    '............KrJJKrJYYLecccLYYJJKrJJJJJJccSSSSSz.',
    '............KrJJKrJJJLLccLLJoJJKrJJJJJJccSSSz...',
    '............KrJJKrJJJJLLLLJJOJJKKKKKKrJJJSSz....',
    '............KrJJKrJJJJJJKJJJJJJK.....KKKKzz.....',
    '............KrJJKrJJJJJaKJJJJJJK................',
    '............KccJKrJJJJJJKJJJJJJK................',
    '............KccJKrJJJJJJKJJJJJJK................',
    '............zSSzKrJJJJJaKJJJJJJK................',
    '...........zSSSSzKrJJJJJKJJJJJK.................',
    '............zSSz.KrJJJJJKJJJJJK.................',
    '.............zz..KrJJJJQQJJJJJK.................',
    '.................KrJJJKPPKJJJJK.................',
    '.................KKKKKKQQKKKKKK.................',
    '..................QpPPQ..QpPPQ..................',
    '..................QpPPQ..QpPPQ..................',
    '..................QpPPQ..QpPPQ..................',
    '..................FfFF....FfFF..................',
    '.................FfFFFF..FfFFFF.................',
    '..................QQQQQ...QQQQQ.................',
    '................xxxxxxxxxxxxxxxx................'
  ],
  think: [
    '................................................',
    '..................KKKKKKKKKKKK..................',
    '..................KAaaAAAAAAAK............kk....',
    '..................KAaaAAAAAAAK...........kWWk...',
    '..................KAaAAAAAAAAK..........kWWWWk..',
    '..................KAaAAAAAAAAK.........kWWWWWWk.',
    '..................KAaAAAAAAAAK.........kWWWWWWk.',
    '..................KTttTTTTTTTK..........kWWWWk..',
    '..................KTTTTTTTTTTK...........kkkk...',
    '..............KAaaaaaAAAAAAAAAAAAK....kk........',
    '...............KKKKKKKKKKKKKKKKKK....kWWk.......',
    '...............HHhssssssssssssHHH....kWWk.......',
    '...............HHHHSSSSSSSSSSHHHH.....kk........',
    '................hHSBBBSSSSBBBSHH....k...........',
    '................zHSsssSSSSsssSHz...kWk..........',
    '...............zSHSSwESSsSwESSHSz...k...........',
    '...............zSHSSEESSsSEESSHSz...............',
    '................sDDCSSSSsSSSCDDs................',
    '................DdDDSMSzzSSSDDDD................',
    '................DdDDDSnmmnSDdDDD................',
    '................DDgDDDSSSSDDdDDD................',
    '................DDDdDDDgDDDDDDDD................',
    '.................KDzzzDgDdDgDdK.................',
    '..................zSSSzDDdDDDK..................',
    '..................zSSSzDgDDDD...................',
    '.................KcSSzDDDDD.....................',
    '.............KKKKrccJKccccYYYKK.KKK.............',
    '............KrrrKrccKYYyyYYYYJJKrrrK............',
    '............KrJJrJJJKLecccLYYJJKrJJK............',
    '............KrJJJJJKJLLccLLJoJJKrJJK............',
    '............KrJJJJJKJJLLLLJJOJJKrJJK............',
    '............KrJJJJKJJJJJKJJJJJJKrJJK............',
    '............KrJJJKJJJJJaKJJJJJJKrJJK............',
    '............KrJJJKJJJJJJKJJJJJJKrccK............',
    '.............KrJKrJJJJJJKJJJJJJKrccK............',
    '..............KKKrJJJJJaKJJJJJJKzSSz............',
    '.................KrJJJJJKJJJJJKzSSSSz...........',
    '.................KrJJJJJKJJJJJK.zSSz............',
    '.................KrJJJJQQJJJJJK..zz.............',
    '.................KrJJJKPPKJJJJK.................',
    '.................KKKKKKQQKKKKKK.................',
    '..................QpPPQ..QpPPQ..................',
    '..................QpPPQ..QpPPQ..................',
    '..................QpPPQ..QpPPQ..................',
    '..................FfFF....FfFF..................',
    '.................FfFFFF..FfFFFF.................',
    '..................QQQQQ...QQQQQ.................',
    '................xxxxxxxxxxxxxxxx................'
  ],
  clipboard: [
    '................................................',
    '..................KKKKKKKKKKKK..................',
    '..................KAaaAAAAAAAK..................',
    '..................KAaaAAAAAAAK..................',
    '..................KAaAAAAAAAAK..................',
    '..................KAaAAAAAAAAK..................',
    '..................KAaAAAAAAAAK..................',
    '..................KTttTTTTTTTK..................',
    '..................KTTTTTTTTTTK..................',
    '..............KAaaaaaAAAAAAAAAAAAK..............',
    '...............KKKKKKKKKKKKKKKKKK...............',
    '...............HHhssssssssssssHHH...............',
    '...............HHHHSSSSSSSSSSHHHH...............',
    '................hHSBBBSSSSBBBSHH................',
    '................zHSsssSSSSsssSHz................',
    '...............zSHSSwESSsSwESSHSz...............',
    '...............zSHSSEESSsSEESSHSz...............',
    '................sDDCSSSSsSSSCDDs................',
    '................DdDDSMSzzSSSDDDD................',
    '................DdDDDSnmmnSDdDDD................',
    '................DDgDDDSSSSDDdDDD................',
    '................DDDdDDDgDDDDDDDD................',
    '.................KDdDDDgDdDgDdK.................',
    '..................KDDdDDDdDDDK..................',
    '...................DDdDDgDDDD...................',
    '.....................DDDDDD.....................',
    '.............KKK.KKYYYcGGcYYYKK.KKK.............',
    '............KrrrKJJYYYGGGGYYYJJKrrrK............',
    '............KrJJKrJUUUGGGGUUUJJKrJJK............',
    '............KrJJKrJUcccOccccUzKKrJJK............',
    '............KrJJKrJUccccccccUScrJJJK............',
    '............KrJJKrJUceeeeeecSzcJJJJK............',
    '............KrJJrKzUccccccccSzcJJJJK............',
    '............KrJJccSUceeeeeecUzKKKKK.............',
    '.............KrJcczSccccccccUJJK................',
    '..............KKrczSceeeeeecUJJK................',
    '................KKzUccccccccUJK.................',
    '.................KrUceeeecccUJK.................',
    '.................KrUccccccccUJK.................',
    '.................KrUUUUUUUUUUJK.................',
    '.................KKKKKKQQKKKKKK.................',
    '..................QpPPQ..QpPPQ..................',
    '..................QpPPQ..QpPPQ..................',
    '..................QpPPQ..QpPPQ..................',
    '..................FfFF....FfFF..................',
    '.................FfFFFF..FfFFFF.................',
    '..................QQQQQ...QQQQQ.................',
    '................xxxxxxxxxxxxxxxx................'
  ],
  thumbs: [
    '................................................',
    '..................KKKKKKKKKKKK..................',
    '..................KAaaAAAAAAAK..................',
    '..................KAaaAAAAAAAK..................',
    '..................KAaAAAAAAAAK..................',
    '..................KAaAAAAAAAAK..................',
    '..................KAaAAAAAAAAK..................',
    '..................KTttTTTTTTTK..................',
    '..................KTTTTTTTTTTK..................',
    '..............KAaaaaaAAAAAAAAAAAAK..............',
    '...............KKKKKKKKKKKKKKKKKK...............',
    '...............HHhssssssssssssHHH...............',
    '...............HHHHSSSSSSSSSSHHHH...............',
    '................hHSBBBSSSSBBBSHH................',
    '................zHSsssSSSSsssSHz................',
    '...............zSHSSwESSsSEESSHSz...............',
    '...............zSHSSEESSsESSESHSz...............',
    '................sDDCSSSSsSSSCDDs................',
    '................DdDDSMSzzSSSDDDD................',
    '................DdDDDSnmmnSDdDDD................',
    '................DDgDDDSSSSDDdDDD................',
    '................DDDdDDDgDDDDDDDD...........V....',
    '.................KDdDDDgDdDgDdK............V....',
    '..................KDDdDDDdDDDK...........VVWVV..',
    '...................DDdDDgDDDD........zz....V....',
    '.....................DDDDDD.........zSSz...V....',
    '.............KKK.KKYYYccccYYYKK.KKK.zSSz........',
    '............KrrrKJJYYYYyyYYYYJJKrrrKzSSzzz......',
    '............KrJJKrJYYLecccLYYJJKrJJKzSSSSSz.....',
    '............KrJJKrJJJLLccLLJoJJKrJJrzsSsSSz.....',
    '............KrJJKrJJJJLLLLJJOJJKKrJJzSSSSSz.....',
    '............KrJJKrJJJJJJKJJJJJJKKrJJrzzzzz......',
    '............KrJJKrJJJJJaKJJJJJJK.KrJJccK........',
    '............KccJKrJJJJJJKJJJJJJK..KrJJK.........',
    '............KccJKrJJJJJJKJJJJJJK...KKK..........',
    '............zSSzKrJJJJJaKJJJJJJK................',
    '...........zSSSSzKrJJJJJKJJJJJK.................',
    '............zSSz.KrJJJJJKJJJJJK.................',
    '.............zz..KrJJJJQQJJJJJK.................',
    '.................KrJJJKPPKJJJJK.................',
    '.................KKKKKKQQKKKKKK.................',
    '..................QpPPQ..QpPPQ..................',
    '..................QpPPQ..QpPPQ..................',
    '..................QpPPQ..QpPPQ..................',
    '..................FfFF....FfFF..................',
    '.................FfFFFF..FfFFFF.................',
    '..................QQQQQ...QQQQQ.................',
    '................xxxxxxxxxxxxxxxx................'
  ],
  cheer: [
    '................................................',
    '..................KKKKKKKKKKKK..........O.......',
    '..................KAaaAAAAAAAK..................',
    '..............T...KAaaAAAAAAAK...VV.............',
    '..............T...KAaAAAAAAAAK..................',
    '..................KAaAAAAAAAAK..................',
    '.....OO...........KAaAAAAAAAAK............T.....',
    '..................KTttTTTTTTTK.............T....',
    '..................KTTTTTTTTTTK..................',
    '..............KAaaaaaAAAAAAAAAAAAK..............',
    '...............KKKKKKKKKKKKKKKKKK...............',
    '...............HHhssssssssssssHHH...............',
    '...V...........HHHHSSSSSSSSSSHHHH............O..',
    '........zzz.....hHSBBBSSSSBBBSHH.....zzz.....O..',
    '.......zSSSz....zHSsssSSSSsssSHz....zSSSz.......',
    '.......zSSSz...zSHSSEESSsSEESSHSz...zSSSz.......',
    '.......zSSSz...zSHSESSESsESSESHSz...zSSSz.......',
    '.......KcccK....sDDCSSSSsSSSCDDs....KcccK.......',
    '.......KcccK....DdDDSMSzzSSSDDDD....KcccK.......',
    '.......KrJJrK...DdDDDSmmmmSDdDDD...KrJJJK.......',
    '....V...KrJJK...DDgDDDSqqSDDdDDD...KrJJK....O...',
    '...VVV..KrJJK...DDDdDDDgDDDDDDDD...KrJJK...OOO..',
    '....V...KrJJK....KDdDDDgDdDgDdK....KrJJK....O...',
    '.........KrJrK....KDDdDDDdDDDK....KrJJK.........',
    '.........KrJJrK....DDdDDgDDDD....KrJJJK.........',
    '..........KrJJK......DDDDDD......KrJJK..........',
    '..........KrJJrK.KKYYYccccYYYKK.KrJJJK..........',
    '...........KrJJrKJJYYYYyyYYYYJJKrJJJK...........',
    '............KrJJKrJYYLecccLYYJJKrJJK............',
    '............KrJJKrJJJLLccLLJoJJKrJJK............',
    '.............KKKKrJJJJLLLLJJOJJKKKK.............',
    '................KrJJJJJJKJJJJJJK................',
    '................KrJJJJJaKJJJJJJK................',
    '................KrJJJJJJKJJJJJJK................',
    '................KrJJJJJJKJJJJJJK................',
    '................KrJJJJJaKJJJJJJK................',
    '.................KrJJJJJKJJJJJK.................',
    '.................KrJJJJJKJJJJJK.................',
    '.................KrJJJJQQJJJJJK.................',
    '.................KrJJJKPPKJJJJK.................',
    '.................KKKKKKQQKKKKKK.................',
    '..................QpPPQ..QpPPQ..................',
    '..................QpPPQ..QpPPQ..................',
    '..................QpPPQ..QpPPQ..................',
    '..................FfFF....FfFF..................',
    '.................FfFFFF..FfFFFF.................',
    '..................QQQQQ...QQQQQ.................',
    '................xxxxxxxxxxxxxxxx................'
  ]
}

const COLORS: Record<string, string> = {
  'A': '#2d2428', // hat
  'B': '#33211b', // brows
  'C': '#f2bfa6', // blush
  'D': '#3a2820', // beard
  'E': '#2a1410', // eyes
  'F': '#1f171b', // boots
  'G': '#8a94a3', // clipboard clip
  'H': '#3a2820', // hair
  'J': '#262025', // coat
  'K': '#1c1316', // outline
  'L': '#38303a', // lapels
  'M': '#9a6248', // mole
  'O': '#ff7a47', // lapel pin and accents, brand orange
  'P': '#3a3540', // trousers
  'Q': '#17111a', // trousers and sole outline
  'S': '#f8d5bb', // skin
  'T': '#650030', // hat band, brand burgundy
  'U': '#9a6a44', // clipboard
  'V': '#ffb43c', // sparkle
  'W': '#ffffff', // white
  'Y': '#141012', // bow tie
  'a': '#4d4146', // hat shine, buttons
  'c': '#fff7f0', // shirt, cuffs, paper
  'd': '#5c4134', // beard strands
  'e': '#ecdccf', // shirt shade, paper lines
  'f': '#4a3e44', // boot shine
  'g': '#77706b', // gray strands
  'h': '#52362a', // hair strands
  'k': '#d993a8', // thought bubble outline
  'm': '#8e4a4f', // mouth
  'n': '#c07a72', // mouth corners
  'o': '#ffc7a8', // pin shine
  'p': '#4f4858', // trousers light
  'q': '#b8405e', // open mouth
  'r': '#4f4655', // coat and sleeve light
  's': '#ecb89a', // skin shadow
  't': '#86193f', // band light
  'w': '#d9d2cd', // soft eye glint
  'x': 'rgba(60, 20, 30, 0.16)', // ground shadow
  'y': '#3a3236', // bow tie knot
  'z': '#dc9f80' // deep shadow, outlines on skin
}

// Merge each row's runs of one color into a single rect.
function toRects(rows: string[]) {
  const rects: { x: number; y: number; w: number; fill: string }[] = []
  rows.forEach((row, y) => {
    let x = 0
    while (x < row.length) {
      const c = row[x]
      let w = 1
      while (row[x + w] === c) w++
      if (c !== '.') rects.push({ x, y, w, fill: COLORS[c] })
      x += w
    }
  })
  return rects
}

const RECTS = Object.fromEntries(Object.entries(POSES).map(([name, rows]) => [name, toRects(rows)])) as Record<PoseName, ReturnType<typeof toRects>>

export function GuidePose({ name, size = 144, className }: { name: PoseName; size?: number; className?: string }) {
  return (
    <svg
      className={'guide-pose guide-pose--' + name + (className ? ' ' + className : '')} width={size} height={size} viewBox="0 0 48 48"
      shapeRendering="crispEdges" aria-hidden="true"
    >
      {RECTS[name].map((r, i) => <rect key={i} x={r.x} y={r.y} width={r.w} height={1} fill={r.fill} />)}
    </svg>
  )
}
