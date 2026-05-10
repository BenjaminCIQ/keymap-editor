import PropTypes from 'prop-types'
import { useContext } from 'react'
import { SearchContext } from '../providers'
import styles from './combo-styles.module.css'

function ComboKey(props) {
  const { position, binding, selected, dragging, onClick, onMouseDown, onDoubleClick } = props
  const { sources } = useContext(SearchContext)

  const style = {
    left: `${position.x}px`,
    top: `${position.y}px`,
    cursor: dragging ? 'grabbing' : 'grab'
  }

  const displayBinding = formatBinding(binding, sources)
  const className = [
    styles.comboKey,
    selected && styles.comboKeySelected,
    dragging && styles.comboKeyDragging
  ].filter(Boolean).join(' ')

  return (
    <div
      className={className}
      style={style}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onMouseDown={onMouseDown}
      title={binding}
    >
      {displayBinding}
    </div>
  )
}

// Common modifier+key combo mappings
const COMBO_SYMBOLS = {
  'LC(X)': '✂',      // Ctrl+X = Cut
  'LC(INS)': '⧉',    // Ctrl+Ins = Copy
  'LS(INS)': '📋',   // Shift+Ins = Paste
  'LC(C)': '⧉',      // Ctrl+C = Copy
  'LC(V)': '📋',     // Ctrl+V = Paste
  'LC(Z)': '↩',      // Ctrl+Z = Undo
  'LC(Y)': '↪',      // Ctrl+Y = Redo
  'LC(S)': '💾',     // Ctrl+S = Save
  'LC(A)': '▣',      // Ctrl+A = Select All
}

function formatBinding(binding, sources) {
  if (!binding) return '?'

  // Extract keycode from binding like "&kp EXCL" or "&as N1"
  const match = binding.match(/^&\w+\s+(\S+)/)
  if (match) {
    const keycode = match[1]

    // Check for modifier combo symbols first
    if (COMBO_SYMBOLS[keycode]) {
      return COMBO_SYMBOLS[keycode]
    }

    // Look up symbol in keycodes
    const kcInfo = sources?.kc?.[keycode]
    if (kcInfo?.symbol) {
      return kcInfo.symbol
    }
    // Fallback: return keycode, truncated
    if (keycode.length > 3) {
      return keycode.slice(0, 3)
    }
    return keycode
  }

  // No keycode param, just show behavior name
  let display = binding.replace(/^&/, '')
  if (display.length > 3) {
    display = display.slice(0, 3)
  }
  return display.toUpperCase()
}

ComboKey.propTypes = {
  position: PropTypes.shape({
    x: PropTypes.number.isRequired,
    y: PropTypes.number.isRequired
  }).isRequired,
  binding: PropTypes.string,
  selected: PropTypes.bool,
  dragging: PropTypes.bool,
  onClick: PropTypes.func,
  onDoubleClick: PropTypes.func,
  onMouseDown: PropTypes.func
}

export default ComboKey
