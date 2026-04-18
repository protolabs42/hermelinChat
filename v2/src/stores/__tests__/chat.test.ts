import assert from 'node:assert/strict'
import { useChatStore } from '../chat'

function test(name: string, fn: () => void) {
  try {
    useChatStore.getState().reset()
    fn()
    console.log(`  ✓ ${name}`)
  } catch (err) {
    console.error(`  ✗ ${name}`)
    throw err
  }
}

console.log('chat store')

test('SessionInfo records the live session id', () => {
  useChatStore.getState().handleAcpEvent({
    kind: 'SessionInfo',
    session_id: 'sess-123',
    model: 'claude-sonnet',
  })

  assert.equal(useChatStore.getState().sessionId, 'sess-123')
})

test('ConnectionStatus connected keeps the current session id', () => {
  useChatStore.setState({ sessionId: 'sess-keep', connectionStatus: 'connecting' })

  useChatStore.getState().handleAcpEvent({
    kind: 'ConnectionStatus',
    status: 'connected',
    message: null,
  })

  assert.equal(useChatStore.getState().sessionId, 'sess-keep')
  assert.equal(useChatStore.getState().connectionStatus, 'connected')
})
