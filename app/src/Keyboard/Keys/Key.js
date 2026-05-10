import get from 'lodash/get'
import PropTypes from 'prop-types'
import { useContext } from 'react'

import { SearchContext } from '../../providers'
import { getBehaviourParams } from '../../keymap'
import { getKeyStyles } from '../../key-units'

import KeyParamlist from './KeyParamlist'
import * as keyPropTypes from './keyPropTypes'
import {
  hydrateTree,
  isSimple,
  isComplex,
  makeIndex,
  getShiftedSymbol
} from './util'
import styles from './styles.module.css'

function Key(props) {
  const { sources } = useContext(SearchContext)
  const { position, rotation, size, raised, highlighted, onClick } = props
  const { label, value, params } = props

  const bind = value
  const behaviour = get(sources.behaviours, bind)
  const behaviourParams = getBehaviourParams(params, behaviour)

  const normalized = hydrateTree(value, params, sources)

  const index = makeIndex(normalized)
  const positioningStyle = getKeyStyles(position, size, rotation)

  function handleClick(event) {
    event.stopPropagation()
    onClick?.(event)
  }

  const keyClassName = [
    styles.key,
    raised && styles.keyRaised,
    highlighted && styles.keyHighlighted
  ].filter(Boolean).join(' ')

  return (
    <div
      className={keyClassName}
      data-label={label}
      data-u={size.u}
      data-h={size.h}
      data-simple={isSimple(normalized)}
      data-long={isComplex(normalized, behaviourParams)}
      style={positioningStyle}
      onClick={handleClick}
    >
    <span className={styles.keyContent}>
      {behaviour ? (
        <span className={styles['behaviour-binding']}>
          {behaviour.code}
        </span>
      ) : null}
      {behaviour?.isAutoshift && normalized.params[0]?.source ? (
        <span className={styles.autoshiftDisplay}>
          <span className={styles.autoshiftTap}>
            {normalized.params[0].source.symbol || normalized.params[0].value}
          </span>
          <span className={styles.autoshiftHold}>
            {getShiftedSymbol(normalized.params[0].source.symbol || normalized.params[0].value)}
          </span>
        </span>
      ) : (
        <KeyParamlist
          root={true}
          index={index}
          params={behaviourParams}
          values={normalized.params}
          onSelect={() => {}}
        />
      )}
    </span>
  </div>
  )
}

Key.propTypes = {
  position: PropTypes.shape({
    x: PropTypes.number.isRequired,
    y: PropTypes.number.isRequired
  }),
  rotation: PropTypes.shape({
    a: PropTypes.number,
    rx: PropTypes.number,
    ry: PropTypes.number
  }),
  size: PropTypes.shape({
    u: PropTypes.number.isRequired,
    h: PropTypes.number.isRequired
  }),
  label: PropTypes.string,
  value: keyPropTypes.value.isRequired,
  params: PropTypes.arrayOf(keyPropTypes.node),
  onUpdate: PropTypes.func.isRequired,
  raised: PropTypes.bool,
  highlighted: PropTypes.bool,
  onClick: PropTypes.func
}

export default Key
