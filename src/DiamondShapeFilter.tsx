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

  const visibleShapes =
    activeGroup === 'All'
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
              ? `Exploring ${selectedCategoryName}. Click any real diamond shape below to filter.`
              : 'Select any real diamond cut below to refine live inventory.'}
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

      {/* ── Compact Grid of Real Diamond Photographs ── */}
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
          <div className="shape-gem-stage">
            <img
              src="/diamonds/all-shapes.png"
              alt="All Diamond Shapes"
              className="shape-real-img"
              loading="lazy"
              decoding="async"
            />
            <div className="shape-gem-shimmer" aria-hidden="true" />
            <div className="shape-sparkle-flare" aria-hidden="true" />
          </div>
          <span className="shape-name">All Shapes</span>
        </button>

        {/* Real Photographic Diamond Shape Tiles */}
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
              <div className="shape-gem-stage">
                <img
                  src={`/diamonds/${shape.id}.png`}
                  alt={`${shape.name} Diamond Cut`}
                  className="shape-real-img"
                  loading="lazy"
                  decoding="async"
                  onError={(e) => {
                    // Fallback to round if specific image fails
                    const target = e.currentTarget
                    if (!target.src.endsWith('round.png')) {
                      target.src = '/diamonds/round.png'
                    }
                  }}
                />
                <div className="shape-gem-shimmer" aria-hidden="true" />
                <div className="shape-sparkle-flare" aria-hidden="true" />
              </div>
              <span className="shape-name">{shape.name}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default DiamondShapeFilter
