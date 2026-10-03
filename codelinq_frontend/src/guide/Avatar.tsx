// Pip, the guide you chat with: a 32×32 pixel-art placeholder.
// To use your own art, return an <img> here with the same size and className.

// One letter per pixel. Letters map to the colors below.
const PIXELS = [
  '................................',
  '............bbbbbbbb............',
  '.........bbbKKKKKKKKbbb.........',
  '........bbKHHhhhhhHHHKbb........',
  '......bbbKHggghhhhhHHHKbbb......',
  '.....bbbKHgghhhhHHHHHHHKbbb.....',
  '.....bbKHgHHHHHHHHHHHHHHKbb.....',
  '....bbbKhHHHHHHHHHHHHHHHKbbb....',
  '...bbbKHHHHHHHHHHHHHHHHHHKbbb...',
  '...bbbKHHHHSShHHHHHHHHHHHKbbb...',
  '...bbKHHHHSSsshhhHHHHHHHHKKbb...',
  '..bbbKHHHHSSSSssshhhHHHHHKKbbb..',
  '..bbbKKHHHSBBBSSSsBBhhHHHKKbbb..',
  '..bbbKKHHHSSSSSSSSSSSsHHHKKbbb..',
  '..bbbKKHhHSzEESSSSEEzsHHHKKbbb..',
  '..bbbKKHhHSSWESSSSWESsHhHKKbbb..',
  '..bbbKKHhHSSEISSSSEISsHhHKKbbb..',
  '..bbbKKHhHSCCSSSsSSCCsHhHKKbbb..',
  '..bbbKKHHHSSSSSSzSSSSsHhHKKbbb..',
  '...bbKKHHHHSSSmSSmSSsHHHHKKbb...',
  '...bbKKHhHHSSSSmmSSSsHHHHKKbb...',
  '...bbKKHhHHHSSSSSSSsHHHhHKKbb...',
  '....bKKHhHHHHSSSSssHHHHhHKKb....',
  '.....KKHhHHHHHssssHHHHHhHKK.....',
  '.....KKHHHHHHHSSSsHHHHHHHKK.....',
  '......KHhHTTteSSSscdTTHHHK......',
  '.....dKHHHTTteyccycdTTHhHKd.....',
  '...dTtTKHHTTTteoOcdTTTHHKTdTd...',
  '..dTTtTKHTTTTteOOcdTTTTHKTdTTd..',
  '.dTTTTtTTTTTTTtecdTTTTTTTdTTTTd.',
  '.dTTTTtTTTTTTTtTTdTTTTTTTdTTTTd.',
  '.dTTTTTtTTTTTTtTTdTTTTTTdTTTTTd.'
]

const COLORS: Record<string, string> = {
  '.': '#fde4d6', // background
  'b': '#fff1e7', // soft halo
  'K': '#2e1814', // hair outline
  'H': '#4f2a20', // hair
  'h': '#6e3c2c', // hair strands
  'g': '#a0623f', // hair shine
  'S': '#f8d5bb', // skin
  's': '#ecb89a', // skin shadow
  'z': '#dc9f80', // deep shadow, lashes
  'E': '#2a1410', // eyes
  'I': '#7a4630', // iris
  'W': '#ffffff', // eye glint
  'B': '#7a4632', // brows
  'C': '#f4a493', // blush
  'm': '#a23e55', // smile line
  'T': '#650030', // cardigan, brand burgundy
  't': '#86193f', // cardigan light
  'd': '#480022', // cardigan shade
  'c': '#fff7f0', // blouse
  'e': '#ecdccf', // blouse shade
  'O': '#ff7a47', // pendant, brand orange
  'o': '#ffc7a8', // pendant shine
  'y': '#e9b98f' // chain
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
