import {
  $clarifyRequests,
  clearClarifyRequest,
  normalizeClarifyChoices,
  normalizeClarifyQuestions,
  setClarifyRequest
} from '@/store/clarify'
import type { SessionResumeResponse } from '@/types/hermes'

export function restorePendingClarifyFromSnapshot(
  response: Pick<SessionResumeResponse, 'pending_clarify'>,
  sessionId: string,
  resumeStartedAt: number
): boolean {
  const pending = response.pending_clarify

  if (!pending || typeof pending.request_id !== 'string') {
    const current = $clarifyRequests.get()[sessionId]

    if (current && (current.receivedAt === undefined || current.receivedAt < resumeStartedAt)) {
      clearClarifyRequest(current.requestId, sessionId)
    }

    return false
  }

  const questions = normalizeClarifyQuestions(pending.questions)
  const question = typeof pending.question === 'string' ? pending.question : ''

  if (!question && questions.length === 0) {
    return false
  }

  const choices = normalizeClarifyChoices(pending.choices)

  const lockedAnswers =
    pending.answers && typeof pending.answers === 'object'
      ? Object.fromEntries(
          Object.entries(pending.answers).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
        )
      : undefined

  setClarifyRequest({
    choices: choices.length ? choices : null,
    lockedAnswers,
    multiSelect: pending.multi_select === true,
    question,
    questions: questions.length ? questions : undefined,
    receivedAt: Date.now() / 1000,
    requestId: pending.request_id,
    sessionId
  })

  return true
}
