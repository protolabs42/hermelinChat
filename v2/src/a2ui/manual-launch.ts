import type { A2UIServerMessage } from './types'

export interface LocalA2UIEmitRequest {
  sessionId: string
  messages: A2UIServerMessage[]
}

export function buildManualA2UIEmitRequest(
  sessionId: string,
  messages: A2UIServerMessage[]
): LocalA2UIEmitRequest {
  return {
    sessionId,
    messages,
  }
}
