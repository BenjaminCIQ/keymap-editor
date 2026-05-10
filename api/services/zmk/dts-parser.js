const Parser = require('tree-sitter')
const DeviceTree = require('tree-sitter-devicetree')
const fs = require('fs')

const parser = new Parser()
parser.setLanguage(DeviceTree)

// ============ AST HELPERS ============

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

function getProperty(node, propName, collectAll = false) {
  const props = node.children.filter(c => c.type === 'property')
  for (const prop of props) {
    const name = prop.children.find(c => c.type === 'identifier')?.text
    if (name === propName) {
      if (collectAll) {
        // Collect all value nodes (for properties like bindings with multiple cells)
        const values = prop.children.filter(c =>
          c.type === 'integer_cells' || c.type === 'string_literal'
        )
        return values.map(v => v.text)
      }
      const value = prop.children.find(c =>
        c.type === 'integer_cells' || c.type === 'string_literal'
      )
      return value?.text
    }
  }
  return collectAll ? [] : null
}

function parseIntegerCells(cellsText) {
  if (!cellsText) return []
  const inner = cellsText.replace(/^<|>$/g, '').trim()
  return inner.split(/\s+/).filter(Boolean)
}

// ============ BINDINGS PARSER ============

function parseBindings(bindingsText) {
  if (!bindingsText) return []

  let inner = bindingsText.replace(/^<|>$/g, '').trim()

  // Remove comments
  inner = inner.replace(/\/\/[^\n]*/g, '')
  inner = inner.replace(/\/\*[\s\S]*?\*\//g, '')

  // Remove ASCII art
  inner = inner.replace(/^[╭╰├╮╯┤─┬┴┼│]+.*$/gm, '')

  // Split on & to find bindings
  const bindings = []
  const parts = inner.split(/(?=&)/)

  for (const part of parts) {
    const trimmed = part.trim()
    if (trimmed.startsWith('&')) {
      bindings.push(trimmed.replace(/\s+/g, ' '))
    }
  }

  return bindings
}

// ============ COMBO PARSER ============

function parseCombo(comboNode) {
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

function parseCombos(rootNode) {
  const combosNode = findByName(rootNode, 'combos')
  if (!combosNode) return []

  const comboNodes = combosNode.children.filter(c => c.type === 'node')
  return comboNodes.map(parseCombo)
}

// ============ LAYER PARSER ============

function parseLayer(layerNode) {
  const name = layerNode.children.find(c => c.type === 'identifier')?.text
  const displayName = getProperty(layerNode, 'display-name')?.replace(/"/g, '')
  const bindings = getProperty(layerNode, 'bindings')

  return {
    name,
    displayName: displayName || name,
    bindings: parseBindings(bindings)
  }
}

function parseKeymap(rootNode) {
  const keymapNode = findByName(rootNode, 'keymap')
  if (!keymapNode) return { layers: [], layerNames: [] }

  const layerNodes = keymapNode.children.filter(c => c.type === 'node')
  const layers = layerNodes.map(parseLayer)

  return {
    layers: layers.map(l => l.bindings),
    layerNames: layers.map(l => l.displayName)
  }
}

// ============ BEHAVIOR PARSER ============

function parseBehavior(behaviorNode) {
  const name = behaviorNode.children.find(c => c.type === 'identifier')?.text
  const compatible = getProperty(behaviorNode, 'compatible')?.replace(/"/g, '')
  const bindingCells = getProperty(behaviorNode, '#binding-cells')
  const bindingsArr = getProperty(behaviorNode, 'bindings', true) // collect all
  const flavor = getProperty(behaviorNode, 'flavor')?.replace(/"/g, '')
  const tappingTerm = getProperty(behaviorNode, 'tapping-term-ms')
  const quickTap = getProperty(behaviorNode, 'quick-tap-ms')

  // Parse bindings - for hold-tap, two separate cells: <&hold>, <&tap>
  let holdBinding = null
  let tapBinding = null
  let bindingsStr = bindingsArr.map(b => b.replace(/^<|>$/g, '').trim()).join(', ')

  if (compatible === 'zmk,behavior-hold-tap' && bindingsArr.length >= 2) {
    holdBinding = bindingsArr[0]?.replace(/^<|>$/g, '').trim()
    tapBinding = bindingsArr[1]?.replace(/^<|>$/g, '').trim()
  } else if (compatible === 'zmk,behavior-mod-morph' && bindingsArr.length >= 2) {
    // mod-morph: first is normal, second is shifted
    holdBinding = bindingsArr[0]?.replace(/^<|>$/g, '').trim()
    tapBinding = bindingsArr[1]?.replace(/^<|>$/g, '').trim()
  } else if (bindingsArr.length >= 1) {
    holdBinding = bindingsArr[0]?.replace(/^<|>$/g, '').trim()
    if (bindingsArr.length >= 2) {
      tapBinding = bindingsArr[1]?.replace(/^<|>$/g, '').trim()
    }
  }

  return {
    name,
    compatible,
    bindingCells: bindingCells ? parseInt(bindingCells.replace(/[<>]/g, '')) : undefined,
    bindings: bindingsStr,
    holdBinding,
    tapBinding,
    flavor,
    tappingTermMs: tappingTerm ? parseInt(tappingTerm.replace(/[<>]/g, '')) : undefined,
    quickTapMs: quickTap ? parseInt(quickTap.replace(/[<>]/g, '')) : undefined
  }
}

function parseBehaviors(rootNode) {
  const behaviorsNode = findByName(rootNode, 'behaviors')
  if (!behaviorsNode) return []

  const behaviorNodes = behaviorsNode.children.filter(c => c.type === 'node')
  return behaviorNodes.map(parseBehavior)
}

// ============ MACRO PARSER ============

function parseMacro(macroNode) {
  const name = macroNode.children.find(c => c.type === 'identifier')?.text
  const compatible = getProperty(macroNode, 'compatible')?.replace(/"/g, '')
  const bindingCells = getProperty(macroNode, '#binding-cells')

  return {
    name,
    compatible,
    bindingCells: bindingCells ? parseInt(bindingCells.replace(/[<>]/g, '')) : 0,
    isMacro: true
  }
}

function parseMacros(rootNode) {
  const macrosNode = findByName(rootNode, 'macros')
  if (!macrosNode) return []

  const macroNodes = macrosNode.children.filter(c => c.type === 'node')
  return macroNodes.map(parseMacro)
}

// ============ CONDITIONAL LAYERS ============

function parseConditionalLayers(rootNode) {
  const condNode = findByName(rootNode, 'conditional_layers')
  if (!condNode) return []

  const layerNodes = condNode.children.filter(c => c.type === 'node')
  return layerNodes.map(node => {
    const name = node.children.find(c => c.type === 'identifier')?.text
    const ifLayers = getProperty(node, 'if-layers')
    const thenLayer = getProperty(node, 'then-layer')

    return {
      name,
      ifLayers: ifLayers ? parseIntegerCells(ifLayers).map(Number) : [],
      thenLayer: thenLayer ? parseInt(thenLayer.replace(/[<>]/g, '')) : undefined
    }
  })
}

// ============ MAIN API ============

function parseKeymapSource(source) {
  const tree = parser.parse(source)
  const root = tree.rootNode

  return {
    combos: parseCombos(root),
    keymap: parseKeymap(root),
    behaviors: parseBehaviors(root),
    macros: parseMacros(root),
    conditionalLayers: parseConditionalLayers(root),
    _tree: tree // Keep for source location tracking
  }
}

function parseKeymapFile(filePath) {
  const source = fs.readFileSync(filePath, 'utf8')
  const result = parseKeymapSource(source)
  result._source = source
  result._filePath = filePath
  return result
}

module.exports = {
  parseKeymapSource,
  parseKeymapFile,
  parseCombos,
  parseKeymap,
  parseBehaviors,
  parseConditionalLayers
}
