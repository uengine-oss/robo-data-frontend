import { text2sqlApi } from '../api/client'

export interface Text2SqlFeedbackInput {
  question?: string
  conversationState?: string
  sql: string
  approved: boolean
  notes?: string
}

export function submitText2SqlFeedback(input: Text2SqlFeedbackInput) {
  return text2sqlApi.submitFeedback({
    question: input.question,
    conversation_state: input.conversationState,
    original_sql: input.sql,
    rating: input.approved ? 5 : 1,
    notes: input.notes,
    approved: input.approved,
    source: 'react_ui',
  })
}
