const COMMAND_LABELS = {
  DM_REC: 'REC',
  DM_STP: 'STP',
  DM_DEL: 'DEL',
  DM_STATE: 'STAT'
}

function getParamValue(param) {
  return typeof param === 'object' ? param?.value : param
}

export function getDynamicMacroLabel(params = []) {
  const command = getParamValue(params[0])
  const argument = getParamValue(params[1])

  if (command === 'DM_SLOT') {
    return argument === undefined || argument === null ? 'S?' : `S${argument}`
  }

  return COMMAND_LABELS[command] || command?.replace(/^DM_/, '') || 'DM'
}

export function getDynamicMacroTitle(params = []) {
  const command = getParamValue(params[0])
  const argument = getParamValue(params[1])

  if (!command) return 'Dynamic Macro'
  if (command === 'DM_SLOT') return `Dynamic Macro slot ${argument ?? '?'}`

  return `Dynamic Macro ${getDynamicMacroLabel(params)}`
}
