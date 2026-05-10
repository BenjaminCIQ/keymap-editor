import PropTypes from 'prop-types'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import Icon from '../Common/Icon'
import styles from './styles.module.css'

function stop(fn) {
  return function(event) {
    event.stopPropagation()
    fn()
  }
}

function onKey(mapping) {
  return function(event) {
    if (mapping[event.key]) {
      mapping[event.key]()
    }
  }
}

function LayerSelector(props) {
  const ref = useRef(null)
  const { activeLayer, layers } = props
  const { onSelect, onNewLayer, onRenameLayer, onDeleteLayer, onReorderLayer } = props
  const [renaming, setRenaming] = useState(false)
  const [editing, setEditing] = useState('')
  const [dragIndex, setDragIndex] = useState(null)
  const [dropIndex, setDropIndex] = useState(null)

  const handleSelect = useMemo(() => function(layer) {
    if (layer === activeLayer) {
      setEditing(layers[activeLayer])
      setRenaming(true)
      return
    }

    setRenaming(false)
    onSelect(layer)
  }, [layers, activeLayer, setEditing, setRenaming, onSelect])

  const handleAdd = useMemo(() => function() {
    onNewLayer()
  }, [onNewLayer])

  const handleDelete = useMemo(() => function(layerIndex, layerName) {
    const confirmation = `Really delete layer: ${layerName}?`
    window.confirm(confirmation) && onDeleteLayer(layerIndex)
  }, [onDeleteLayer])

  const finishEditing = useCallback(() => {
    if (!renaming) {
      return
    }

    setEditing('')
    setRenaming(false)
    onRenameLayer(editing)
  }, [editing, renaming, setEditing, setRenaming, onRenameLayer])

  const cancelEditing = useCallback(() => {
    if (!renaming) {
      return
    }

    setEditing('')
    setRenaming(false)
  }, [renaming, setEditing, setRenaming])

  const handleClickOutside = useMemo(() => function(event) {
    const clickedOutside = ref.current && !ref.current.contains(event.target)
    if (!clickedOutside) {
      return
    }

    cancelEditing()
  }, [ref, cancelEditing])

  useEffect(() => {
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [handleClickOutside])

  const focusInput = useCallback(node => {
    if (node) {
      node.focus()
      node.select()
    }
  }, [])

  const handleDragStart = useCallback((e, index) => {
    setDragIndex(index)
    e.dataTransfer.effectAllowed = 'move'
  }, [])

  const handleDragOver = useCallback((e, index) => {
    e.preventDefault()
    if (dragIndex !== null && index !== dragIndex) {
      setDropIndex(index)
    }
  }, [dragIndex])

  const handleDragLeave = useCallback(() => {
    setDropIndex(null)
  }, [])

  const handleDrop = useCallback((e, index) => {
    e.preventDefault()
    if (dragIndex !== null && dragIndex !== index) {
      onReorderLayer?.(dragIndex, index)
    }
    setDragIndex(null)
    setDropIndex(null)
  }, [dragIndex, onReorderLayer])

  const handleDragEnd = useCallback(() => {
    setDragIndex(null)
    setDropIndex(null)
  }, [])

  return (
    <div
      className={styles['layer-selector']}
      data-renaming={renaming}
      ref={ref}
    >
      <p>Layers:</p>
      <ul>
        {layers.map((name, i) => (
          <li
            key={`layer-${i}`}
            className={[
              activeLayer === i ? styles.active : '',
              dragIndex === i ? styles.dragging : '',
              dropIndex === i ? styles.dropTarget : ''
            ].filter(Boolean).join(' ')}
            data-layer={i}
            draggable={!renaming}
            onClick={stop(() => handleSelect(i))}
            onDragStart={(e) => handleDragStart(e, i)}
            onDragOver={(e) => handleDragOver(e, i)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, i)}
            onDragEnd={handleDragEnd}
          >
            <span className={styles.index}>{i}</span>
            {(activeLayer === i && renaming) ? (
              <input
                ref={focusInput}
                className={styles.name}
                onChange={e => setEditing(e.target.value)}
                onKeyDown={onKey({
                  Enter: finishEditing,
                  Escape: cancelEditing
                })}
                value={
                  (activeLayer === i && renaming)
                    ? editing
                    : layers[i]
                }
              />
            ) : (
              <span className={styles.name}>
                {name}
                <Icon
                  name="times-circle"
                  className={styles.delete}
                  onClick={stop(() => handleDelete(i, name))}
                />
              </span>
            )}
          </li>
        ))}
        <li onClick={handleAdd}>
          <Icon className={styles.index} name="plus" />
          <span className={styles.name}>Add Layer</span>
        </li>
      </ul>
    </div>
  )
}

LayerSelector.propTypes = {
  layers: PropTypes.array.isRequired,
  activeLayer: PropTypes.number.isRequired,
  onSelect: PropTypes.func.isRequired,
  onNewLayer: PropTypes.func.isRequired,
  onRenameLayer: PropTypes.func.isRequired,
  onDeleteLayer: PropTypes.func.isRequired,
  onReorderLayer: PropTypes.func
}

export default LayerSelector
