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

function getGlobalSlotLabel(slot) {
  if (slot === undefined || slot === null) return '?'

  const slotNumber = Number(slot)
  const prefix = Number.isFinite(slotNumber) && slotNumber < DEFAULT_NVS_SLOT_COUNT
    ? 'N'
    : 'R'

  return `${prefix}${slot}`
}

function getNvsSlotLabel(slot) {
  return slot === undefined || slot === null ? 'N?' : `N${slot}`
}

function getRamSlotLabel(slot) {
  return slot === undefined || slot === null ? 'R?' : `R${slot}`
}

export function getDynamicMacroLabel(params = []) {
  const command = getParamValue(params[0])
  const argument = getParamValue(params[1])

  if (command === 'DM_SLOT') {
    return getGlobalSlotLabel(argument)
  }
  if (command === 'DM_SLOT_NVS') {
    return getNvsSlotLabel(argument)
  }
  if (command === 'DM_SLOT_RAM') {
    return getRamSlotLabel(argument)
  }

  return COMMAND_LABELS[command] || command?.replace(/^DM_/, '') || 'DM'
}

export function getDynamicMacroTitle(params = []) {
  const command = getParamValue(params[0])
  const argument = getParamValue(params[1])

  if (!command) return 'Dynamic Macro'
  if (command === 'DM_SLOT') return `Dynamic Macro slot ${getGlobalSlotLabel(argument)}`
  if (command === 'DM_SLOT_NVS') return `Dynamic Macro NVS slot ${getNvsSlotLabel(argument)}`
  if (command === 'DM_SLOT_RAM') return `Dynamic Macro RAM slot ${getRamSlotLabel(argument)}`

  return `Dynamic Macro ${getDynamicMacroLabel(params)}`
}
