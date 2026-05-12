import filter from 'lodash/filter'
import get from 'lodash/get'
import isEmpty from 'lodash/isEmpty'
import keyBy from 'lodash/keyBy'
import times from 'lodash/times'
import PropTypes from 'prop-types'
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

import KeyboardLayout from './KeyboardLayout'
import LayerSelector from './LayerSelector'
import ComboOverlay from './ComboOverlay'
import KeyEditor from './KeyEditor'
import Icon from '../Common/Icon'
import { isComboVisibleOnLayer } from './combo-utils'
import { getKeyBoundingBox } from '../key-units'
import { DefinitionsContext, SearchContext } from '../providers'

function Keyboard(props) {
  const { layout, keymap, onUpdate } = props
  const [activeLayer, setActiveLayer] = useState(0)
  const [showCombos, setShowCombos] = useState(true)
  const [selectedCombo, setSelectedCombo] = useState(null)
  const {keycodes, behaviours} = useContext(DefinitionsContext)

  const availableLayers = useMemo(() => isEmpty(keymap) ? [] : (
    keymap.layers.map((_, i) => ({
      code: i,
      description: keymap.layer_names[i] || `Layer ${i}`
    }))
  ), [keymap])

  const sources = useMemo(() => ({
    kc: keycodes.indexed,
    code: keycodes.indexed,
    mod: keyBy(filter(keycodes, 'isModifier'), 'code'),
    behaviours: behaviours.indexed,
    layer: keyBy(availableLayers, 'code')
  }), [keycodes, behaviours, availableLayers])

  // TODO: this may be unnecessary
  const isReady = useMemo(() => function() {
    return (
      Object.keys(keycodes.indexed).length > 0 &&
      Object.keys(behaviours.indexed).length > 0 &&
      get(keymap, 'layers.length', 0) > 0
    )
  }, [keycodes, behaviours, keymap])

  const searchTargets = useMemo(() => {
    return {
      behaviour: behaviours,
      layer: availableLayers,
      mod: filter(keycodes, 'isModifier'),
      code: keycodes
    }
  }, [behaviours, keycodes, availableLayers])

  const getSearchTargets = useMemo(() => function (param, behaviour) {
    // Special case for behaviour commands which can dynamically add another
    // parameter that isn't defined at the root level of the behaviour.
    // Currently this is just `&bt BT_SEL` and is only represented as an enum.
    if (param.enum) {
      return param.enum.map(v => typeof v === 'object' ? v : { code: v })
    }

    if (param === 'command') {
      return get(sources, ['behaviours', behaviour, 'commands'], [])
    }

    if (!searchTargets[param]) {
      console.log('cannot find target for', param)
    }

    return searchTargets[param]
  }, [searchTargets, sources])

  const boundingBox = useMemo(() => function () {
    return layout.map(key => getKeyBoundingBox(
      { x: key.x, y: key.y },
      { u: key.u || key.w || 1, h: key.h || 1 },
      { x: key.rx, y: key.ry, a: key.r }
    )).reduce(({ x, y }, { max }) => ({
      x: Math.max(x, max.x),
      y: Math.max(y, max.y)
    }), { x: 0, y: 0 })
  }, [layout])

  const getWrapperStyle = useMemo(() => function () {
    const bbox = boundingBox()
    return {
      width: `${bbox.x}px`,
      height: `${bbox.y}px`,
      margin: '0 auto',
      padding: '40px'
    }
  }, [boundingBox])

  const handleCreateLayer = useMemo(() => function () {
    const layer = keymap.layers.length
    const binding = '&trans'
    const makeKeycode = () => ({ value: binding, params: [] })

    const newLayer = times(layout.length, makeKeycode)
    const updatedLayerNames = [ ...keymap.layer_names, `Layer #${layer}` ]
    const layers = [ ...keymap.layers, newLayer ]

    onUpdate({ ...keymap, layer_names: updatedLayerNames, layers })
  }, [keymap, layout, onUpdate])

  const handleUpdateLayer = useMemo(() => function(layerIndex, updatedLayer) {
    const original = keymap.layers
    const layers = [
      ...original.slice(0, layerIndex),
      updatedLayer,
      ...original.slice(layerIndex + 1)
    ]

    onUpdate({ ...keymap, layers })
  }, [keymap, onUpdate])

  const handleRenameLayer = useMemo(() => function (layerName) {
    const layer_names = [
      ...keymap.layer_names.slice(0, activeLayer),
      layerName,
      ...keymap.layer_names.slice(activeLayer + 1)
    ]

    onUpdate({ ...keymap, layer_names })
  }, [keymap, activeLayer, onUpdate])

  const handleDeleteLayer = useMemo(() => function (layerIndex) {
    const layer_names = [...keymap.layer_names]
    layer_names.splice(layerIndex, 1)

    const layers = [...keymap.layers]
    layers.splice(layerIndex, 1)

    if (activeLayer > layers.length - 1) {
      setActiveLayer(Math.max(0, layers.length - 1))
    }

    onUpdate({ ...keymap, layers, layer_names })
  }, [keymap, activeLayer, setActiveLayer, onUpdate])

  const handleReorderLayer = useCallback((fromIndex, toIndex) => {
    const layer_names = [...keymap.layer_names]
    const layers = [...keymap.layers]

    const [movedName] = layer_names.splice(fromIndex, 1)
    layer_names.splice(toIndex, 0, movedName)

    const [movedLayer] = layers.splice(fromIndex, 1)
    layers.splice(toIndex, 0, movedLayer)

    let newActiveLayer = activeLayer
    if (activeLayer === fromIndex) {
      newActiveLayer = toIndex
    } else if (fromIndex < activeLayer && toIndex >= activeLayer) {
      newActiveLayer = activeLayer - 1
    } else if (fromIndex > activeLayer && toIndex <= activeLayer) {
      newActiveLayer = activeLayer + 1
    }
    setActiveLayer(newActiveLayer)

    onUpdate({ ...keymap, layers, layer_names })
  }, [keymap, activeLayer, setActiveLayer, onUpdate])

  const visibleCombos = useMemo(() => {
    if (!keymap.combos) return []
    return keymap.combos.filter(combo => isComboVisibleOnLayer(combo, activeLayer))
  }, [keymap.combos, activeLayer])

  const handleSelectCombo = useCallback((combo) => {
    if (combo === null) {
      setSelectedCombo(null)
      return
    }
    setSelectedCombo(prev => prev?.name === combo.name ? null : combo)
  }, [])

  const handleUpdateCombo = useCallback((updatedCombo) => {
    if (!keymap.combos) return
    const matchName = updatedCombo._originalName || updatedCombo.name
    const { _originalName, ...cleanCombo } = updatedCombo
    const combos = keymap.combos.map(c =>
      c.name === matchName ? cleanCombo : c
    )
    onUpdate({ ...keymap, combos })
    setEditingCombo(prev => prev?.name === matchName ? cleanCombo : prev)
    setSelectedCombo(prev => prev?.name === matchName ? cleanCombo : prev)
  }, [keymap, onUpdate])

  const handleToggleCombos = useCallback(() => {
    setShowCombos(prev => {
      if (prev) setSelectedCombo(null)
      return !prev
    })
  }, [])

  const handleDeleteCombo = useCallback((combo) => {
    if (!keymap.combos) return
    const combos = keymap.combos.filter(c => c.name !== combo.name)
    onUpdate({ ...keymap, combos })
    setSelectedCombo(null)
  }, [keymap, onUpdate])

  const [dragHighlightedKeys, setDragHighlightedKeys] = useState(new Set())
  const [editingKeyIndex, setEditingKeyIndex] = useState(null)
  const [editingCombo, setEditingCombo] = useState(null)
  const [comboCreationKeys, setComboCreationKeys] = useState(new Set())
  const ctrlHeldRef = useRef(false)

  const handleHighlightKeys = useCallback((keys) => {
    setDragHighlightedKeys(keys)
  }, [])

  const raisedKeys = useMemo(() => {
    if (comboCreationKeys.size > 0) return comboCreationKeys
    if (!selectedCombo) return new Set()
    return new Set(selectedCombo.keyPositions.filter(i => i >= 0 && i < layout.length))
  }, [selectedCombo, layout.length, comboCreationKeys])

  const handleKeyClick = useCallback((keyIndex, event) => {
    if (event?.ctrlKey || ctrlHeldRef.current) {
      setComboCreationKeys(prev => {
        const next = new Set(prev)
        if (next.has(keyIndex)) {
          next.delete(keyIndex)
        } else {
          next.add(keyIndex)
        }
        return next
      })
      return
    }
    setEditingKeyIndex(keyIndex)
    setEditingCombo(null)
  }, [])

  const handleEditCombo = useCallback((combo) => {
    setEditingCombo(combo)
    setEditingKeyIndex(null)
  }, [])

  const createNewCombo = useCallback((keyPositions) => {
    const existingNames = (keymap.combos || []).map(c => c.name)
    let n = 1
    while (existingNames.includes(`combo_${n}`)) n++
    const newCombo = {
      name: `combo_${n}`,
      keyPositions: Array.from(keyPositions).sort((a, b) => a - b),
      bindings: '&kp A',
      layers: [activeLayer]
    }
    const combos = [...(keymap.combos || []), newCombo]
    onUpdate({ ...keymap, combos })
    setEditingCombo(newCombo)
    setSelectedCombo(newCombo)
  }, [keymap, activeLayer, onUpdate])

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Control') {
        ctrlHeldRef.current = true
      }
    }
    const handleKeyUp = (e) => {
      if (e.key === 'Control') {
        ctrlHeldRef.current = false
        if (comboCreationKeys.size >= 2) {
          createNewCombo(comboCreationKeys)
        }
        setComboCreationKeys(new Set())
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('keyup', handleKeyUp)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('keyup', handleKeyUp)
    }
  }, [comboCreationKeys, createNewCombo])

  const handleCloseEditor = useCallback(() => {
    setEditingKeyIndex(null)
    setEditingCombo(null)
  }, [])

  const editingBinding = useMemo(() => {
    if (editingCombo) {
      // Parse combo binding string like "&kp ESC" or "&as N1" into {value, params}
      const bindingStr = editingCombo.bindings || ''
      const match = bindingStr.match(/^(&\S+)\s*(.*)$/)
      if (match) {
        const value = match[1]
        const paramsStr = match[2].trim()
        const params = paramsStr
          ? paramsStr.split(/\s+/).map(p => ({ value: p, params: [] }))
          : []
        return { value, params }
      }
      return { value: bindingStr, params: [] }
    }
    if (editingKeyIndex === null) return null
    return keymap.layers[activeLayer][editingKeyIndex]
  }, [editingKeyIndex, editingCombo, keymap.layers, activeLayer])

  const handleUpdateBinding = useCallback((newBinding) => {
    // Handle combo binding update
    if (editingCombo) {
      const paramStrs = (newBinding.params || []).map(p =>
        typeof p === 'object' ? p.value : p
      )
      const newBindingStr = `${newBinding.value} ${paramStrs.join(' ')}`.trim()
      const updatedCombo = { ...editingCombo, bindings: newBindingStr }
      handleUpdateCombo(updatedCombo)
      setEditingCombo(updatedCombo)
      return
    }

    // Handle key binding update
    if (editingKeyIndex === null) return

    const updatedLayer = [
      ...keymap.layers[activeLayer].slice(0, editingKeyIndex),
      newBinding,
      ...keymap.layers[activeLayer].slice(editingKeyIndex + 1)
    ]
    handleUpdateLayer(activeLayer, updatedLayer)
  }, [editingKeyIndex, editingCombo, keymap.layers, activeLayer, handleUpdateLayer, handleUpdateCombo])

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '8px' }}>
        <LayerSelector
          layers={keymap.layer_names}
          activeLayer={activeLayer}
          onSelect={setActiveLayer}
          onNewLayer={handleCreateLayer}
          onRenameLayer={handleRenameLayer}
          onDeleteLayer={handleDeleteLayer}
          onReorderLayer={handleReorderLayer}
        />
      </div>
      <SearchContext.Provider value={{ getSearchTargets, sources }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
          {keymap.combos && keymap.combos.length > 0 && (
            <button
              onClick={handleToggleCombos}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 12px',
                fontSize: '14px',
                cursor: 'pointer',
                backgroundColor: showCombos ? 'rgb(60, 179, 113)' : 'rgba(201, 201, 201, 0.85)',
                color: showCombos ? '#fff' : 'darkgray',
                border: 'none',
                borderRadius: '15px',
                height: '30px',
                marginTop: '20px'
              }}
            >
              <Icon name={showCombos ? 'eye' : 'eye-slash'} />
              Combos ({visibleCombos.length})
            </button>
          )}
          <div style={getWrapperStyle()}>
            {isReady() && (
              <div style={{ position: 'relative' }}>
                <KeyboardLayout
                data-layer={activeLayer}
                layout={layout}
                bindings={keymap.layers[activeLayer]}
                onUpdate={event => handleUpdateLayer(activeLayer, event)}
                raisedKeys={raisedKeys}
                highlightedKeys={dragHighlightedKeys}
                onKeyClick={handleKeyClick}
              />
              {showCombos && visibleCombos.length > 0 && (
                <ComboOverlay
                  layout={layout}
                  combos={visibleCombos}
                  selectedCombo={selectedCombo}
                  onSelectCombo={handleSelectCombo}
                  onUpdateCombo={handleUpdateCombo}
                  onDeleteCombo={handleDeleteCombo}
                  onHighlightKeys={handleHighlightKeys}
                  onEditCombo={handleEditCombo}
                />
              )}
            </div>
          )}
          </div>
        </div>
        {(editingKeyIndex !== null || editingCombo) && editingBinding && (
          <KeyEditor
            layout={layout}
            keyIndex={editingKeyIndex}
            combo={editingCombo}
            binding={editingBinding}
            onCancel={handleCloseEditor}
            onUpdate={handleUpdateBinding}
            onUpdateCombo={handleUpdateCombo}
          />
        )}
      </SearchContext.Provider>
    </>
  )
}

Keyboard.propTypes = {
  layout: PropTypes.array.isRequired,
  keymap: PropTypes.object.isRequired,
  onUpdate: PropTypes.func.isRequired
}

export default Keyboard
