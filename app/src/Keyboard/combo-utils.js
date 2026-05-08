import { getComputedParams } from '../key-units'

const KEY_UNIT = 70 // 65px key + 5px padding

export function getKeyCenter(key) {
  const { x, y, u, h } = getComputedParams(
    { x: key.x, y: key.y },
    { u: key.w || key.u || 1, h: key.h || 1 },
    { x: key.rx, y: key.ry, a: key.r }
  )
  return {
    x: x + u / 2,
    y: y + h / 2
  }
}

function areKeysAdjacent(layout, keyPositions) {
  if (keyPositions.length < 2) return true

  const keys = keyPositions
    .filter(i => i >= 0 && i < layout.length)
    .map(i => layout[i])

  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const dx = Math.abs(keys[i].x - keys[j].x)
      const dy = Math.abs(keys[i].y - keys[j].y)
      if (dx > 1.5 || dy > 1.5) {
        return false
      }
    }
  }
  return true
}

export function getComboPositionAndRouting(keyPositions, layout) {
  const validPositions = keyPositions.filter(i => i >= 0 && i < layout.length)
  const centers = validPositions.map(i => getKeyCenter(layout[i]))
  const keys = validPositions.map(i => layout[i])

  if (centers.length === 0) {
    return { position: { x: 0, y: 0 }, routeOutside: false, routeDirection: null }
  }

  const centroid = {
    x: centers.reduce((sum, p) => sum + p.x, 0) / centers.length,
    y: centers.reduce((sum, p) => sum + p.y, 0) / centers.length
  }

  if (!areKeysAdjacent(layout, keyPositions)) {
    const allKeyCenters = layout.map(k => getKeyCenter(k))
    const minY = Math.min(...allKeyCenters.map(c => c.y))
    const maxY = Math.max(...allKeyCenters.map(c => c.y))

    const avgKeyY = keys.reduce((sum, k) => sum + k.y, 0) / keys.length
    const midY = (Math.min(...layout.map(k => k.y)) + Math.max(...layout.map(k => k.y))) / 2

    const offset = KEY_UNIT * 0.8

    if (avgKeyY <= midY) {
      return {
        position: { x: centroid.x, y: minY - offset },
        routeOutside: true,
        routeDirection: 'above',
        routeY: minY - offset * 0.5
      }
    } else {
      return {
        position: { x: centroid.x, y: maxY + offset },
        routeOutside: true,
        routeDirection: 'below',
        routeY: maxY + offset * 0.5
      }
    }
  }

  return { position: centroid, routeOutside: false, routeDirection: null }
}

export function getComboPosition(keyPositions, layout) {
  return getComboPositionAndRouting(keyPositions, layout).position
}

const ARROW_LENGTH = 5

export function getOrthogonalPath(comboPos, keyPos, routing) {
  // Path goes FROM combo TO key, so markerEnd is at key
  // Shorten final segment by arrow length so arrow tip lands at key center

  // If same Y (horizontal), just draw straight line
  if (Math.abs(comboPos.y - keyPos.y) < 1) {
    const dir = keyPos.x > comboPos.x ? 1 : -1
    const endX = keyPos.x - dir * ARROW_LENGTH
    return `M ${comboPos.x} ${comboPos.y} L ${endX} ${keyPos.y}`
  }

  // If same X (vertical), just draw straight line
  if (Math.abs(comboPos.x - keyPos.x) < 1) {
    const dir = keyPos.y > comboPos.y ? 1 : -1
    const endY = keyPos.y - dir * ARROW_LENGTH
    return `M ${comboPos.x} ${comboPos.y} L ${keyPos.x} ${endY}`
  }

  // Final segment is always vertical, shorten it
  const dir = keyPos.y > comboPos.y ? 1 : -1
  const endY = keyPos.y - dir * ARROW_LENGTH

  if (!routing || !routing.routeOutside) {
    const midY = (comboPos.y + keyPos.y) / 2
    return `M ${comboPos.x} ${comboPos.y} L ${comboPos.x} ${midY} L ${keyPos.x} ${midY} L ${keyPos.x} ${endY}`
  }

  const routeY = routing.routeY
  return `M ${comboPos.x} ${comboPos.y} L ${comboPos.x} ${routeY} L ${keyPos.x} ${routeY} L ${keyPos.x} ${endY}`
}

export function findNearestKeyIndex(layout, pixelPosition) {
  let minDist = Infinity
  let nearestIdx = 0

  layout.forEach((key, i) => {
    const center = getKeyCenter(key)
    const dist = Math.hypot(center.x - pixelPosition.x, center.y - pixelPosition.y)
    if (dist < minDist) {
      minDist = dist
      nearestIdx = i
    }
  })

  return nearestIdx
}

export function isComboVisibleOnLayer(combo, activeLayer) {
  if (!combo.layers || combo.layers.length === 0) {
    return true
  }
  return combo.layers.includes(activeLayer)
}
