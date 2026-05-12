import fuzzysort from 'fuzzysort'
import PropTypes from 'prop-types'
import { useCallback, useContext, useMemo, useState } from 'react'
import { SearchContext } from '../../providers'
import { getBehaviourParams } from '../../keymap'
import Icon from '../../Common/Icon'
import { getDynamicMacroLabel } from '../Keys/dynamicMacro'
import ComboSettings from './ComboSettings'
import styles from './styles.module.css'

function KeyEditor(props) {
  const { layout, keyIndex, combo, binding, onCancel, onUpdate, onUpdateCombo } = props
  const { sources, getSearchTargets } = useContext(SearchContext)

  const [selectedField, setSelectedField] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showComboSettings, setShowComboSettings] = useState(false)
  const [selectedMods, setSelectedMods] = useState({
    LS: false, LA: false, LC: false, LG: false,
    RS: false, RA: false, RC: false, RG: false
  })

  const isCombo = !!combo
  const behaviour = sources.behaviours?.[binding?.value]
  const behaviourParams = getBehaviourParams(binding?.params || [], behaviour)
  const displayValue = getDisplayValue(binding, sources, behaviour)

  const isHoldTap = behaviour?.description?.includes('hold-tap') ||
    behaviour?.code === '&lt' || behaviour?.code === '&mt' ||
    behaviourParams.length === 2

  const layoutBounds = useMemo(() => {
    if (!layout || layout.length === 0) return { minX: 0, minY: 0, maxX: 10, maxY: 4, width: 10, height: 4 }
    const xs = layout.map(k => k.x)
    const ys = layout.map(k => k.y)
    const minX = Math.min(...xs)
    const minY = Math.min(...ys)
    const maxX = Math.max(...xs) + 1
    const maxY = Math.max(...ys) + 1
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY }
  }, [layout])

  const highlightedKeys = useMemo(() => {
    if (isCombo && combo.keyPositions) {
      return new Set(combo.keyPositions)
    }
    if (keyIndex !== null && keyIndex !== undefined) {
      return new Set([keyIndex])
    }
    return new Set()
  }, [isCombo, combo, keyIndex])

  const pickerChoices = useMemo(() => {
    if (selectedField === null) return []
    if (selectedField === 'behaviour') {
      return getSearchTargets('behaviour') || []
    }
    const paramDef = behaviourParams[selectedField]
    if (!paramDef) return []
    return getSearchTargets(paramDef, binding?.value) || []
  }, [selectedField, behaviourParams, binding?.value, getSearchTargets])

  const filteredChoices = useMemo(() => {
    if (!searchQuery) return pickerChoices
    // Ensure code is string for fuzzysort
    const prepared = pickerChoices.map(c => ({ ...c, code: String(c.code) }))
    const results = fuzzysort.go(searchQuery, prepared, { key: 'code', limit: 100 })
    return results.map(r => ({ ...r.obj, _highlight: r }))
  }, [pickerChoices, searchQuery])

  const handleSelectField = useCallback((field) => {
    setSelectedField(field)
    setSearchQuery('')
    // Parse existing modifiers from current param value
    if (typeof field === 'number') {
      const paramValue = binding?.params?.[field]
      const val = typeof paramValue === 'object' ? paramValue.value : paramValue
      const mods = parseModifiers(val || '')
      setSelectedMods(mods)
    } else {
      setSelectedMods({ LS: false, LA: false, LC: false, LG: false, RS: false, RA: false, RC: false, RG: false })
    }
  }, [binding])

  const toggleMod = useCallback((mod) => {
    setSelectedMods(prev => ({ ...prev, [mod]: !prev[mod] }))
  }, [])

  const wrapWithMods = useCallback((keycode) => {
    const activeMods = Object.entries(selectedMods).filter(([_, v]) => v).map(([k]) => k)
    if (activeMods.length === 0) return keycode
    // Wrap from inside out: LS(LC(KEY)) means shift wraps ctrl
    let result = keycode
    for (const mod of activeMods.reverse()) {
      result = `${mod}(${result})`
    }
    return result
  }, [selectedMods])

  const handlePickValue = useCallback((choice) => {
    if (selectedField === 'behaviour') {
      onUpdate({ value: choice.code, params: [] })
    } else if (typeof selectedField === 'number') {
      const newParams = [...(binding?.params || [])]
      const wrappedCode = wrapWithMods(choice.code)
      newParams[selectedField] = { value: wrappedCode, params: [] }
      onUpdate({ ...binding, params: newParams })
    }
    setSelectedField(null)
    setSearchQuery('')
    setSelectedMods({ LS: false, LA: false, LC: false, LG: false, RS: false, RA: false, RC: false, RG: false })
  }, [selectedField, binding, onUpdate, wrapWithMods])

  const getActualParamType = (paramValue, paramDef) => {
    if (!paramValue) return paramDef
    const val = typeof paramValue === 'object' ? paramValue.value : paramValue

    // Check if it's a layer by name (not index - index could be anything)
    const layers = Object.values(sources.layer || {})
    if (layers.find(l => l.description === val || l.description?.toUpperCase() === String(val).toUpperCase())) {
      return 'layer'
    }

    // Check if it's a keycode
    if (sources.kc?.[val]) return 'code'

    // Check if it's a behavior
    if (sources.behaviours?.[val]) return 'behaviour'

    // For numeric values that match layer index, only call it layer if paramDef says so
    if (paramDef === 'layer' && sources.layer?.[val]) return 'layer'

    return paramDef
  }

  const getParamLabel = (paramDef, index, paramValue) => {
    const actualType = getActualParamType(paramValue, paramDef)
    const typeLabel = typeof actualType === 'string'
      ? actualType.charAt(0).toUpperCase() + actualType.slice(1).replace('our', 'or')
      : 'Value'

    if (isHoldTap && behaviourParams.length === 2) {
      return { section: index === 0 ? 'HOLD' : 'TAP', type: typeLabel }
    }
    return { section: null, type: typeLabel }
  }

  const miniKeySize = 10
  const miniGap = 2

  return (
    <div className={styles.overlay} onClick={onCancel}>
      <div className={`${styles.dialog} ${selectedField !== null ? styles.dialogExpanded : ''}`} onClick={e => e.stopPropagation()}>
        <div className={styles.mainPanel}>
          {isCombo && (
            <button
              className={styles.settingsButton}
              onClick={() => setShowComboSettings(true)}
              title="Combo settings"
            >
              <Icon name="wrench" />
            </button>
          )}
          <div className={styles.preview}>
            <div
              className={styles.keyboardMini}
              style={{
                width: layoutBounds.width * (miniKeySize + miniGap),
                height: layoutBounds.height * (miniKeySize + miniGap),
                position: 'relative'
              }}
            >
              {layout && layout.map((key, i) => (
                <div
                  key={i}
                  className={`${styles.miniKey} ${highlightedKeys.has(i) ? styles.miniKeyTarget : ''}`}
                  style={{
                    position: 'absolute',
                    left: (key.x - layoutBounds.minX) * (miniKeySize + miniGap),
                    top: (key.y - layoutBounds.minY) * (miniKeySize + miniGap),
                    width: miniKeySize,
                    height: miniKeySize
                  }}
                />
              ))}
            </div>
            <div className={styles.arrow}>→</div>
            <div className={styles.keyLarge}>
              <span className={styles.behaviourLabel}>{binding?.value}</span>
              <span className={styles.keyValue}>{displayValue}</span>
            </div>
          </div>

          <div className={styles.section}>
            <span className={styles.label}>Behavior</span>
            <button
              className={`${styles.valueButton} ${selectedField === 'behaviour' ? styles.valueButtonSelected : ''}`}
              onClick={() => handleSelectField('behaviour')}
            >
              {binding?.value} | {behaviour?.name || behaviour?.description || 'Unknown'}
            </button>
          </div>

          <div className={styles.section}>
            <span className={styles.label}>Parameters</span>
            {behaviourParams.map((paramDef, i) => {
              const paramValue = binding?.params?.[i]
              const { section, type } = getParamLabel(paramDef, i, paramValue)
              return (
                <div key={i} className={styles.paramRow}>
                  {section && <span className={styles.paramSection}>{section}:</span>}
                  <div className={styles.paramIndex}>{i + 1}. {type}</div>
                  <button
                    className={`${styles.valueButton} ${selectedField === i ? styles.valueButtonSelected : ''}`}
                    onClick={() => handleSelectField(i)}
                  >
                    {formatParam(paramValue, sources, paramDef, behaviour, i) || 'Select...'}
                  </button>
                </div>
              )
            })}
            {behaviourParams.length === 0 && (
              <span className={styles.noParams}>No parameters</span>
            )}
          </div>

          <div className={styles.actions}>
            <button className={styles.applyButton} onClick={onCancel}>
              Apply
            </button>
            <button className={styles.cancelButton} onClick={onCancel}>
              Cancel
            </button>
          </div>
        </div>

        {selectedField !== null && (
          <div className={styles.pickerPanel}>
            <button className={styles.closeButton} onClick={() => setSelectedField(null)}>Close</button>
            {selectedField !== 'behaviour' && (
              <div className={styles.modifiersSection}>
                <div className={styles.modifiersLabel}>Modifiers</div>
                <div className={styles.modifiersGrid}>
                  {['LS', 'LA', 'LC', 'LG'].map(mod => (
                    <button
                      key={mod}
                      className={`${styles.modButton} ${selectedMods[mod] ? styles.modButtonActive : ''}`}
                      onClick={() => toggleMod(mod)}
                    >
                      {mod === 'LS' ? 'LSHFT' : mod === 'LA' ? 'LALT' : mod === 'LC' ? 'LCTRL' : 'LGUI'}
                    </button>
                  ))}
                  {['RS', 'RA', 'RC', 'RG'].map(mod => (
                    <button
                      key={mod}
                      className={`${styles.modButton} ${selectedMods[mod] ? styles.modButtonActive : ''}`}
                      onClick={() => toggleMod(mod)}
                    >
                      {mod === 'RS' ? 'RSHFT' : mod === 'RA' ? 'RALT' : mod === 'RC' ? 'RCTRL' : 'RGUI'}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className={styles.pickerHeader}>
              {selectedField === 'behaviour' ? 'Available Behaviors' : 'Available Keycodes'}
            </div>
            <div className={styles.searchBox}>
              <span className={styles.searchIcon}>Q</span>
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search..."
                autoFocus
              />
              {searchQuery && (
                <button className={styles.clearSearch} onClick={() => setSearchQuery('')}>×</button>
              )}
            </div>
            <ul className={styles.pickerList}>
              {filteredChoices.map((choice, i) => (
                <li
                  key={`${choice.code}-${i}`}
                  className={styles.pickerItem}
                  onClick={() => handlePickValue(choice)}
                >
                  <span className={styles.choiceCode}>{choice.code}</span>
                  <span className={styles.choiceDesc}>{choice.description || choice.name}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      {showComboSettings && combo && (
        <ComboSettings
          combo={combo}
          onUpdate={onUpdateCombo}
          onClose={() => setShowComboSettings(false)}
        />
      )}
    </div>
  )
}

function resolveBindingToKeycode(bindingStr, sources, depth = 0) {
  if (!bindingStr || depth > 5) return null

  // Direct keycode: "&kp SPACE" -> "SPACE"
  const kpMatch = bindingStr.match(/&kp\s+(\S+)/)
  if (kpMatch) {
    const code = sources.kc?.[kpMatch[1]]
    return code?.symbol || kpMatch[1]
  }

  // Behavior reference: "&spc_morph" -> look up its binding
  const behaviorMatch = bindingStr.match(/^&(\S+)/)
  if (behaviorMatch) {
    const behavior = sources.behaviours?.[bindingStr] || sources.behaviours?.[`&${behaviorMatch[1]}`]
    if (behavior?.holdBinding) {
      return resolveBindingToKeycode(behavior.holdBinding, sources, depth + 1)
    }
  }

  return null
}

function getDisplayValue(binding, sources, behaviour) {
  if (!binding || !binding.params || binding.params.length === 0) {
    return binding?.value?.replace(/^&/, '') || '?'
  }

  if (behaviour?.code === '&dm') {
    return getDynamicMacroLabel(binding.params)
  }

  // For custom hold-tap with internal tap binding, resolve it first
  if (behaviour?.tapBinding) {
    const resolved = resolveBindingToKeycode(behaviour.tapBinding, sources)
    if (resolved) return resolved
  }

  // For display, show last param (usually the tap/key value)
  const params = binding.params
  const lastParam = params[params.length - 1]
  const paramValue = typeof lastParam === 'object' ? lastParam.value : lastParam

  // Check keycodes
  const code = sources.kc?.[paramValue]
  if (code) {
    return code.symbol || paramValue
  }

  return paramValue || '?'
}

function formatParam(param, sources, paramDef, behaviour, paramIndex) {
  if (param === null || param === undefined) return null

  const paramValue = typeof param === 'object' ? param.value : param

  if (paramDef?.enum) {
    const enumChoice = paramDef.enum.find(choice => {
      const choiceCode = typeof choice === 'object' ? choice.code : choice
      return String(choiceCode) === String(paramValue)
    })
    if (enumChoice) {
      if (typeof enumChoice === 'object') {
        return `${enumChoice.code} | ${enumChoice.description || enumChoice.name || enumChoice.code}`
      }
      return String(enumChoice)
    }
  }

  // For hold-tap hold param (index 0), resolve from holdBinding if available
  if (paramIndex === 0 && behaviour?.holdBinding) {
    const resolved = resolveBindingToKeycode(behaviour.holdBinding, sources)
    if (resolved) {
      const code = sources.kc?.[resolved]
      return code ? `${resolved} | ${code.description}` : resolved
    }
  }

  // For hold-tap tap param (index 1), resolve from tapBinding if available
  if (paramIndex === 1 && behaviour?.tapBinding) {
    const resolved = resolveBindingToKeycode(behaviour.tapBinding, sources)
    if (resolved) {
      const code = sources.kc?.[resolved]
      return code ? `${resolved} | ${code.description}` : resolved
    }
  }

  // Try layer name match first (works for any paramDef)
  const layers = Object.values(sources.layer || {})
  const layerByName = layers.find(l => l.description === paramValue || l.description?.toUpperCase() === String(paramValue).toUpperCase())
  if (layerByName) {
    return `${paramValue} | Layer ${layerByName.code}`
  }

  // Only match numeric layer index if paramDef is explicitly 'layer'
  if (paramDef === 'layer') {
    const layerByIndex = sources.layer?.[paramValue]
    if (layerByIndex) {
      return `${paramValue} | ${layerByIndex.description}`
    }
  }

  // Check keycodes
  const code = sources.kc?.[paramValue]
  if (code) {
    return `${paramValue} | ${code.description || paramValue}`
  }

  // Check behaviors
  const behav = sources.behaviours?.[paramValue]
  if (behav) {
    return `${paramValue} | ${behav.name || behav.description}`
  }

  return String(paramValue)
}

function parseModifiers(value) {
  const mods = { LS: false, LA: false, LC: false, LG: false, RS: false, RA: false, RC: false, RG: false }
  if (!value) return mods

  const modPattern = /^(LS|LA|LC|LG|RS|RA|RC|RG)\(/
  let remaining = value
  while (modPattern.test(remaining)) {
    const match = remaining.match(modPattern)
    if (match) {
      mods[match[1]] = true
      remaining = remaining.slice(match[0].length, -1) // Remove mod( and trailing )
    } else {
      break
    }
  }
  return mods
}

KeyEditor.propTypes = {
  layout: PropTypes.array,
  keyIndex: PropTypes.number,
  combo: PropTypes.object,
  binding: PropTypes.shape({
    value: PropTypes.string,
    params: PropTypes.array
  }),
  onCancel: PropTypes.func.isRequired,
  onUpdate: PropTypes.func.isRequired,
  onUpdateCombo: PropTypes.func
}

export default KeyEditor
