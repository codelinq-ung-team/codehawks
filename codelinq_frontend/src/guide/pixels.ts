// The shared palette and drawing helper for Abe's pixel art (poses and props).

export const COLORS: Record<string, string> = {
  'A': '#2d2428', // hat
  'B': '#33211b', // brows
  'C': '#f2bfa6', // blush
  'D': '#3a2820', // beard
  'E': '#2a1410', // eyes
  'F': '#1f171b', // boots
  'G': '#8a94a3', // clipboard clip
  'I': '#c47f12', // gold dark
  'H': '#3a2820', // hair
  'J': '#262025', // coat
  'K': '#1c1316', // outline
  'L': '#38303a', // lapels
  'M': '#9a6248', // mole
  'N': '#f2b33d', // gold
  'O': '#ff7a47', // lapel pin and accents, brand orange
  'P': '#3a3540', // trousers
  'Q': '#17111a', // trousers and sole outline
  'R': '#00849b', // teal (umbrella, matches the "already have" chart color)
  'S': '#f8d5bb', // skin
  'T': '#650030', // hat band, brand burgundy
  'U': '#9a6a44', // clipboard
  'V': '#ffb43c', // sparkle
  'W': '#ffffff', // white
  'X': '#9b2d5a', // berry (heart, matches the "would need" chart color)
  'Y': '#141012', // bow tie
  'Z': '#f4a9bf', // pink
  'a': '#4d4146', // hat shine, buttons
  'b': '#7bb661', // leaf
  'c': '#fff7f0', // shirt, cuffs, paper
  'd': '#5c4134', // beard strands
  'e': '#ecdccf', // shirt shade, paper lines
  'f': '#4a3e44', // boot shine
  'g': '#77706b', // gray strands
  'h': '#52362a', // hair strands
  'i': '#4a8a3a', // leaf dark
  'j': '#c08552', // wood light
  'k': '#d993a8', // thought bubble outline
  'l': '#ffe08a', // gold light
  'm': '#8e4a4f', // mouth
  'n': '#c07a72', // mouth corners
  'o': '#ffc7a8', // pin shine
  'p': '#4f4858', // trousers light
  'q': '#b8405e', // open mouth
  'r': '#4f4655', // coat and sleeve light
  's': '#ecb89a', // skin shadow
  't': '#86193f', // band light
  'u': '#5cc3d1', // teal light
  'v': '#8a5a33', // wood
  'w': '#d9d2cd', // soft eye glint
  'x': 'rgba(60, 20, 30, 0.16)', // ground shadow
  'y': '#3a3236', // bow tie knot
  'z': '#dc9f80' // deep shadow, outlines on skin
}

// Merge each row's runs of one color into a single rect.
export function toRects(rows: string[]) {
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
