import get from 'lodash/get'
import keyBy from 'lodash/keyBy'

import { getBehaviourParams } from '../../keymap'

// US QWERTY shifted symbol mappings
const SHIFTED_SYMBOLS = {
  '1': '!', '2': '@', '3': '#', '4': '$', '5': '%',
  '6': '^', '7': '&', '8': '*', '9': '(', '0': ')',
  '-': '_', '=': '+', '[': '{', ']': '}', '\\': '|',
  ';': ':', "'": '"', '`': '~', ',': '<', '.': '>',
  '/': '?'
}

export function getShiftedSymbol(symbol) {
  return SHIFTED_SYMBOLS[symbol] || symbol?.toUpperCase()
}

export function makeIndex (tree) {
  const index = []
  ;(function traverse(tree) {
    const params = tree.params || []
    index.push(tree)
    params.forEach(traverse)
  })(tree)

  return index
}

export function isSimple(normalized) {
  const [first] = normalized.params
  const symbol = get(first, 'source.symbol', get(first, 'source.code', ''))
  const shortSymbol = symbol.length === 1
  const singleParam = normalized.params.length === 1
  return singleParam && shortSymbol
}

export function isComplex(normalized, behaviourParams) {
  const [first] = normalized.params
  const symbol = get(first, 'source.symbol', get(first, 'value', ''))
  const isLongSymbol = symbol.length > 4
  const isMultiParam = behaviourParams.length > 1
  const isNestedParam = get(first, 'params', []).length > 0

  return isLongSymbol || isMultiParam || isNestedParam
}

export function createPromptMessage(param) {
  const promptMapping = {
    layer: 'Select layer',
    mod: 'Select modifier',
    behaviour: 'Select behaviour',
    command: 'Select command',
    keycode: 'Select key code'
  }

  if (param.name) {
    return `Select ${param.name}`
  }

  return (
    promptMapping[param] ||
    promptMapping.keycode
  )
}

function resolveBindingToKeycode(bindingStr, sources, depth = 0) {
  if (!bindingStr || depth > 5) return null

  // Direct keycode: "&kp SPACE" -> keycode object
  const kpMatch = bindingStr.match(/&kp\s+(\S+)/)
  if (kpMatch) {
    return sources?.kc?.[kpMatch[1]]
  }

  // Behavior reference: "&spc_morph" -> look up its binding
  const behaviorMatch = bindingStr.match(/^&(\S+)/)
  if (behaviorMatch) {
    const behavior = sources?.behaviours?.[bindingStr] || sources?.behaviours?.[`&${behaviorMatch[1]}`]
    if (behavior?.holdBinding) {
      return resolveBindingToKeycode(behavior.holdBinding, sources, depth + 1)
    }
  }

  return null
}

export function hydrateTree(value, params, sources) {
  const bind = value
  const behaviour = get(sources.behaviours, bind)
  const behaviourParams = getBehaviourParams(params, behaviour)
  const commands = keyBy(behaviour?.commands || [], 'code')

  function getSourceValue(value, as, paramIndex) {
    if (as === 'command') return commands[value]
    if (as === 'raw' || as.enum) return { code: value }

    // For hold-tap hold param (index 0), resolve from holdBinding
    if (paramIndex === 0 && behaviour?.holdBinding) {
      const resolved = resolveBindingToKeycode(behaviour.holdBinding, sources)
      if (resolved) return resolved
    }

    // For hold-tap tap param (index 1), resolve from tapBinding
    if (paramIndex === 1 && behaviour?.tapBinding) {
      const resolved = resolveBindingToKeycode(behaviour.tapBinding, sources)
      if (resolved) return resolved
    }

    // Direct lookup
    const direct = sources?.[as]?.[value]
    if (direct) return direct

    // For layer param, try matching by name
    if (as === 'layer' || as === 'behaviour') {
      const layers = Object.values(sources?.layer || {})
      const byName = layers.find(l =>
        l.description === value ||
        l.description?.toUpperCase() === String(value).toUpperCase()
      )
      if (byName) return byName
    }

    // For code/keycode, also check kc
    if (as === 'code') {
      return sources?.kc?.[value]
    }

    return null
  }

  function hydrateNode(node, as, paramIndex) {
    if (!node) {
      return { value: undefined, params: [] }
    }
    const { value, params } = node
    const source = getSourceValue(value, as, paramIndex)

    return {
      value,
      source,
      params: get(source, 'params', []).map((as, i) => (
        hydrateNode(params[i], as, i)
      ))
    }
  }

  return {
    value,
    source: behaviour,
    params: behaviourParams.map((as, i) => (
      hydrateNode(params[i], as, i)
    ))
  }
}
