const GLUED_HEADING_RUN = /(?<!\*)\*{4}(?!\*)/g
const GLUED_AFTER_PROSE = /(?<=[^\s*])(\*\*(?=[^\s*])[^\n]*?\*\*)/g

/** Repair reasoning-summary blocks glued together by chat-wire concatenation. */
export function separateGluedReasoningBlocks(text: string): string {
  return text.replace(GLUED_HEADING_RUN, '**\n\n**').replace(GLUED_AFTER_PROSE, '\n\n$1')
}
