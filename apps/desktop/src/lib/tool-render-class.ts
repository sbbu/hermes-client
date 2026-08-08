/** Shared classification used by transcript rendering and render-cost accounting. */
const FILE_EDIT_TOOL_NAMES = new Set(['edit_file', 'patch', 'write_file'])
const CARD_TOOL_NAMES = new Set(['clarify', 'delegate_task', 'image_generate'])
const SILENT_TOOL_NAMES = new Set(['react_to_message', 'todo'])

export function isFileEditTool(toolName: string): boolean {
  return FILE_EDIT_TOOL_NAMES.has(toolName)
}

export function isCardTool(toolName: string): boolean {
  return CARD_TOOL_NAMES.has(toolName) || isFileEditTool(toolName)
}

export function isSilentTool(toolName: string): boolean {
  return SILENT_TOOL_NAMES.has(toolName)
}
