// Abe, the guide you chat with: a chibi Abraham Lincoln in 32×32 pixel art.
// To use your own art, return an <img> here with the same size and className.

// One letter per pixel. Letters map to the colors below.
const PIXELS = [
  '................................',
  '..........KKKKKKKKKKKK..........',
  '..........KAaaAAAAAAAK..........',
  '.........bKAaaAAAAAAAKb.........',
  '........bbKAaAAAAAAAAKbb........',
  '......bbbbKAaAAAAAAAAKbbbb......',
  '......bbbbKAaAAAAAAAAKbbbb......',
  '.....bbbbbKTttTTTTTTTKbbbbb.....',
  '....bbbbbbKTTTTTTTTTTKbbbbbb....',
  '....bbKAaaaaaAAAAAAAAAAAAKbb....',
  '...bbbbKKKKKKKKKKKKKKKKKKbbbb...',
  '...bbbbHHhssssssssssssHHHbbbb...',
  '...bbbbHHHHSSSSSSSSSSHHHHbbbb...',
  '...bbbbbhHSBBBSSSSBBBSHHbbbbb...',
  '...bbbbbzHSsssSSSSsssSHzbbbbb...',
  '...bbbbzSHSSwESSsSwESSHSzbbbb...',
  '...bbbbzSHSSEESSsSEESSHSzbbbb...',
  '...bbbbbsDDCSSSSsSSSCDDsbbbbb...',
  '...bbbbbDdDDSMSzzSSSDDDDbbbbb...',
  '...bbbbbDdDDDSnmmnSDdDDDbbbbb...',
  '....bbbbDDgDDDSSSSDDdDDDbbbb....',
  '....bbbbDDDdDDDgDDDDDDDDbbbb....',
  '.....bbbbKDdDDDgDdDgDdKbbbb.....',
  '......bbbbKDDdDDDdDDDKbbbb......',
  '......bbbbbDDdDDgDDDDbbbbb......',
  '........KKKKKDDDDDDKKKKK........',
  '.....KKKKJJYYYccccYYYJJKKKK.....',
  '...KKjjJJJJYYYYyyYYYYJJJJJKKK...',
  '..KKjjJJJJJYYLecccLYYJoJJJJJKK..',
  '..KjjJJJJJJJJLLccLLJJJOJJJJJJK..',
  '..KJJJJJJJJJJJLecLJJJJJJJJJJJK..',
  '..KJJJJJJJJJJJLccLJJJJJJJJJJJK..'
]

const COLORS: Record<string, string> = {
  '.': '#fde4d6', // background
  'b': '#fff1e7', // soft halo
  'K': '#1c1316', // outline
  'A': '#2d2428', // hat
  'a': '#4d4146', // hat shine
  'T': '#650030', // hat band, brand burgundy
  't': '#86193f', // band light
  'H': '#3a2820', // hair
  'h': '#52362a', // hair strands
  'S': '#f8d5bb', // skin
  's': '#ecb89a', // skin shadow
  'z': '#dc9f80', // deep shadow
  'B': '#33211b', // brows
  'E': '#2a1410', // eyes
  'w': '#d9d2cd', // soft eye glint
  'C': '#f2bfa6', // blush
  'M': '#9a6248', // mole
  'm': '#8e4a4f', // mouth
  'n': '#c07a72', // mouth corners
  'D': '#3a2820', // beard
  'd': '#5c4134', // beard strands
  'g': '#77706b', // gray strands
  'J': '#262025', // coat
  'j': '#3d353b', // coat light
  'L': '#38303a', // lapels
  'c': '#fff7f0', // shirt
  'e': '#ecdccf', // shirt shade
  'Y': '#141012', // bow tie
  'y': '#3a3236', // bow tie knot
  'O': '#ff7a47', // lapel pin, brand orange
  'o': '#ffc7a8' // pin shine
}

// Merge each row's runs of one color into a single rect.
const RECTS: { x: number; y: number; w: number; fill: string }[] = []
PIXELS.forEach((row, y) => {
  let x = 0
  while (x < row.length) {
    const c = row[x]
    let w = 1
    while (row[x + w] === c) w++
    RECTS.push({ x, y, w, fill: COLORS[c] })
    x += w
  }
})

export function Avatar({ size = 40, className, label }: { size?: number; className?: string; label?: string }) {
  return (
    <svg
      className={'avatar' + (className ? ' ' + className : '')} width={size} height={size} viewBox="0 0 32 32"
      shapeRendering="crispEdges" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}
    >
      {RECTS.map((r, i) => <rect key={i} x={r.x} y={r.y} width={r.w} height={1} fill={r.fill} />)}
    </svg>
  )
}
