const childProcess = require('child_process')
const fs = require('fs')
const path = require('path')
const { parseKeymap: parseKeymapJson, parseKeyBinding } = require('./keymap')
const { parseKeymapFile } = require('./dts-parser')

function getZmkPath() {
  return process.env.ZMK_CONFIG_PATH || path.join(__dirname, '..', '..', '..', 'zmk-config')
}

function getLayoutFile() {
  return process.env.LOCAL_LAYOUT_FILE || 'info.json'
}

function getKeymapFile() {
  return process.env.LOCAL_KEYMAP_FILE
}

const EMPTY_KEYMAP = {
  keyboard: 'unknown',
  keymap: 'unknown',
  layout: 'unknown',
  layer_names: ['default'],
  layers: [[]]
}

function loadBehaviors() {
  const standardBehaviors = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'zmk-behaviors.json')))

  // Load custom behaviors from keymap if available
  const zmkPath = getZmkPath()
  const keymapFile = findKeymapFile()

  if (keymapFile && keymapFile.endsWith('.keymap')) {
    const keymapPath = path.join(zmkPath, 'config', keymapFile)
    if (fs.existsSync(keymapPath)) {
      const parsed = parseKeymapFile(keymapPath)

      // Convert custom behaviors to standard format
      const customBehaviors = (parsed.behaviors || []).map(b => {
        const params = []
        // Infer params from bindingCells
        if (b.bindingCells === 2) {
          // Common pattern: hold-tap, mod-tap have 2 cells
          if (b.compatible === 'zmk,behavior-hold-tap') {
            params.push('behaviour', 'code')
          } else {
            params.push('code', 'code')
          }
        } else if (b.bindingCells === 1) {
          params.push('code')
        }

        return {
          code: `&${b.name}`,
          name: b.name,
          description: `Custom ${b.compatible?.replace('zmk,behavior-', '') || 'behavior'}`,
          params,
          isCustom: true
        }
      })

      return [...standardBehaviors, ...customBehaviors]
    }
  }

  return standardBehaviors
}

function loadKeycodes() {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'zmk-keycodes.json')))
}

function loadLayout (layout) {
  const layoutPath = path.join(getZmkPath(), 'config', getLayoutFile())
  const layoutData = JSON.parse(fs.readFileSync(layoutPath))

  if (!layoutData.layouts) {
    return layoutData.layout
  }

  // Try requested layout, then common defaults
  const layoutNames = [layout, 'LAYOUT', 'default_layout', Object.keys(layoutData.layouts)[0]]
  for (const name of layoutNames) {
    if (name && layoutData.layouts[name]) {
      return layoutData.layouts[name].layout
    }
  }

  throw new Error('No layout found in ' + layoutPath)
}

function findKeymapFile () {
  const configuredFile = getKeymapFile()
  if (configuredFile) return configuredFile
  const files = fs.readdirSync(path.join(getZmkPath(), 'config'))
  return files.find(file => file.endsWith('.keymap'))
}

function loadKeymap () {
  const zmkPath = getZmkPath()
  const keymapFile = findKeymapFile()

  if (keymapFile && keymapFile.endsWith('.keymap')) {
    // Use DTS parser for .keymap files
    const keymapPath = path.join(zmkPath, 'config', keymapFile)
    if (fs.existsSync(keymapPath)) {
      const parsed = parseKeymapFile(keymapPath)
      // Convert to format expected by frontend (parse binding strings to objects)
      return {
        layers: parsed.keymap.layers.map(layer =>
          layer.map(binding => parseKeyBinding(binding))
        ),
        layer_names: parsed.keymap.layerNames,
        combos: parsed.combos,
        behaviors: parsed.behaviors,
        conditionalLayers: parsed.conditionalLayers
      }
    }
  }

  // Fallback to JSON
  const jsonPath = path.join(zmkPath, 'config', 'keymap.json')
  const keymapContent = fs.existsSync(jsonPath)
    ? JSON.parse(fs.readFileSync(jsonPath))
    : EMPTY_KEYMAP

  return parseKeymapJson(keymapContent)
}

function exportKeymap (generatedKeymap, flash, callback) {
  const zmkPath = getZmkPath()
  const configPath = path.join(zmkPath, 'config')
  const keymapFile = findKeymapFile()

  fs.existsSync(configPath) || fs.mkdirSync(configPath)
  fs.writeFileSync(path.join(configPath, 'keymap.json'), generatedKeymap.json)
  fs.writeFileSync(path.join(configPath, keymapFile), generatedKeymap.code)

  return childProcess.execFile('git', ['status'], { cwd: zmkPath }, callback)
}

module.exports = {
  loadBehaviors,
  loadKeycodes,
  loadLayout,
  loadKeymap,
  exportKeymap
}
