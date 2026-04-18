import type { A2UIServerMessage } from './types'
import type { A2UIBatch } from '../stores/surfaces'

let nextManualBatchSeq = Date.now()

export function buildManualA2UIBatch(
  sessionId: string,
  messages: A2UIServerMessage[]
): A2UIBatch {
  nextManualBatchSeq += 1
  return {
    kind: 'a2ui-surface-batch',
    sessionId,
    seq: nextManualBatchSeq,
    timestamp: Date.now(),
    messages,
  }
}
