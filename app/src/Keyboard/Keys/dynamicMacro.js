const COMMAND_LABELS = {
  DM_REC: 'REC',
  DM_STP: 'STP',
  DM_DEL: 'DEL',
  DM_MOV: 'MOV',
  DM_STATE: 'STAT'
}

const DEFAULT_NVS_SLOT_COUNT = 8

function getParamValue(param) {
  return typeof param === 'object' ? param?.value : param
}

function getSlotLabel(slot) {
  if (slot === undefined || slot === null) return '?'

  const slotNumber = Number(slot)
  const prefix = Number.isFinite(slotNumber) && slotNumber < DEFAULT_NVS_SLOT_COUNT
    ? 'N'
    : 'R'

  return `${prefix}${slot}`
}

export function getDynamicMacroLabel(params = []) {
  const command = getParamValue(params[0])
  const argument = getParamValue(params[1])

  if (command === 'DM_SLOT') {
    return getSlotLabel(argument)
  }

  return COMMAND_LABELS[command] || command?.replace(/^DM_/, '') || 'DM'
}

export function getDynamicMacroTitle(params = []) {
  const command = getParamValue(params[0])
  const argument = getParamValue(params[1])

  if (!command) return 'Dynamic Macro'
  if (command === 'DM_SLOT') return `Dynamic Macro slot ${getSlotLabel(argument)}`

  return `Dynamic Macro ${getDynamicMacroLabel(params)}`
}
