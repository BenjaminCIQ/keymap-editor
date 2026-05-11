const fs = require('fs')
const Parser = require('tree-sitter')
const DeviceTree = require('tree-sitter-devicetree')

const parser = new Parser()
parser.setLanguage(DeviceTree)

// Encode a parsed binding back to string (handles nested params like LA(F4))
function encodeBindValue(parsed) {
  if (typeof parsed === 'string') return parsed
  if (typeof parsed === 'number') return String(parsed)
  if (!parsed || parsed.value === undefined) return ''

  const params = (parsed.params || []).map(encodeBindValue)
  const paramString = params.length > 0 ? `(${params.join(',')})` : ''
  return parsed.value + paramString
}

function encodeKeyBinding(parsed) {
  if (typeof parsed === 'string') return parsed

  const { value, params } = parsed
  const encodedParams = (params || []).map(encodeBindValue)
  return `${value} ${encodedParams.join(' ')}`.trim()
}

/**
 * Updates only the layer bindings in a keymap file, preserving everything else.
 * This is a surgical update that maintains behaviors, macros, combos, comments, etc.
 */
function updateKeymapBindings(filePath, newKeymap) {
  const source = fs.readFileSync(filePath, 'utf8')
  const tree = parser.parse(source)
  const root = tree.rootNode

  // Find keymap node
  const keymapNode = findByName(root, 'keymap')
  if (!keymapNode) {
    throw new Error('Could not find keymap node in file')
  }

  // Find all layer nodes within keymap
  const layerNodes = keymapNode.children.filter(c => c.type === 'node')

  // Build list of replacements (work backwards to preserve positions)
  const replacements = []
  const deletions = []

  // Handle layer deletions (file has more layers than keymap)
  if (layerNodes.length > newKeymap.layers.length) {
    for (let i = newKeymap.layers.length; i < layerNodes.length; i++) {
      const layerNode = layerNodes[i]
      // Find full extent including preceding whitespace
      let start = layerNode.startIndex
      const end = layerNode.endIndex
      // Include preceding newlines/whitespace
      const beforeLayer = source.slice(0, start)
      const lastNewline = beforeLayer.lastIndexOf('\n')
      if (lastNewline >= 0 && beforeLayer.slice(lastNewline).trim() === '') {
        start = lastNewline
      }
      deletions.push({ start, end })
    }
  }

  // Update existing layers
  for (let i = 0; i < Math.min(layerNodes.length, newKeymap.layers.length); i++) {
    const layerNode = layerNodes[i]
    const newBindings = newKeymap.layers[i]

    // Find the bindings property in this layer
    const bindingsInfo = findBindingsProperty(layerNode, source)
    if (bindingsInfo) {
      const newBindingsText = formatBindings(newBindings, bindingsInfo.indent)
      replacements.push({
        start: bindingsInfo.start,
        end: bindingsInfo.end,
        text: newBindingsText
      })
    }
  }

  // Also handle layer names if they changed
  for (let i = 0; i < Math.min(layerNodes.length, (newKeymap.layer_names || []).length); i++) {
    const layerNode = layerNodes[i]
    const newName = newKeymap.layer_names[i]

    if (newName) {
      // Update display-name property
      const displayNameInfo = findDisplayNameProperty(layerNode, source)
      if (displayNameInfo) {
        replacements.push({
          start: displayNameInfo.valueStart,
          end: displayNameInfo.valueEnd,
          text: `"${newName}"`
        })
      }

      // Update layer node identifier (e.g., layer_Nav -> layer_NewName)
      const identNode = layerNode.children.find(c => c.type === 'identifier')
      if (identNode) {
        const newIdent = 'layer_' + newName.replace(/[^a-zA-Z0-9_]/g, '_')
        if (identNode.text !== newIdent) {
          replacements.push({
            start: identNode.startIndex,
            end: identNode.endIndex,
            text: newIdent
          })
        }
      }
    }
  }

  // Combine replacements and deletions, sort by position (descending)
  const allChanges = [
    ...replacements,
    ...deletions.map(d => ({ start: d.start, end: d.end, text: '' }))
  ]
  allChanges.sort((a, b) => b.start - a.start)

  // Apply changes
  let result = source
  for (const change of allChanges) {
    result = result.slice(0, change.start) + change.text + result.slice(change.end)
  }

  return result
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

function findBindingsProperty(layerNode, source) {
  const props = layerNode.children.filter(c => c.type === 'property')

  for (const prop of props) {
    const nameNode = prop.children.find(c => c.type === 'identifier')
    if (nameNode && nameNode.text === 'bindings') {
      // Find the integer_cells node which contains the actual bindings
      const cellsNode = prop.children.find(c => c.type === 'integer_cells')
      if (cellsNode) {
        // Determine indentation from the line
        const lineStart = source.lastIndexOf('\n', cellsNode.startIndex) + 1
        const indent = source.slice(lineStart, cellsNode.startIndex).match(/^\s*/)[0]

        return {
          start: cellsNode.startIndex,
          end: cellsNode.endIndex,
          indent: indent
        }
      }
    }
  }
  return null
}

function findDisplayNameProperty(layerNode, source) {
  const props = layerNode.children.filter(c => c.type === 'property')

  for (const prop of props) {
    const nameNode = prop.children.find(c => c.type === 'identifier')
    if (nameNode && nameNode.text === 'display-name') {
      const stringNode = prop.children.find(c => c.type === 'string_literal')
      if (stringNode) {
        return {
          valueStart: stringNode.startIndex,
          valueEnd: stringNode.endIndex
        }
      }
    }
  }
  return null
}

function formatBindings(bindings, baseIndent) {
  // Convert binding objects back to strings using proper encoder
  const bindingStrings = bindings.map(b => encodeKeyBinding(b))

  // Format with proper indentation, assuming ~10 bindings per row for split keyboards
  const rowSize = 10
  const lines = ['<']

  for (let i = 0; i < bindingStrings.length; i += rowSize) {
    const row = bindingStrings.slice(i, i + rowSize)
    lines.push(baseIndent + '    ' + row.join(' '))
  }

  lines.push(baseIndent + '>')

  return lines.join('\n')
}

/**
 * Encode a single combo to DTS format
 */
function encodeCombo(combo, indent = '        ') {
  const lines = []
  lines.push(`${indent}${combo.name} {`)
  lines.push(`${indent}    bindings = <${combo.bindings}>;`)
  lines.push(`${indent}    key-positions = <${combo.keyPositions.join(' ')}>;`)

  if (combo.layers && combo.layers.length > 0) {
    lines.push(`${indent}    layers = <${combo.layers.join(' ')}>;`)
  }

  if (combo.timeout && combo.timeout !== 30) {
    lines.push(`${indent}    timeout-ms = <${combo.timeout}>;`)
  }

  if (combo.requirePriorIdleMs) {
    lines.push(`${indent}    require-prior-idle-ms = <${combo.requirePriorIdleMs}>;`)
  }

  if (combo.slowRelease) {
    lines.push(`${indent}    slow-release;`)
  }

  lines.push(`${indent}};`)
  return lines.join('\n')
}

/**
 * Updates combos in a keymap file while preserving structure
 */
function updateKeymapCombos(filePath, newCombos) {
  const source = fs.readFileSync(filePath, 'utf8')
  const tree = parser.parse(source)
  const root = tree.rootNode

  // Find combos node
  const combosNode = findByName(root, 'combos')

  if (!combosNode && (!newCombos || newCombos.length === 0)) {
    return source
  }

  if (!combosNode && newCombos && newCombos.length > 0) {
    // Insert new combos section after "/ {"
    const rootMatch = source.match(/\/\s*\{/)
    if (rootMatch) {
      const insertPos = rootMatch.index + rootMatch[0].length
      const combosSection = '\n    combos {\n        compatible = "zmk,combos";\n\n' +
        newCombos.map(c => encodeCombo(c)).join('\n\n') +
        '\n    };\n'
      return source.slice(0, insertPos) + combosSection + source.slice(insertPos)
    }
    return source
  }

  // Replace entire combos section content
  const comboChildren = combosNode.children.filter(c => c.type === 'node')

  if (comboChildren.length === 0 && newCombos.length === 0) {
    return source
  }

  // Find the range to replace (all combo nodes)
  let replaceStart = null
  let replaceEnd = null

  for (const child of comboChildren) {
    if (replaceStart === null || child.startIndex < replaceStart) {
      replaceStart = child.startIndex
    }
    if (replaceEnd === null || child.endIndex > replaceEnd) {
      replaceEnd = child.endIndex
    }
  }

  if (replaceStart === null) {
    // No existing combos, find insert point after compatible line
    const compatProp = combosNode.children.find(c =>
      c.type === 'property' &&
      c.children.some(n => n.type === 'identifier' && n.text === 'compatible')
    )
    if (compatProp) {
      const insertPos = compatProp.endIndex
      const newCombosText = '\n' + newCombos.map(c => encodeCombo(c)).join('\n\n')
      return source.slice(0, insertPos) + newCombosText + source.slice(insertPos)
    }
    return source
  }

  // Build new combos text
  const newCombosText = newCombos.map(c => encodeCombo(c)).join('\n\n')

  return source.slice(0, replaceStart) + newCombosText + source.slice(replaceEnd)
}

/**
 * Parse layer #define mappings from source
 * Returns array of { name, index, line, start, end }
 */
function parseLayerDefines(source) {
  const allDefines = []
  const defineRegex = /^#define\s+(\w+)\s+(\d+)\s*$/gm
  let match
  while ((match = defineRegex.exec(source)) !== null) {
    const index = parseInt(match[2])
    allDefines.push({
      name: match[1],
      index,
      fullMatch: match[0],
      start: match.index,
      end: match.index + match[0].length
    })
  }

  // Find layer defines: look for consecutive indices starting from 0
  // Layer defines are typically short uppercase names (DEF, NAV, FN, NUM, SYS, MOUSE)
  const layerDefines = allDefines.filter(d => {
    // Must be short name (not ZMK_POINTING_DEFAULT_MOVE_VAL style)
    if (d.name.length > 10) return false
    // Must not contain underscore-separated words
    if (d.name.includes('_') && d.name.split('_').length > 2) return false
    return true
  })

  // Sort by index and verify sequential from 0
  layerDefines.sort((a, b) => a.index - b.index)

  // Only keep if indices are 0, 1, 2, 3...
  const result = []
  for (let i = 0; i < layerDefines.length; i++) {
    if (layerDefines[i].index === i) {
      result.push(layerDefines[i])
    } else {
      break
    }
  }

  return result
}

/**
 * Updates layer names in #defines and all references throughout the file
 */
function updateLayerNames(filePath, newLayerNames) {
  let source = fs.readFileSync(filePath, 'utf8')
  const oldDefines = parseLayerDefines(source)

  if (oldDefines.length === 0) return source

  // Build rename map: old name -> new name
  const renames = {}
  for (let i = 0; i < Math.min(oldDefines.length, newLayerNames.length); i++) {
    const oldName = oldDefines[i].name
    const newName = newLayerNames[i]?.toUpperCase().replace(/[^A-Z0-9_]/g, '_') || oldName
    if (oldName !== newName) {
      renames[oldName] = newName
    }
  }

  if (Object.keys(renames).length === 0) return source

  // Update #define lines (work backwards to preserve positions)
  const defineChanges = []
  for (let i = 0; i < Math.min(oldDefines.length, newLayerNames.length); i++) {
    const def = oldDefines[i]
    const newName = newLayerNames[i]?.toUpperCase().replace(/[^A-Z0-9_]/g, '_')
    if (newName && def.name !== newName) {
      defineChanges.push({
        start: def.start,
        end: def.end,
        text: `#define ${newName} ${def.index}`
      })
    }
  }

  // Apply define changes first (backwards)
  defineChanges.sort((a, b) => b.start - a.start)
  for (const change of defineChanges) {
    source = source.slice(0, change.start) + change.text + source.slice(change.end)
  }

  // Now replace all references in the rest of the file
  // Match layer names as whole words (not part of other identifiers)
  for (const [oldName, newName] of Object.entries(renames)) {
    // Replace in bindings, combo layers, etc. - word boundary match
    const regex = new RegExp(`\\b${oldName}\\b`, 'g')
    source = source.replace(regex, newName)
  }

  return source
}

module.exports = {
  updateKeymapBindings,
  updateKeymapCombos,
  updateLayerNames
}
