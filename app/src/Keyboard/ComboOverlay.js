import PropTypes from 'prop-types'
import { useCallback, useMemo, useRef, useEffect, useState } from 'react'

import ComboKey from './ComboKey'
import { getKeyCenter, getComboPositionAndRouting, getOrthogonalPath } from './combo-utils'
import { useComboInteraction } from './useComboInteraction'
import { getKeyBoundingBox } from '../key-units'
import styles from './combo-styles.module.css'

const ENDPOINT_HIT_RADIUS = 15
const DRAG_THRESHOLD_MS = 150

function findNearestKeyIndex(layout, pos) {
  let nearest = -1
  let minDist = Infinity
  layout.forEach((key, i) => {
    const center = getKeyCenter(key)
    const dist = Math.hypot(center.x - pos.x, center.y - pos.y)
    if (dist < minDist) {
      minDist = dist
      nearest = i
    }
  })
  return nearest
}

function ComboOverlay(props) {
  const { layout, combos, selectedCombo, onSelectCombo, onUpdateCombo, onDeleteCombo, onHighlightKeys, onEditCombo } = props
  const containerRef = useRef(null)
  const [selectedEndpoint, setSelectedEndpoint] = useState(null)
  const dragTimerRef = useRef(null)
  const pendingDragRef = useRef(null)

  const {
    dragState,
    startDragComboKey,
    startDragEndpoint,
    updateDrag,
    endDrag,
    keyCenters
  } = useComboInteraction(layout, combos, onUpdateCombo)

  const boundingBox = useMemo(() => {
    return layout.map(key => getKeyBoundingBox(
      { x: key.x, y: key.y },
      { u: key.w || key.u || 1, h: key.h || 1 },
      { x: key.rx, y: key.ry, a: key.r }
    )).reduce(({ x, y }, { max }) => ({
      x: Math.max(x, max.x),
      y: Math.max(y, max.y)
    }), { x: 0, y: 0 })
  }, [layout])

  const comboData = useMemo(() => {
    const data = combos.map(combo => {
      const { position, routeOutside, routeDirection, routeY } = getComboPositionAndRouting(combo.keyPositions, layout)
      const routing = { routeOutside, routeDirection, routeY }
      const keyData = combo.keyPositions
        .filter(i => i >= 0 && i < layout.length)
        .map((keyIdx, endpointIdx) => ({
          keyIdx,
          endpointIdx,
          center: getKeyCenter(layout[keyIdx])
        }))

      return {
        combo,
        position,
        routing,
        keyData
      }
    })

    if (selectedCombo) {
      data.sort((a, b) => {
        if (a.combo.name === selectedCombo.name) return 1
        if (b.combo.name === selectedCombo.name) return -1
        return 0
      })
    }

    return data
  }, [combos, layout, selectedCombo])

  const getMousePosition = useCallback((e) => {
    if (!containerRef.current) return { x: 0, y: 0 }
    const rect = containerRef.current.getBoundingClientRect()
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    }
  }, [])

  const handleMouseMove = useCallback((e) => {
    if (dragState) {
      updateDrag(getMousePosition(e))
    }
  }, [dragState, updateDrag, getMousePosition])

  const handleMouseUp = useCallback(() => {
    if (dragState) {
      endDrag()
    }
  }, [dragState, endDrag])

  useEffect(() => {
    if (dragState) {
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
      return () => {
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [dragState, handleMouseMove, handleMouseUp])

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (selectedEndpoint !== null && selectedCombo) {
        e.preventDefault()
        if (selectedCombo.keyPositions.length <= 2) {
          return
        }
        const newPositions = selectedCombo.keyPositions.filter((_, i) => i !== selectedEndpoint)
        onUpdateCombo({ ...selectedCombo, keyPositions: newPositions })
        setSelectedEndpoint(null)
      } else if (selectedCombo && selectedEndpoint === null) {
        e.preventDefault()
        onDeleteCombo?.(selectedCombo)
      }
    } else if (e.key === 'Escape') {
      setSelectedEndpoint(null)
      onSelectCombo?.(null)
    }
  }, [selectedCombo, selectedEndpoint, onUpdateCombo, onDeleteCombo, onSelectCombo])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  const handleEndpointMouseDown = useCallback((e, combo, endpointIdx) => {
    e.stopPropagation()
    const pos = getMousePosition(e)

    // Store pending drag info
    pendingDragRef.current = { combo, endpointIdx, pos }

    // Start drag after delay
    dragTimerRef.current = setTimeout(() => {
      if (pendingDragRef.current) {
        startDragEndpoint(combo, endpointIdx, pos)
        pendingDragRef.current = null
      }
    }, DRAG_THRESHOLD_MS)
  }, [getMousePosition, startDragEndpoint])

  const handleEndpointMouseUp = useCallback((e, combo, endpointIdx) => {
    e.stopPropagation()

    // If timer still pending, it was a click not drag
    if (dragTimerRef.current) {
      clearTimeout(dragTimerRef.current)
      dragTimerRef.current = null
      pendingDragRef.current = null

      // Select the endpoint
      onSelectCombo?.(combo)
      setSelectedEndpoint(endpointIdx)
    }
  }, [onSelectCombo])

  const handleComboKeyMouseDown = useCallback((e, combo, position) => {
    e.stopPropagation()
    startDragComboKey(combo, position)
  }, [startDragComboKey])

  const handleComboDoubleClick = useCallback((e, combo) => {
    e.stopPropagation()
    onEditCombo?.(combo)
  }, [onEditCombo])

  const handleShiftClickKey = useCallback((e) => {
    if (!e.shiftKey || !selectedCombo) return

    const pos = getMousePosition(e)
    const nearestKeyIdx = findNearestKeyIndex(layout, pos)

    if (selectedCombo.keyPositions.includes(nearestKeyIdx)) return

    const updatedCombo = {
      ...selectedCombo,
      keyPositions: [...selectedCombo.keyPositions, nearestKeyIdx]
    }
    onUpdateCombo(updatedCombo)
  }, [selectedCombo, layout, getMousePosition, onUpdateCombo])

  const dragHighlightedKeyIndices = useMemo(() => {
    if (!dragState) return new Set()

    if (dragState.type === 'endpoint' && dragState.snapTarget) {
      return new Set([dragState.snapTarget.index])
    }
    if (dragState.type === 'combo-key' && dragState.snapTargets) {
      return new Set(dragState.snapTargets.map(t => t.index))
    }
    return new Set()
  }, [dragState])

  useEffect(() => {
    onHighlightKeys?.(dragHighlightedKeyIndices)
  }, [dragHighlightedKeyIndices, onHighlightKeys])

  if (!layout || layout.length === 0 || combos.length === 0) {
    return null
  }

  const getDraggedEndpointPosition = (combo, endpointIdx, originalCenter) => {
    if (!dragState) return originalCenter

    if (dragState.type === 'endpoint' &&
        dragState.combo.name === combo.name &&
        dragState.endpointIndex === endpointIdx) {
      if (dragState.snapTarget) {
        return { x: dragState.snapTarget.x, y: dragState.snapTarget.y }
      }
      return dragState.currentPosition
    }

    if (dragState.type === 'combo-key' && dragState.combo.name === combo.name && dragState.delta) {
      const snapTarget = dragState.snapTargets?.[endpointIdx]
      if (snapTarget) {
        return { x: snapTarget.x, y: snapTarget.y }
      }
      return {
        x: originalCenter.x + dragState.delta.x,
        y: originalCenter.y + dragState.delta.y
      }
    }

    return originalCenter
  }

  const getDraggedComboPosition = (combo, originalPosition) => {
    if (!dragState || dragState.combo.name !== combo.name) return originalPosition

    if (dragState.type === 'combo-key' && dragState.delta) {
      return {
        x: originalPosition.x + dragState.delta.x,
        y: originalPosition.y + dragState.delta.y
      }
    }

    if (dragState.type === 'endpoint') {
      const keyData = combo.keyPositions.map((keyIdx, idx) => {
        if (idx === dragState.endpointIndex) {
          if (dragState.snapTarget) {
            return { x: dragState.snapTarget.x, y: dragState.snapTarget.y }
          }
          return dragState.currentPosition
        }
        return getKeyCenter(layout[keyIdx])
      })
      return {
        x: keyData.reduce((sum, p) => sum + p.x, 0) / keyData.length,
        y: keyData.reduce((sum, p) => sum + p.y, 0) / keyData.length
      }
    }

    return originalPosition
  }

  return (
    <div
      ref={containerRef}
      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', userSelect: 'none', zIndex: 5, pointerEvents: 'none' }}
    >
      <svg
        width={boundingBox.x}
        height={boundingBox.y}
        style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible' }}
      >
        <defs>
          <marker
            id="comboArrow"
            markerWidth="10"
            markerHeight="10"
            refX="0"
            refY="5"
            orient="auto"
            markerUnits="userSpaceOnUse"
          >
            <path d="M 0 2 L 5 5 L 0 8 Z" fill="rgb(60, 179, 113)" fillOpacity="0.6" />
          </marker>
          <marker
            id="comboArrowSelected"
            markerWidth="10"
            markerHeight="10"
            refX="0"
            refY="5"
            orient="auto"
            markerUnits="userSpaceOnUse"
          >
            <path d="M 0 2 L 5 5 L 0 8 Z" fill="rgb(60, 179, 113)" />
          </marker>
          <marker
            id="comboArrowEndpointSelected"
            markerWidth="10"
            markerHeight="10"
            refX="0"
            refY="5"
            orient="auto"
            markerUnits="userSpaceOnUse"
          >
            <path d="M 0 2 L 5 5 L 0 8 Z" fill="#ff6600" />
          </marker>
        </defs>

        {comboData.map(({ combo, position, routing, keyData }) => {
          const comboPos = getDraggedComboPosition(combo, position)
          const isSelected = selectedCombo?.name === combo.name

          return (
            <g key={combo.name}>
              {keyData.map(({ keyIdx, endpointIdx, center }) => {
                const endpointPos = getDraggedEndpointPosition(combo, endpointIdx, center)
                const pathD = getOrthogonalPath(comboPos, endpointPos, routing)
                const isDragging = dragState?.type === 'endpoint' &&
                  dragState?.combo.name === combo.name &&
                  dragState?.endpointIndex === endpointIdx
                const isEndpointSelected = isSelected && selectedEndpoint === endpointIdx

                return (
                  <g key={`${combo.name}-endpoint-${endpointIdx}`}>
                    {/* Visible line */}
                    <path
                      d={pathD}
                      className={isEndpointSelected ? styles.comboLineSelected : styles.comboLine}
                      markerEnd={isEndpointSelected ? "url(#comboArrowEndpointSelected)" : (isSelected ? "url(#comboArrowSelected)" : "url(#comboArrow)")}
                      style={{ opacity: isSelected ? 1 : 0.6 }}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    {/* Invisible thick path for click/drag detection */}
                    <path
                      d={pathD}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={16}
                      style={{ cursor: isDragging ? 'grabbing' : 'pointer', pointerEvents: 'auto' }}
                      onMouseDown={(e) => handleEndpointMouseDown(e, combo, endpointIdx)}
                      onMouseUp={(e) => handleEndpointMouseUp(e, combo, endpointIdx)}
                    />
                  </g>
                )
              })}
            </g>
          )
        })}
      </svg>

      {comboData.map(({ combo, position }) => {
        const comboPos = getDraggedComboPosition(combo, position)

        return (
          <ComboKey
            key={combo.name}
            position={comboPos}
            binding={combo.bindings}
            selected={selectedCombo?.name === combo.name}
            dragging={dragState?.type === 'combo-key' && dragState?.combo.name === combo.name}
            onClick={() => { setSelectedEndpoint(null); onSelectCombo?.(combo) }}
            onDoubleClick={(e) => handleComboDoubleClick(e, combo)}
            onMouseDown={(e) => handleComboKeyMouseDown(e, combo, comboPos)}
          />
        )
      })}
    </div>
  )
}

ComboOverlay.propTypes = {
  layout: PropTypes.array.isRequired,
  combos: PropTypes.arrayOf(PropTypes.shape({
    name: PropTypes.string.isRequired,
    bindings: PropTypes.string,
    keyPositions: PropTypes.arrayOf(PropTypes.number).isRequired,
    layers: PropTypes.arrayOf(PropTypes.number)
  })).isRequired,
  selectedCombo: PropTypes.object,
  onSelectCombo: PropTypes.func,
  onUpdateCombo: PropTypes.func,
  onDeleteCombo: PropTypes.func,
  onHighlightKeys: PropTypes.func,
  onEditCombo: PropTypes.func
}

export default ComboOverlay
