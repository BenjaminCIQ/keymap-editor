import { useState, useCallback, useMemo } from 'react'
import { getKeyCenter, findNearestKeyIndex } from './combo-utils'

const SNAP_THRESHOLD = 40

export function useComboInteraction(layout, combos, onUpdateCombo) {
  const [dragState, setDragState] = useState(null)

  const keyCenters = useMemo(() => {
    return layout.map((key, i) => ({
      index: i,
      ...getKeyCenter(key)
    }))
  }, [layout])

  const findSnapTarget = useCallback((pixelPosition) => {
    let minDist = Infinity
    let nearestKey = null

    keyCenters.forEach(({ index, x, y }) => {
      const dist = Math.hypot(x - pixelPosition.x, y - pixelPosition.y)
      if (dist < minDist && dist < SNAP_THRESHOLD) {
        minDist = dist
        nearestKey = { index, x, y, distance: dist }
      }
    })

    return nearestKey
  }, [keyCenters])

  const startDragComboKey = useCallback((combo, startPosition) => {
    setDragState({
      type: 'combo-key',
      combo,
      startPosition,
      currentPosition: startPosition,
      originalKeyPositions: [...combo.keyPositions],
      snapTargets: []
    })
  }, [])

  const startDragEndpoint = useCallback((combo, endpointIndex, startPosition) => {
    setDragState({
      type: 'endpoint',
      combo,
      endpointIndex,
      startPosition,
      currentPosition: startPosition,
      originalKeyIndex: combo.keyPositions[endpointIndex],
      snapTarget: null
    })
  }, [])

  const updateDrag = useCallback((currentPosition) => {
    if (!dragState) return

    if (dragState.type === 'endpoint') {
      const snapTarget = findSnapTarget(currentPosition)
      setDragState(prev => ({
        ...prev,
        currentPosition,
        snapTarget
      }))
    } else if (dragState.type === 'combo-key') {
      const delta = {
        x: currentPosition.x - dragState.startPosition.x,
        y: currentPosition.y - dragState.startPosition.y
      }

      const snapTargets = dragState.originalKeyPositions.map(keyIdx => {
        const originalCenter = keyCenters[keyIdx]
        if (!originalCenter) return null

        const newPosition = {
          x: originalCenter.x + delta.x,
          y: originalCenter.y + delta.y
        }
        return findSnapTarget(newPosition)
      }).filter(Boolean)

      setDragState(prev => ({
        ...prev,
        currentPosition,
        delta,
        snapTargets
      }))
    }
  }, [dragState, findSnapTarget, keyCenters])

  const endDrag = useCallback(() => {
    if (!dragState || !onUpdateCombo) {
      setDragState(null)
      return
    }

    if (dragState.type === 'endpoint' && dragState.snapTarget) {
      const newKeyPositions = [...dragState.combo.keyPositions]
      const newKeyIndex = dragState.snapTarget.index

      if (!newKeyPositions.includes(newKeyIndex)) {
        newKeyPositions[dragState.endpointIndex] = newKeyIndex
        onUpdateCombo({
          ...dragState.combo,
          keyPositions: newKeyPositions
        })
      }
    } else if (dragState.type === 'combo-key' && dragState.snapTargets?.length === dragState.originalKeyPositions.length) {
      const newKeyPositions = dragState.snapTargets.map(t => t.index)
      const hasNoDuplicates = new Set(newKeyPositions).size === newKeyPositions.length

      if (hasNoDuplicates) {
        onUpdateCombo({
          ...dragState.combo,
          keyPositions: newKeyPositions
        })
      }
    }

    setDragState(null)
  }, [dragState, onUpdateCombo])

  const cancelDrag = useCallback(() => {
    setDragState(null)
  }, [])

  return {
    dragState,
    startDragComboKey,
    startDragEndpoint,
    updateDrag,
    endDrag,
    cancelDrag,
    keyCenters
  }
}
