import PropTypes from 'prop-types'
import { useCallback, useContext, useState } from 'react'
import { SearchContext } from '../../providers'
import styles from './combo-settings.module.css'

function ComboSettings(props) {
  const { combo, onUpdate, onClose } = props
  const { sources } = useContext(SearchContext)

  const [name, setName] = useState(combo.name || '')
  const [timeout, setTimeout] = useState(combo.timeout || 30)
  const [requirePriorIdleMs, setRequirePriorIdleMs] = useState(combo.requirePriorIdleMs || 150)
  const [slowRelease, setSlowRelease] = useState(combo.slowRelease || false)
  const [selectedLayers, setSelectedLayers] = useState(new Set(combo.layers || []))

  const layers = Object.values(sources.layer || {})

  const handleToggleLayer = useCallback((layerCode) => {
    setSelectedLayers(prev => {
      const next = new Set(prev)
      if (next.has(layerCode)) {
        next.delete(layerCode)
      } else {
        next.add(layerCode)
      }
      return next
    })
  }, [])

  const handleSave = useCallback(() => {
    onUpdate({
      ...combo,
      _originalName: combo.name,
      name: name.trim() || combo.name,
      timeout: parseInt(timeout) || 30,
      requirePriorIdleMs: parseInt(requirePriorIdleMs) || undefined,
      slowRelease,
      layers: Array.from(selectedLayers).sort((a, b) => a - b)
    })
    onClose()
  }, [combo, name, timeout, requirePriorIdleMs, slowRelease, selectedLayers, onUpdate, onClose])

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.dialog} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.title}>Customize</span>
          <input
            type="text"
            className={styles.comboNameInput}
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="combo_name"
          />
        </div>

        <div className={styles.row}>
          <label className={styles.label}>Timeout (ms)</label>
          <input
            type="number"
            className={styles.input}
            value={timeout}
            onChange={e => setTimeout(e.target.value)}
            min={0}
          />
        </div>

        <div className={styles.row}>
          <label className={styles.label}>Require Prior<br/>Idle (ms)</label>
          <input
            type="number"
            className={styles.input}
            value={requirePriorIdleMs}
            onChange={e => setRequirePriorIdleMs(e.target.value)}
            min={0}
          />
        </div>

        <div className={styles.row}>
          <label className={styles.label}>Slow Release</label>
          <input
            type="checkbox"
            className={styles.checkbox}
            checked={slowRelease}
            onChange={e => setSlowRelease(e.target.checked)}
          />
        </div>

        <div className={styles.row}>
          <label className={styles.label}>Layers</label>
          <div className={styles.layerPicker}>
            {layers.map(layer => (
              <button
                key={layer.code}
                className={`${styles.layerChip} ${selectedLayers.has(layer.code) ? styles.layerChipSelected : ''}`}
                onClick={() => handleToggleLayer(layer.code)}
              >
                {layer.description}
                {selectedLayers.has(layer.code) && <span className={styles.removeX}>×</span>}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.actions}>
          <button className={styles.okayButton} onClick={handleSave}>Okay</button>
          <button className={styles.cancelButton} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

ComboSettings.propTypes = {
  combo: PropTypes.shape({
    name: PropTypes.string.isRequired,
    timeout: PropTypes.number,
    requirePriorIdleMs: PropTypes.number,
    slowRelease: PropTypes.bool,
    layers: PropTypes.array
  }).isRequired,
  onUpdate: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired
}

export default ComboSettings
