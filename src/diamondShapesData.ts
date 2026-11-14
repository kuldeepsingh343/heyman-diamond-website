export interface ShapeDefinition {
  id: string
  name: string
  group: 'Popular' | 'Step Cut' | 'Fancy' | 'Geometric'
  description: string
  aliases: string[]
}

export const DIAMOND_SHAPES: ShapeDefinition[] = [
  // ── Row 1 from Reference ──
  {
    id: 'square-cushion',
    name: 'Square Cushion',
    group: 'Popular',
    description: '1:1 square pillow silhouette with curved edges and radiant fire.',
    aliases: ['square cushion', 'sq cushion', 'square-cushion', 'sq-cushion'],
  },
  {
    id: 'square-radiant',
    name: 'Square Radiant',
    group: 'Popular',
    description: 'Symmetrical square with cut corners and high-dispersion brilliance.',
    aliases: ['square radiant', 'sq radiant', 'square-radiant', 'sq-radiant'],
  },
  {
    id: 'round',
    name: 'Round',
    group: 'Popular',
    description: 'Classic 57-facet brilliant cut offering maximum light dispersion.',
    aliases: ['round', 'rb', 'round brilliant'],
  },
  {
    id: 'oval',
    name: 'Oval',
    group: 'Popular',
    description: 'Graceful elongated brilliant that elongates the hand with fire.',
    aliases: ['oval', 'ov', 'oval brilliant'],
  },
  {
    id: 'princess',
    name: 'Princess',
    group: 'Popular',
    description: 'Contemporary square cut featuring pyramid brilliant faceting.',
    aliases: ['princess', 'pr', 'pc', 'princess cut'],
  },
  {
    id: 'emerald',
    name: 'Emerald',
    group: 'Step Cut',
    description: 'Sophisticated rectangular step cut showcasing optical clarity.',
    aliases: ['emerald', 'em', 'ec', 'emerald cut'],
  },
  {
    id: 'pear',
    name: 'Pear',
    group: 'Fancy',
    description: 'Teardrop silhouette blending the fire of round with delicate curve.',
    aliases: ['pear', 'ps', 'teardrop', 'pear brilliant'],
  },
  {
    id: 'asscher',
    name: 'Asscher',
    group: 'Step Cut',
    description: 'Dramatic square step cut with clipped corners and a central windmill.',
    aliases: ['asscher', 'ass', 'sqe', 'asscher cut'],
  },
  {
    id: 'marquise',
    name: 'Marquise',
    group: 'Fancy',
    description: 'Navette eye silhouette with tapered tips maximizing carat spread.',
    aliases: ['marquise', 'mq', 'marquise brilliant'],
  },
  {
    id: 'radiant',
    name: 'Radiant',
    group: 'Popular',
    description: 'Rectangular brilliant with beveled corners and crushed-ice fire.',
    aliases: ['radiant', 'rad', 'rc', 'radiant cut'],
  },
  {
    id: 'cushion',
    name: 'Cushion',
    group: 'Popular',
    description: 'Classic antique pillow cut with soft rounded corners and deep fire.',
    aliases: ['cushion', 'cush', 'cu', 'cushion modified'],
  },
  {
    id: 'baguette',
    name: 'Baguette',
    group: 'Step Cut',
    description: 'Clean rectangular step cut with architectural art-deco reflections.',
    aliases: ['baguette', 'bag', 'bg', 'straight baguette', 'bagutte'],
  },

  // ── Row 2 from Reference ──
  {
    id: 'tapered-baguette',
    name: 'Tapered Baguette',
    group: 'Step Cut',
    description: 'Trapezoidal step cut tapering gracefully, ideal for three-stone rings.',
    aliases: ['tapered baguette', 'tapered-baguette', 'tb', 'taper baguette', 't bagutte', 'tapered bagutte'],
  },
  {
    id: 'heart',
    name: 'Heart',
    group: 'Fancy',
    description: 'Romantic precision cut with symmetrical lobes and a distinct cleft.',
    aliases: ['heart', 'hs', 'ht', 'heart shape', 'heart brilliant'],
  },
  {
    id: 'trilliant',
    name: 'Trilliant',
    group: 'Geometric',
    description: 'Curved triangular brilliant cut featuring dramatic optic dispersion.',
    aliases: ['trilliant', 'trillion', 'tr', 'trielle', 'b trilliant', 'b.trilliant', 'b.trillliant'],
  },
  {
    id: 'triangle',
    name: 'Triangle',
    group: 'Geometric',
    description: 'Sharp geometric equilateral cut with architectural symmetry.',
    aliases: ['triangle', 'triangular', 'tringle', 's.tringle', 's tringle', 's triangle', 'b.tringle', 'b tringle'],
  },
  {
    id: 'rose-cut',
    name: 'Rose Cut',
    group: 'Geometric',
    description: 'Historic flat-bottom antique dome cut resembling blooming rose petals.',
    aliases: ['rose cut', 'rose-cut', 'rosecut'],
  },
  {
    id: 'kite',
    name: 'Kite',
    group: 'Geometric',
    description: 'Deltoid 4-sided geometry with bold modern angles and brilliance.',
    aliases: ['kite', 'kite shape'],
  },
  {
    id: 'tapered-bullet',
    name: 'Tapered Bullet',
    group: 'Geometric',
    description: 'Straight top tapering into a sharp V-point for distinctive side stones.',
    aliases: ['tapered bullet', 'tapered-bullet', 'bullet'],
  },
]

