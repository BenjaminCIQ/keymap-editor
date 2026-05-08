import PropTypes from 'prop-types'
import styles from './combo-styles.module.css'

function ComboKey(props) {
  const { position, binding, selected, dragging, onClick, onMouseDown } = props

  const style = {
    left: `${position.x}px`,
    top: `${position.y}px`,
    cursor: dragging ? 'grabbing' : 'grab'
  }

  const displayBinding = formatBinding(binding)
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
      onMouseDown={onMouseDown}
      title={binding}
    >
      {displayBinding}
    </div>
  )
}

function formatBinding(binding) {
  if (!binding) return '?'

  let display = binding
    .replace(/^&/, '')
    .replace(/^kp\s+/, '')

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
  onMouseDown: PropTypes.func
}

export default ComboKey
