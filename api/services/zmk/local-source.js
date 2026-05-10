const childProcess = require('child_process')
const fs = require('fs')
const path = require('path')
const { parseKeymap: parseKeymapJson, parseKeyBinding } = require('./keymap')
const { parseKeymapFile } = require('./dts-parser')
const { updateKeymapBindings, updateKeymapCombos, updateLayerNames } = require('./keymap-updater')

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
        // Infer params from bindingCells and holdBinding
        if (b.bindingCells === 2) {
          if (b.compatible === 'zmk,behavior-hold-tap') {
            // Check holdBinding to determine hold param type
            // &mo = layer, &kp = keycode, &sk = keycode
            const holdBehavior = b.holdBinding?.match(/^&(\w+)/)?.[1]
            if (holdBehavior === 'mo' || holdBehavior === 'sl' || holdBehavior === 'to' || holdBehavior === 'tog') {
              params.push('layer', 'code')
            } else {
              // &kp, &sk, or other - treat as keycode
              params.push('code', 'code')
            }
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
          holdBinding: b.holdBinding,
          tapBinding: b.tapBinding,
          isCustom: true
        }
      })

      // Convert macros to behaviors
      const customMacros = (parsed.macros || []).map(m => {
        const params = []
        if (m.bindingCells === 1) {
          params.push('code')
        } else if (m.bindingCells === 2) {
          params.push('code', 'code')
        }

        // Check if it's an autoshift-style macro (name contains 'as')
        const isAutoshift = m.name?.toLowerCase().includes('as') ||
          m.compatible === 'zmk,behavior-macro-one-param' ||
          m.compatible === 'zmk,behavior-macro-two-param'

        return {
          code: `&${m.name}`,
          name: m.name,
          description: `Macro${m.bindingCells ? ` (${m.bindingCells} param)` : ''}`,
          params,
          isCustom: true,
          isMacro: true,
          isAutoshift: isAutoshift && m.bindingCells === 1
        }
      })

      return [...standardBehaviors, ...customBehaviors, ...customMacros]
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

  // For .keymap files, use in-place update to preserve behaviors, macros, etc.
  if (keymapFile && keymapFile.endsWith('.keymap')) {
    const keymapPath = path.join(configPath, keymapFile)
    if (fs.existsSync(keymapPath)) {
      try {
        let updatedCode
        console.log('Saving keymap to:', keymapPath)
        console.log('Layer names:', generatedKeymap.keymap.layer_names)

        // Update layer names (#defines and references)
        if (generatedKeymap.keymap.layer_names) {
          updatedCode = updateLayerNames(keymapPath, generatedKeymap.keymap.layer_names)
          fs.writeFileSync(keymapPath, updatedCode)
          console.log('Updated layer names')
        }

        // Update bindings (re-reads file to get latest)
        updatedCode = updateKeymapBindings(keymapPath, generatedKeymap.keymap)
        fs.writeFileSync(keymapPath, updatedCode)
        console.log('Updated bindings')

        // Then update combos if present (re-reads file to get latest)
        if (generatedKeymap.keymap.combos) {
          updatedCode = updateKeymapCombos(keymapPath, generatedKeymap.keymap.combos)
          fs.writeFileSync(keymapPath, updatedCode)
          console.log('Updated combos')
        }
      } catch (err) {
        console.error('In-place update failed, falling back to full rewrite:', err.message)
        fs.writeFileSync(keymapPath, generatedKeymap.code)
      }
    } else {
      fs.writeFileSync(keymapPath, generatedKeymap.code)
    }
  } else {
    fs.writeFileSync(path.join(configPath, keymapFile), generatedKeymap.code)
  }

  return childProcess.execFile('git', ['status'], { cwd: zmkPath }, callback)
}

module.exports = {
  loadBehaviors,
  loadKeycodes,
  loadLayout,
  loadKeymap,
  exportKeymap
}
