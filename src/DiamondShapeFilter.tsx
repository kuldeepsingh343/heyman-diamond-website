import React, { useState } from 'react'
import './DiamondShapeFilter.css'
import { DIAMOND_SHAPES, type ShapeDefinition } from './diamondShapesData'

interface DiamondShapeFilterProps {
  selectedShape: string
  onSelectShape: (shape: string) => void
  selectedCategoryName?: string
}

export const DiamondShapeFilter: React.FC<DiamondShapeFilterProps> = ({
  selectedShape,
  onSelectShape,
  selectedCategoryName,
}) => {
  const [activeGroup, setActiveGroup] = useState<string>('All')

  const groups = ['All', 'Popular', 'Step Cut', 'Fancy', 'Geometric']

  const visibleShapes = activeGroup === 'All'
    ? DIAMOND_SHAPES
    : DIAMOND_SHAPES.filter(s => s.group === activeGroup)

  const isShapeActive = (shape: ShapeDefinition) => {
    if (selectedShape === 'all') return false
    const normSelected = selectedShape.toLowerCase().replace(/[\s-_]/g, '')
    const normShape = shape.name.toLowerCase().replace(/[\s-_]/g, '')
    const normId = shape.id.toLowerCase().replace(/[\s-_]/g, '')
    return (
      normSelected === normShape ||
      normSelected === normId ||
      shape.aliases.some(a => a.toLowerCase().replace(/[\s-_]/g, '') === normSelected)
    )
  }

  const handleTileClick = (shape: ShapeDefinition) => {
    if (isShapeActive(shape)) {
      onSelectShape('all') // Click again to reset to all shapes
    } else {
      onSelectShape(shape.name)
    }
  }

  const selectedShapeDef = DIAMOND_SHAPES.find(s => isShapeActive(s))

  return (
    <div className="diamond-shape-filter-container" id="diamond-shape-filter-section">
      {/* ── Header ── */}
      <div className="shape-filter-header">
        <div className="shape-filter-title-wrap">
          <span className="shape-filter-eyebrow">DIAMOND GEOMETRY & CUTS</span>
          <h3 className="shape-filter-heading">Filter by Diamond Shape</h3>
          <p className="shape-filter-subheading">
            {selectedCategoryName && selectedCategoryName !== 'all'
              ? `Exploring ${selectedCategoryName}. Click any diamond shape below to filter.`
              : 'Select any diamond shape below to filter live inventory.'}
          </p>
        </div>

        {/* Group Tabs */}
        <div className="shape-group-tabs" role="tablist" aria-label="Shape Category Tabs">
          {groups.map(group => (
            <button
              key={group}
              type="button"
              role="tab"
              aria-selected={activeGroup === group}
              className={`shape-group-btn ${activeGroup === group ? 'shape-group-btn--active' : ''}`}
              onClick={() => setActiveGroup(group)}
            >
              {group}
            </button>
          ))}
        </div>
      </div>

      {/* ── Active Selection Banner / Quick Reset ── */}
      {selectedShape !== 'all' && (
        <div className="shape-active-status-bar" role="status">
          <div className="shape-status-info">
            <span className="status-sparkle">✦</span>
            <span>
              Showing: <strong>{selectedShapeDef ? selectedShapeDef.name : selectedShape}</strong> diamonds
              {selectedCategoryName && selectedCategoryName !== 'all' && ` in ${selectedCategoryName}`}
            </span>
          </div>
          <button
            type="button"
            className="shape-clear-btn"
            onClick={() => onSelectShape('all')}
            title="Reset to all diamond shapes"
          >
            ✕ Reset to All Shapes
          </button>
        </div>
      )}

      {/* ── Compact Grid of Clear High-Definition Diamond Shapes ── */}
      <div
        className="diamond-shapes-grid"
        role="group"
        aria-label="Filter diamonds by shape"
      >
        {/* All Shapes Tile */}
        <button
          type="button"
          className={`shape-tile shape-tile-all ${selectedShape === 'all' ? 'shape-tile--active' : ''}`}
          onClick={() => onSelectShape('all')}
          aria-pressed={selectedShape === 'all'}
          title="Show all diamond shapes"
        >
          <div className="shape-3d-stage">
            <div className="shape-refraction-light" aria-hidden="true" />
            <div className="shape-sparkle-star" aria-hidden="true" />
            <DiamondShape3DIcon shapeId="round" />
          </div>
          <span className="shape-name">All Shapes</span>
        </button>

        {/* 19 High-Definition Diamond Shape Tiles */}
        {visibleShapes.map(shape => {
          const active = isShapeActive(shape)

          return (
            <button
              key={shape.id}
              type="button"
              className={`shape-tile ${active ? 'shape-tile--active' : ''}`}
              onClick={() => handleTileClick(shape)}
              aria-pressed={active}
              title={`${shape.name} Diamond — ${shape.description}`}
            >
              <div className="shape-3d-stage">
                <div className="shape-refraction-light" aria-hidden="true" />
                <div className="shape-sparkle-star" aria-hidden="true" />
                <DiamondShape3DIcon shapeId={shape.id} />
              </div>
              <span className="shape-name">{shape.name}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Clear High-Definition Colorless Diamond Renders.
 * Sharp facet outlines, crystal clear refraction, zero blur, zero black spots.
 */
interface DiamondShape3DIconProps {
  shapeId: string
}

export const DiamondShape3DIcon: React.FC<DiamondShape3DIconProps> = ({ shapeId }) => {
  return (
    <svg
      className="diamond-3d-svg"
      viewBox="0 0 100 100"
      aria-hidden="true"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        {/* Crisp Colorless Diamond Gradients */}
        <linearGradient id="diaTable" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="1" />
          <stop offset="60%" stopColor="#F7FBFF" stopOpacity="1" />
          <stop offset="100%" stopColor="#E6F2FC" stopOpacity="0.95" />
        </linearGradient>

        <linearGradient id="diaLight" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="1" />
          <stop offset="65%" stopColor="#F0F7FD" stopOpacity="0.98" />
          <stop offset="100%" stopColor="#D9ECFA" stopOpacity="0.92" />
        </linearGradient>

        <linearGradient id="diaMid" x1="100%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#F6FAFE" stopOpacity="1" />
          <stop offset="50%" stopColor="#DFEFFB" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#C6E3F8" stopOpacity="0.9" />
        </linearGradient>

        <linearGradient id="diaDepth" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#D6EAF8" stopOpacity="0.98" />
          <stop offset="50%" stopColor="#BBDDF5" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#9ECBF0" stopOpacity="0.9" />
        </linearGradient>

        <linearGradient id="diaFireWarm" x1="100%" y1="100%" x2="0%" y2="0%">
          <stop offset="0%" stopColor="#FFFDF7" stopOpacity="1" />
          <stop offset="50%" stopColor="#FFFFFF" stopOpacity="1" />
          <stop offset="100%" stopColor="#EAF4FC" stopOpacity="0.95" />
        </linearGradient>

        <linearGradient id="diaFirePink" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFF9FD" stopOpacity="1" />
          <stop offset="50%" stopColor="#FFFFFF" stopOpacity="1" />
          <stop offset="100%" stopColor="#E2F0FB" stopOpacity="0.95" />
        </linearGradient>
      </defs>

      {/* Render Shape Path Geometry */}
      {renderShapeGeometry(shapeId)}
    </svg>
  )
}

function renderShapeGeometry(shapeId: string) {
  // Crisp, sharp diamond outline and facet definition strokes
  const girdleStroke = '#325874' // Sharp outer boundary
  const facetStroke = '#4a7290'  // Sharp facet divisions
  const highlightStroke = '#6b93b0' // Fine facet accents

  switch (shapeId) {
    // 1. SQUARE CUSHION
    case 'square-cushion':
      return (
        <g className="diamond-facets">
          <path
            d="M 24 16 C 36 13, 64 13, 76 16 C 85 18, 87 25, 88 36 C 89 46, 89 54, 88 64 C 87 75, 85 82, 76 84 C 64 87, 36 87, 24 84 C 15 82, 13 75, 12 64 C 11 54, 11 46, 12 36 C 13 25, 15 18, 24 16 Z"
            fill="url(#diaMid)"
            stroke={girdleStroke}
            strokeWidth="0.8"
          />
          <path d="M 24 16 L 36 28 L 64 28 L 76 16 Z" fill="url(#diaLight)" stroke={facetStroke} strokeWidth="0.5" />
          <path d="M 76 16 L 64 28 L 72 36 L 88 36 Z" fill="url(#diaDepth)" stroke={facetStroke} strokeWidth="0.5" />
          <path d="M 88 36 L 72 36 L 72 64 L 88 64 Z" fill="url(#diaMid)" stroke={facetStroke} strokeWidth="0.5" />
          <path d="M 88 64 L 72 64 L 64 72 L 76 84 Z" fill="url(#diaFireWarm)" stroke={facetStroke} strokeWidth="0.5" />
          <path d="M 76 84 L 64 72 L 36 72 L 24 84 Z" fill="url(#diaLight)" stroke={facetStroke} strokeWidth="0.5" />
          <path d="M 24 84 L 36 72 L 28 64 L 12 64 Z" fill="url(#diaDepth)" stroke={facetStroke} strokeWidth="0.5" />
          <path d="M 12 64 L 28 64 L 28 36 L 12 36 Z" fill="url(#diaFirePink)" stroke={facetStroke} strokeWidth="0.5" />
          <path d="M 12 36 L 28 36 L 36 28 L 24 16 Z" fill="url(#diaMid)" stroke={facetStroke} strokeWidth="0.5" />
          <path
            d="M 36 28 L 64 28 L 72 36 L 72 64 L 64 72 L 36 72 L 28 64 L 28 36 Z"
            fill="url(#diaTable)"
            stroke={girdleStroke}
            strokeWidth="0.7"
          />
          <circle cx="44" cy="40" r="3" fill="#ffffff" />
        </g>
      )

    // 2. SQUARE RADIANT
    case 'square-radiant':
      return (
        <g className="diamond-facets">
          <polygon
            points="28,14 72,14 86,28 86,72 72,86 28,86 14,72 14,28"
            fill="url(#diaMid)"
            stroke={girdleStroke}
            strokeWidth="0.8"
          />
          <polygon points="28,14 37,26 63,26 72,14" fill="url(#diaLight)" stroke={facetStroke} strokeWidth="0.5" />
          <polygon points="72,14 63,26 74,37 86,28" fill="url(#diaDepth)" stroke={facetStroke} strokeWidth="0.5" />
          <polygon points="86,28 74,37 74,63 86,72" fill="url(#diaFireWarm)" stroke={facetStroke} strokeWidth="0.5" />
          <polygon points="86,72 74,63 63,74 72,86" fill="url(#diaDepth)" stroke={facetStroke} strokeWidth="0.5" />
          <polygon points="72,86 63,74 37,74 28,86" fill="url(#diaLight)" stroke={facetStroke} strokeWidth="0.5" />
          <polygon points="28,86 37,74 26,63 14,72" fill="url(#diaMid)" stroke={facetStroke} strokeWidth="0.5" />
          <polygon points="14,72 26,63 26,37 14,28" fill="url(#diaFirePink)" stroke={facetStroke} strokeWidth="0.5" />
          <polygon points="14,28 26,37 37,26 28,14" fill="url(#diaMid)" stroke={facetStroke} strokeWidth="0.5" />
          <polygon
            points="37,26 63,26 74,37 74,63 63,74 37,74 26,63 26,37"
            fill="url(#diaTable)"
            stroke={girdleStroke}
            strokeWidth="0.7"
          />
          <line x1="50" y1="26" x2="50" y2="74" stroke={highlightStroke} strokeWidth="0.5" />
          <line x1="26" y1="50" x2="74" y2="50" stroke={highlightStroke} strokeWidth="0.5" />
          <circle cx="43" cy="38" r="3" fill="#ffffff" />
        </g>
      )

    // 3. ROUND BRILLIANT
    case 'round':
      return (
        <g className="diamond-facets">
          <circle cx="50" cy="50" r="38" fill="url(#diaMid)" stroke={girdleStroke} strokeWidth="0.8" />
          {/* Bezel Kites */}
          <path d="M 50 12 L 61 24 L 50 28 L 39 24 Z" fill="url(#diaLight)" stroke={facetStroke} strokeWidth="0.5" />
          <path d="M 77 23 L 76 39 L 66 36 L 61 24 Z" fill="url(#diaDepth)" stroke={facetStroke} strokeWidth="0.5" />
          <path d="M 88 50 L 76 61 L 72 50 L 76 39 Z" fill="url(#diaFireWarm)" stroke={facetStroke} strokeWidth="0.5" />
          <path d="M 77 77 L 61 76 L 66 64 L 76 61 Z" fill="url(#diaDepth)" stroke={facetStroke} strokeWidth="0.5" />
          <path d="M 50 88 L 39 76 L 50 72 L 61 76 Z" fill="url(#diaLight)" stroke={facetStroke} strokeWidth="0.5" />
          <path d="M 23 77 L 24 61 L 34 64 L 39 76 Z" fill="url(#diaMid)" stroke={facetStroke} strokeWidth="0.5" />
          <path d="M 12 50 L 24 39 L 28 50 L 24 61 Z" fill="url(#diaFirePink)" stroke={facetStroke} strokeWidth="0.5" />
          <path d="M 23 23 L 39 24 L 34 36 L 24 39 Z" fill="url(#diaDepth)" stroke={facetStroke} strokeWidth="0.5" />
          {/* Star Facets */}
          <polygon points="50,28 66,36 61,24" fill="url(#diaFireWarm)" stroke={facetStroke} strokeWidth="0.45" />
          <polygon points="66,36 72,50 76,39" fill="url(#diaLight)" stroke={facetStroke} strokeWidth="0.45" />
          <polygon points="72,50 66,64 76,61" fill="url(#diaDepth)" stroke={facetStroke} strokeWidth="0.45" />
          <polygon points="66,64 50,72 61,76" fill="url(#diaLight)" stroke={facetStroke} strokeWidth="0.45" />
          <polygon points="50,72 34,64 39,76" fill="url(#diaFirePink)" stroke={facetStroke} strokeWidth="0.45" />
          <polygon points="34,64 28,50 24,61" fill="url(#diaLight)" stroke={facetStroke} strokeWidth="0.45" />
          <polygon points="28,50 34,36 24,39" fill="url(#diaMid)" stroke={facetStroke} strokeWidth="0.45" />
          <polygon points="34,36 50,28 39,24" fill="url(#diaLight)" stroke={facetStroke} strokeWidth="0.45" />
          {/* Table */}
          <polygon
            points="50,28 66,36 72,50 66,64 50,72 34,64 28,50 34,36"
            fill="url(#diaTable)"
            stroke={girdleStroke}
            strokeWidth="0.7"
          />
          <circle cx="44" cy="42" r="4.5" fill="#ffffff" />
        </g>
      )

    // 4. OVAL BRILLIANT
    case 'oval':
      return (
        <g className="diamond-facets">
          <ellipse cx="50" cy="50" rx="32" ry="42" fill="url(#diaMid)" stroke={girdleStroke} strokeWidth="0.8" />
          <path d="M 50 8 L 60 22 L 50 26 L 40 22 Z" fill="url(#diaLight)" stroke={facetStroke} strokeWidth="0.5" />
          <path d="M 75 22 L 78 40 L 68 38 L 60 22 Z" fill="url(#diaDepth)" stroke={facetStroke} strokeWidth="0.5" />
          <path d="M 82 50 L 78 60 L 68 50 L 78 40 Z" fill="url(#diaFireWarm)" stroke={facetStroke} strokeWidth="0.5" />
          <path d="M 75 78 L 60 78 L 68 62 L 78 60 Z" fill="url(#diaMid)" stroke={facetStroke} strokeWidth="0.5" />
          <path d="M 50 92 L 40 78 L 50 74 L 60 78 Z" fill="url(#diaLight)" stroke={facetStroke} strokeWidth="0.5" />
          <path d="M 25 78 L 22 60 L 32 62 L 40 78 Z" fill="url(#diaDepth)" stroke={facetStroke} strokeWidth="0.5" />
          <path d="M 18 50 L 22 40 L 32 50 L 22 60 Z" fill="url(#diaFirePink)" stroke={facetStroke} strokeWidth="0.5" />
          <path d="M 25 22 L 40 22 L 32 38 L 22 40 Z" fill="url(#diaMid)" stroke={facetStroke} strokeWidth="0.5" />
          <polygon
            points="50,26 68,38 68,62 50,74 32,62 32,38"
            fill="url(#diaTable)"
            stroke={girdleStroke}
            strokeWidth="0.7"
          />
          <circle cx="44" cy="40" r="3.5" fill="#ffffff" />
        </g>
      )

    // 5. PRINCESS CUT
    case 'princess':
      return (
        <g className="diamond-facets">
          <rect x="14" y="14" width="72" height="72" fill="url(#diaMid)" stroke={girdleStroke} strokeWidth="0.8" />
          <polygon points="14,14 34,34 66,34 86,14" fill="url(#diaLight)" stroke={facetStroke} strokeWidth="0.5" />
          <polygon points="86,14 66,34 66,66 86,86" fill="url(#diaDepth)" stroke={facetStroke} strokeWidth="0.5" />
          <polygon points="86,86 66,66 34,66 14,86" fill="url(#diaFireWarm)" stroke={facetStroke} strokeWidth="0.5" />
          <polygon points="14,86 34,66 34,34 14,14" fill="url(#diaMid)" stroke={facetStroke} strokeWidth="0.5" />
          <rect x="34" y="34" width="32" height="32" fill="url(#diaTable)" stroke={girdleStroke} strokeWidth="0.7" />
          <line x1="34" y1="34" x2="66" y2="66" stroke={highlightStroke} strokeWidth="0.5" />
          <line x1="66" y1="34" x2="34" y2="66" stroke={highlightStroke} strokeWidth="0.5" />
          <circle cx="44" cy="44" r="3" fill="#ffffff" />
        </g>
      )

    // 6. EMERALD CUT
    case 'emerald':
      return (
        <g className="diamond-facets">
          <polygon
            points="28,12 72,12 88,26 88,74 72,88 28,88 12,74 12,26"
            fill="url(#diaMid)"
            stroke={girdleStroke}
            strokeWidth="0.8"
          />
          <polygon
            points="32,20 68,20 80,30 80,70 68,80 32,80 20,70 20,30"
            fill="url(#diaLight)"
            stroke={facetStroke}
            strokeWidth="0.5"
          />
          <polygon
            points="36,28 64,28 72,36 72,64 64,72 36,72 28,64 28,36"
            fill="url(#diaTable)"
            stroke={girdleStroke}
            strokeWidth="0.7"
          />
          <line x1="28" y1="12" x2="36" y2="28" stroke={highlightStroke} strokeWidth="0.5" />
          <line x1="72" y1="12" x2="64" y2="28" stroke={highlightStroke} strokeWidth="0.5" />
          <line x1="88" y1="74" x2="72" y2="64" stroke={highlightStroke} strokeWidth="0.5" />
          <line x1="12" y1="74" x2="28" y2="64" stroke={highlightStroke} strokeWidth="0.5" />
          <circle cx="44" cy="38" r="3" fill="#ffffff" />
        </g>
      )

    // 7. PEAR SHAPE
    case 'pear':
      return (
        <g className="diamond-facets">
          <path
            d="M 50 10 C 58 24, 82 52, 82 66 C 82 82, 68 90, 50 90 C 32 90, 18 82, 18 66 C 18 52, 42 24, 50 10 Z"
            fill="url(#diaMid)"
            stroke={girdleStroke}
            strokeWidth="0.8"
          />
          <path d="M 50 10 L 60 28 L 50 32 L 40 28 Z" fill="url(#diaLight)" stroke={facetStroke} strokeWidth="0.5" />
          <path d="M 75 42 L 74 64 L 64 56 L 60 28 Z" fill="url(#diaDepth)" stroke={facetStroke} strokeWidth="0.5" />
          <path d="M 74 64 L 64 78 L 50 72 L 64 56 Z" fill="url(#diaFireWarm)" stroke={facetStroke} strokeWidth="0.5" />
          <path d="M 50 90 L 36 78 L 50 72 L 64 78 Z" fill="url(#diaMid)" stroke={facetStroke} strokeWidth="0.5" />
          <path d="M 26 64 L 36 78 L 50 72 L 36 56 Z" fill="url(#diaLight)" stroke={facetStroke} strokeWidth="0.5" />
          <path d="M 25 42 L 26 64 L 36 56 L 40 28 Z" fill="url(#diaDepth)" stroke={facetStroke} strokeWidth="0.5" />
          <path
            d="M 50 32 L 64 56 L 50 72 L 36 56 Z"
            fill="url(#diaTable)"
            stroke={girdleStroke}
            strokeWidth="0.7"
          />
          <circle cx="46" cy="46" r="3" fill="#ffffff" />
        </g>
      )

    // 8. ASSCHER CUT
    case 'asscher':
      return (
        <g className="diamond-facets">
          <polygon
            points="32,12 68,12 88,32 88,68 68,88 32,88 12,68 12,32"
            fill="url(#diaMid)"
            stroke={girdleStroke}
            strokeWidth="0.8"
          />
          <polygon
            points="36,22 64,22 78,36 78,64 64,78 36,78 22,64 22,36"
            fill="url(#diaLight)"
            stroke={facetStroke}
            strokeWidth="0.5"
          />
          <polygon
            points="42,32 58,32 68,42 68,58 58,68 42,68 32,58 32,42"
            fill="url(#diaTable)"
            stroke={girdleStroke}
            strokeWidth="0.7"
          />
          <line x1="32" y1="12" x2="68" y2="88" stroke={highlightStroke} strokeWidth="0.5" />
          <line x1="68" y1="12" x2="32" y2="88" stroke={highlightStroke} strokeWidth="0.5" />
          <line x1="12" y1="32" x2="88" y2="68" stroke={highlightStroke} strokeWidth="0.5" />
          <line x1="12" y1="68" x2="88" y2="32" stroke={highlightStroke} strokeWidth="0.5" />
          <circle cx="46" cy="46" r="2.8" fill="#ffffff" />
        </g>
      )

    // 9. MARQUISE CUT
    case 'marquise':
      return (
        <g className="diamond-facets">
          <path
            d="M 50 8 C 66 26, 84 40, 84 50 C 84 60, 66 74, 50 92 C 34 74, 16 60, 16 50 C 16 40, 34 26, 50 8 Z"
            fill="url(#diaMid)"
            stroke={girdleStroke}
            strokeWidth="0.8"
          />
          <polygon points="50,8 58,26 50,30 42,26" fill="url(#diaLight)" stroke={facetStroke} strokeWidth="0.5" />
          <polygon points="76,38 78,50 66,50 62,36" fill="url(#diaDepth)" stroke={facetStroke} strokeWidth="0.5" />
          <polygon points="76,62 62,64 66,50 78,50" fill="url(#diaFireWarm)" stroke={facetStroke} strokeWidth="0.5" />
          <polygon points="50,92 42,74 50,70 58,74" fill="url(#diaLight)" stroke={facetStroke} strokeWidth="0.5" />
          <polygon points="24,62 38,64 34,50 22,50" fill="url(#diaDepth)" stroke={facetStroke} strokeWidth="0.5" />
          <polygon points="24,38 22,50 34,50 38,36" fill="url(#diaMid)" stroke={facetStroke} strokeWidth="0.5" />
          <polygon
            points="50,30 66,50 50,70 34,50"
            fill="url(#diaTable)"
            stroke={girdleStroke}
            strokeWidth="0.7"
          />
          <circle cx="47" cy="45" r="3" fill="#ffffff" />
        </g>
      )

    // 10. RADIANT CUT
    case 'radiant':
      return (
        <g className="diamond-facets">
          <polygon
            points="24,14 76,14 88,26 88,74 76,86 24,86 12,74 12,26"
            fill="url(#diaMid)"
            stroke={girdleStroke}
            strokeWidth="0.8"
          />
          <polygon points="24,14 36,26 64,26 76,14" fill="url(#diaLight)" stroke={facetStroke} strokeWidth="0.5" />
          <polygon points="76,14 64,26 74,36 88,26" fill="url(#diaDepth)" stroke={facetStroke} strokeWidth="0.5" />
          <polygon points="88,26 74,36 74,64 88,74" fill="url(#diaFireWarm)" stroke={facetStroke} strokeWidth="0.5" />
          <polygon points="88,74 74,64 64,74 76,86" fill="url(#diaDepth)" stroke={facetStroke} strokeWidth="0.5" />
          <polygon points="76,86 64,74 36,74 24,86" fill="url(#diaLight)" stroke={facetStroke} strokeWidth="0.5" />
          <polygon points="24,86 36,74 26,64 12,74" fill="url(#diaMid)" stroke={facetStroke} strokeWidth="0.5" />
          <polygon points="12,74 26,64 26,36 12,26" fill="url(#diaFirePink)" stroke={facetStroke} strokeWidth="0.5" />
          <polygon points="12,26 26,36 36,26 24,14" fill="url(#diaMid)" stroke={facetStroke} strokeWidth="0.5" />
          <polygon
            points="36,26 64,26 74,36 74,64 64,74 36,74 26,64 26,36"
            fill="url(#diaTable)"
            stroke={girdleStroke}
            strokeWidth="0.7"
          />
          <line x1="50" y1="26" x2="50" y2="74" stroke={highlightStroke} strokeWidth="0.5" />
          <line x1="26" y1="50" x2="74" y2="50" stroke={highlightStroke} strokeWidth="0.5" />
          <circle cx="43" cy="38" r="3" fill="#ffffff" />
        </g>
      )

    // 11. CUSHION CUT (Elongated)
    case 'cushion':
      return (
        <g className="diamond-facets">
          <path
            d="M 24 14 C 38 12, 62 12, 76 14 C 86 16, 88 24, 88 38 C 89 48, 89 52, 88 62 C 88 76, 86 84, 76 86 C 62 88, 38 88, 24 86 C 14 84, 12 76, 12 62 C 11 52, 11 48, 12 38 C 12 24, 14 16, 24 14 Z"
            fill="url(#diaMid)"
            stroke={girdleStroke}
            strokeWidth="0.8"
          />
          <path d="M 24 14 L 36 26 L 64 26 L 76 14 Z" fill="url(#diaLight)" stroke={facetStroke} strokeWidth="0.5" />
          <path d="M 76 14 L 64 26 L 72 36 L 88 38 Z" fill="url(#diaDepth)" stroke={facetStroke} strokeWidth="0.5" />
          <path d="M 88 38 L 72 36 L 72 64 L 88 62 Z" fill="url(#diaFireWarm)" stroke={facetStroke} strokeWidth="0.5" />
          <path d="M 88 62 L 72 64 L 64 74 L 76 86 Z" fill="url(#diaDepth)" stroke={facetStroke} strokeWidth="0.5" />
          <path d="M 76 86 L 64 74 L 36 74 L 24 86 Z" fill="url(#diaLight)" stroke={facetStroke} strokeWidth="0.5" />
          <path d="M 24 86 L 36 74 L 28 64 L 12 62 Z" fill="url(#diaMid)" stroke={facetStroke} strokeWidth="0.5" />
          <path d="M 12 62 L 28 64 L 28 36 L 12 38 Z" fill="url(#diaFirePink)" stroke={facetStroke} strokeWidth="0.5" />
          <path d="M 12 38 L 28 36 L 36 26 L 24 14 Z" fill="url(#diaMid)" stroke={facetStroke} strokeWidth="0.5" />
          <path
            d="M 36 26 L 64 26 L 72 36 L 72 64 L 64 74 L 36 74 L 28 64 L 28 36 Z"
            fill="url(#diaTable)"
            stroke={girdleStroke}
            strokeWidth="0.7"
          />
          <circle cx="44" cy="38" r="3.5" fill="#ffffff" />
        </g>
      )

    // 12. BAGUETTE
    case 'baguette':
      return (
        <g className="diamond-facets">
          <rect x="28" y="14" width="44" height="72" fill="url(#diaMid)" stroke={girdleStroke} strokeWidth="0.8" />
          <rect x="34" y="22" width="32" height="56" fill="url(#diaLight)" stroke={facetStroke} strokeWidth="0.5" />
          <rect x="40" y="30" width="20" height="40" fill="url(#diaTable)" stroke={girdleStroke} strokeWidth="0.7" />
          <line x1="28" y1="14" x2="40" y2="30" stroke={highlightStroke} strokeWidth="0.5" />
          <line x1="72" y1="14" x2="60" y2="30" stroke={highlightStroke} strokeWidth="0.5" />
          <line x1="72" y1="86" x2="60" y2="70" stroke={highlightStroke} strokeWidth="0.5" />
          <line x1="28" y1="86" x2="40" y2="70" stroke={highlightStroke} strokeWidth="0.5" />
          <circle cx="45" cy="36" r="2.5" fill="#ffffff" />
        </g>
      )

    // 13. TAPERED BAGUETTE
    case 'tapered-baguette':
      return (
        <g className="diamond-facets">
          <polygon points="20,16 80,16 66,84 34,84" fill="url(#diaMid)" stroke={girdleStroke} strokeWidth="0.8" />
          <polygon points="28,24 72,24 60,76 40,76" fill="url(#diaLight)" stroke={facetStroke} strokeWidth="0.5" />
          <polygon points="36,32 64,32 54,68 46,68" fill="url(#diaTable)" stroke={girdleStroke} strokeWidth="0.7" />
          <line x1="20" y1="16" x2="36" y2="32" stroke={highlightStroke} strokeWidth="0.5" />
          <line x1="80" y1="16" x2="64" y2="32" stroke={highlightStroke} strokeWidth="0.5" />
          <line x1="66" y1="84" x2="54" y2="68" stroke={highlightStroke} strokeWidth="0.5" />
          <line x1="34" y1="84" x2="46" y2="68" stroke={highlightStroke} strokeWidth="0.5" />
          <circle cx="45" cy="36" r="2.5" fill="#ffffff" />
        </g>
      )

    // 14. HEART SHAPE
    case 'heart':
      return (
        <g className="diamond-facets">
          <path
            d="M 50 28 C 42 16, 22 14, 16 26 C 10 38, 14 56, 32 72 L 50 90 L 68 72 C 86 56, 90 38, 84 26 C 78 14, 58 16, 50 28 Z"
            fill="url(#diaMid)"
            stroke={girdleStroke}
            strokeWidth="0.8"
          />
          <path d="M 50 28 C 42 18, 28 18, 24 28 L 38 42 Z" fill="url(#diaLight)" stroke={facetStroke} strokeWidth="0.5" />
          <path d="M 50 28 C 58 18, 72 18, 76 28 L 62 42 Z" fill="url(#diaDepth)" stroke={facetStroke} strokeWidth="0.5" />
          <polygon points="50,90 32,72 42,60 50,68" fill="url(#diaMid)" stroke={facetStroke} strokeWidth="0.5" />
          <polygon points="50,90 68,72 58,60 50,68" fill="url(#diaFireWarm)" stroke={facetStroke} strokeWidth="0.5" />
          <path
            d="M 50 38 C 44 30, 32 30, 28 38 C 24 46, 30 56, 42 64 L 50 72 L 58 64 C 70 56, 76 46, 72 38 C 68 30, 56 30, 50 38 Z"
            fill="url(#diaTable)"
            stroke={girdleStroke}
            strokeWidth="0.7"
          />
          <circle cx="43" cy="46" r="3" fill="#ffffff" />
        </g>
      )

    // 15. TRILLIANT
    case 'trilliant':
      return (
        <g className="diamond-facets">
          <path
            d="M 50 12 C 64 28, 80 56, 88 80 C 64 85, 36 85, 12 80 C 20 56, 36 28, 50 12 Z"
            fill="url(#diaMid)"
            stroke={girdleStroke}
            strokeWidth="0.8"
          />
          <polygon points="50,12 64,38 50,44 36,38" fill="url(#diaLight)" stroke={facetStroke} strokeWidth="0.5" />
          <polygon points="88,80 62,64 74,54" fill="url(#diaDepth)" stroke={facetStroke} strokeWidth="0.5" />
          <polygon points="12,80 26,54 38,64" fill="url(#diaFireWarm)" stroke={facetStroke} strokeWidth="0.5" />
          <polygon points="50,44 68,72 32,72" fill="url(#diaTable)" stroke={girdleStroke} strokeWidth="0.7" />
          <circle cx="50" cy="54" r="3" fill="#ffffff" />
        </g>
      )

    // 16. TRIANGLE (Geometric Sharp)
    case 'triangle':
      return (
        <g className="diamond-facets">
          <polygon points="50,14 88,82 12,82" fill="url(#diaMid)" stroke={girdleStroke} strokeWidth="0.8" />
          <polygon points="50,14 66,44 34,44" fill="url(#diaLight)" stroke={facetStroke} strokeWidth="0.5" />
          <polygon points="88,82 56,66 76,52" fill="url(#diaDepth)" stroke={facetStroke} strokeWidth="0.5" />
          <polygon points="12,82 24,52 44,66" fill="url(#diaFirePink)" stroke={facetStroke} strokeWidth="0.5" />
          <polygon points="50,48 68,74 32,74" fill="url(#diaTable)" stroke={girdleStroke} strokeWidth="0.7" />
          <circle cx="50" cy="56" r="2.8" fill="#ffffff" />
        </g>
      )

    // 17. ROSE CUT (Dome with Petal Facets)
    case 'rose-cut':
      return (
        <g className="diamond-facets">
          <circle cx="50" cy="50" r="38" fill="url(#diaMid)" stroke={girdleStroke} strokeWidth="0.8" />
          <polygon points="50,24 64,44 36,44" fill="url(#diaTable)" stroke={girdleStroke} strokeWidth="0.6" />
          <polygon points="50,24 78,28 64,44" fill="url(#diaLight)" stroke={facetStroke} strokeWidth="0.5" />
          <polygon points="64,44 78,28 88,50" fill="url(#diaDepth)" stroke={facetStroke} strokeWidth="0.5" />
          <polygon points="64,44 88,50 74,72" fill="url(#diaFireWarm)" stroke={facetStroke} strokeWidth="0.5" />
          <polygon points="64,44 74,72 50,68" fill="url(#diaLight)" stroke={facetStroke} strokeWidth="0.5" />
          <polygon points="36,44 50,68 26,72" fill="url(#diaDepth)" stroke={facetStroke} strokeWidth="0.5" />
          <polygon points="36,44 26,72 12,50" fill="url(#diaMid)" stroke={facetStroke} strokeWidth="0.5" />
          <polygon points="36,44 12,50 22,28" fill="url(#diaFirePink)" stroke={facetStroke} strokeWidth="0.5" />
          <polygon points="50,24 36,44 22,28" fill="url(#diaLight)" stroke={facetStroke} strokeWidth="0.5" />
          <circle cx="50" cy="38" r="3" fill="#ffffff" />
        </g>
      )

    // 18. KITE
    case 'kite':
      return (
        <g className="diamond-facets">
          <polygon points="50,10 82,42 50,90 18,42" fill="url(#diaMid)" stroke={girdleStroke} strokeWidth="0.8" />
          <polygon points="50,10 66,28 50,34 34,28" fill="url(#diaLight)" stroke={facetStroke} strokeWidth="0.5" />
          <polygon points="82,42 66,54 50,48 66,28" fill="url(#diaDepth)" stroke={facetStroke} strokeWidth="0.5" />
          <polygon points="50,90 50,64 66,54" fill="url(#diaFireWarm)" stroke={facetStroke} strokeWidth="0.5" />
          <polygon points="50,90 34,54 50,64" fill="url(#diaMid)" stroke={facetStroke} strokeWidth="0.5" />
          <polygon points="18,42 34,28 50,48 34,54" fill="url(#diaLight)" stroke={facetStroke} strokeWidth="0.5" />
          <polygon points="50,34 66,48 50,64 34,48" fill="url(#diaTable)" stroke={girdleStroke} strokeWidth="0.7" />
          <circle cx="50" cy="44" r="2.8" fill="#ffffff" />
        </g>
      )

    // 19. TAPERED BULLET
    case 'tapered-bullet':
      return (
        <g className="diamond-facets">
          <polygon points="26,14 74,14 74,52 50,88 26,52" fill="url(#diaMid)" stroke={girdleStroke} strokeWidth="0.8" />
          <polygon points="26,14 36,24 64,24 74,14" fill="url(#diaLight)" stroke={facetStroke} strokeWidth="0.5" />
          <polygon points="74,14 64,24 64,48 74,52" fill="url(#diaFireWarm)" stroke={facetStroke} strokeWidth="0.5" />
          <polygon points="74,52 64,48 50,74 50,88" fill="url(#diaDepth)" stroke={facetStroke} strokeWidth="0.5" />
          <polygon points="26,52 50,88 50,74 36,48" fill="url(#diaMid)" stroke={facetStroke} strokeWidth="0.5" />
          <polygon points="26,14 26,52 36,48 36,24" fill="url(#diaLight)" stroke={facetStroke} strokeWidth="0.5" />
          <polygon points="36,24 64,24 64,48 50,74 36,48" fill="url(#diaTable)" stroke={girdleStroke} strokeWidth="0.7" />
          <circle cx="46" cy="38" r="2.8" fill="#ffffff" />
        </g>
      )

    default:
      return null
  }
}

export default DiamondShapeFilter
