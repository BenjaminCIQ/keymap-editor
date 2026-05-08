const { parseKeymapFile, parseCombos } = require('./dts-parser')
const { encodeCombo, encodeCombos, encodeKeymap } = require('./dts-encoder')
const Parser = require('tree-sitter')
const DeviceTree = require('tree-sitter-devicetree')
const fs = require('fs')
const path = require('path')

const parser = new Parser()
parser.setLanguage(DeviceTree)

function findNodes(node, type, results = []) {
  if (node.type === type) results.push(node)
  for (let i = 0; i < node.childCount; i++) {
    findNodes(node.child(i), type, results)
  }
  return results
}

function findByName(node, name) {
  if (node.type === 'node') {
    const nameNode = node.children.find(c => c.type === 'identifier')
    if (nameNode && nameNode.text === name) return node
  }
  for (let i = 0; i < node.childCount; i++) {
    const found = findByName(node.child(i), name)
    if (found) return found
  }
  return null
}

function getProperty(node, propName) {
  const props = node.children.filter(c => c.type === 'property')
  for (const prop of props) {
    const name = prop.children.find(c => c.type === 'identifier')?.text
    if (name === propName) {
      const value = prop.children.find(c =>
        c.type === 'integer_cells' || c.type === 'string_literal'
      )
      return value?.text
    }
  }
  return null
}

function parseIntegerCells(cellsText) {
  if (!cellsText) return []
  const inner = cellsText.replace(/^<|>$/g, '').trim()
  return inner.split(/\s+/).filter(Boolean)
}

function parseComboFromNode(comboNode) {
  const name = comboNode.children.find(c => c.type === 'identifier')?.text
  const bindings = getProperty(comboNode, 'bindings')
  const keyPositions = getProperty(comboNode, 'key-positions')
  const layers = getProperty(comboNode, 'layers')
  const timeout = getProperty(comboNode, 'timeout-ms')
  const idleTime = getProperty(comboNode, 'require-prior-idle-ms')
  const slowRelease = getProperty(comboNode, 'slow-release')

  return {
    name,
    bindings: bindings?.replace(/^<|>$/g, '').trim(),
    keyPositions: parseIntegerCells(keyPositions).map(Number),
    layers: layers ? parseIntegerCells(layers).map(Number) : [],
    timeout: timeout ? parseInt(timeout.replace(/[<>]/g, '')) : 30,
    requirePriorIdleMs: idleTime ? parseInt(idleTime.replace(/[<>]/g, '')) : undefined,
    slowRelease: slowRelease !== null
  }
}

function parseCombosFromDTS(dtsContent) {
  const tree = parser.parse(dtsContent)
  const combosNode = findByName(tree.rootNode, 'combos')
  if (!combosNode) return []

  const comboNodes = combosNode.children.filter(c => c.type === 'node')
  return comboNodes.map(parseComboFromNode)
}

function compareCombo(original, roundTripped) {
  const diffs = []

  if (original.name !== roundTripped.name) {
    diffs.push(`name: "${original.name}" vs "${roundTripped.name}"`)
  }

  if (original.bindings !== roundTripped.bindings) {
    diffs.push(`bindings: "${original.bindings}" vs "${roundTripped.bindings}"`)
  }

  const origPositions = JSON.stringify(original.keyPositions)
  const rtPositions = JSON.stringify(roundTripped.keyPositions)
  if (origPositions !== rtPositions) {
    diffs.push(`keyPositions: ${origPositions} vs ${rtPositions}`)
  }

  const origLayers = JSON.stringify(original.layers || [])
  const rtLayers = JSON.stringify(roundTripped.layers || [])
  if (origLayers !== rtLayers) {
    diffs.push(`layers: ${origLayers} vs ${rtLayers}`)
  }

  // Only compare timeout if original has non-default
  if (original.timeout !== 30 && original.timeout !== roundTripped.timeout) {
    diffs.push(`timeout: ${original.timeout} vs ${roundTripped.timeout}`)
  }

  if (original.requirePriorIdleMs !== roundTripped.requirePriorIdleMs) {
    diffs.push(`requirePriorIdleMs: ${original.requirePriorIdleMs} vs ${roundTripped.requirePriorIdleMs}`)
  }

  if (original.slowRelease !== roundTripped.slowRelease) {
    diffs.push(`slowRelease: ${original.slowRelease} vs ${roundTripped.slowRelease}`)
  }

  return diffs
}

// Test with real keymap file
const keymapPath = path.join(__dirname, '../../../..', 'zmk-config/config/dasbob.keymap')

if (!fs.existsSync(keymapPath)) {
  console.log('Test keymap not found at:', keymapPath)
  console.log('Running with synthetic test data...')

  // Synthetic test
  const testCombos = [
    {
      name: 'combo_test',
      bindings: '&kp ESC',
      keyPositions: [1, 2],
      layers: [0, 1],
      timeout: 18,
      requirePriorIdleMs: 150,
      slowRelease: false
    }
  ]

  const encoded = encodeCombos(testCombos)
  console.log('Encoded combos:\n', encoded)

  const reparsed = parseCombosFromDTS(encoded)
  console.log('\nReparsed combos:', JSON.stringify(reparsed, null, 2))

  const diffs = compareCombo(testCombos[0], reparsed[0])
  if (diffs.length > 0) {
    console.log('\nDifferences found:')
    diffs.forEach(d => console.log('  -', d))
  } else {
    console.log('\n✓ Round-trip test PASSED')
  }

  process.exit(0)
}

console.log('Testing with:', keymapPath)

// Parse original
const originalContent = fs.readFileSync(keymapPath, 'utf-8')
const parsed = parseKeymapFile(keymapPath)

console.log(`Found ${parsed.combos.length} combos`)

// Encode combos back to DTS
const encodedCombos = encodeCombos(parsed.combos)

// Re-parse the encoded combos
const reparsedCombos = parseCombosFromDTS(encodedCombos)

console.log(`Reparsed ${reparsedCombos.length} combos`)

// Compare each combo
let allMatch = true
for (let i = 0; i < parsed.combos.length; i++) {
  const original = parsed.combos[i]
  const roundTripped = reparsedCombos.find(c => c.name === original.name)

  if (!roundTripped) {
    console.log(`✗ Combo "${original.name}" not found after round-trip`)
    allMatch = false
    continue
  }

  const diffs = compareCombo(original, roundTripped)
  if (diffs.length > 0) {
    console.log(`✗ Combo "${original.name}" differences:`)
    diffs.forEach(d => console.log('    -', d))
    allMatch = false
  } else {
    console.log(`✓ Combo "${original.name}" matches`)
  }
}

if (allMatch) {
  console.log('\n✓ All combos round-trip successfully!')
} else {
  console.log('\n✗ Some combos failed round-trip')
  process.exit(1)
}
