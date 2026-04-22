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

test('restoreSurfaceAnchors appends missing workspace anchors in order', () => {
  useChatStore.setState({
    messages: [
      {
        id: 'msg-1',
        role: 'assistant',
        content: 'hello',
        timestamp: 100,
      },
    ],
  })

  useChatStore.getState().restoreSurfaceAnchors(['surface-b', 'surface-a'])

  const surfaceMessages = useChatStore.getState().messages.filter((m) => m.role === 'surface')
  assert.deepEqual(surfaceMessages.map((m) => m.surfaceId), ['surface-b', 'surface-a'])
})

test('session-scoped ACP events from a different session are ignored', () => {
  useChatStore.setState({ sessionId: 'sess-current', messages: [] })

  useChatStore.getState().handleAcpEvent({
    kind: 'AgentMessage',
    session_id: 'sess-other',
    text: 'should not land',
  })

  assert.equal(useChatStore.getState().messages.length, 0)
})
