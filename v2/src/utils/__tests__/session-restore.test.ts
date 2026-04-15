/**
 * sessionRowsToMessages — pure converter from hermes DB rows + A2UI anchors
 * to the ChatMessage list the live store produces. Runnable via
 * `npm run session-restore:test` (tsx, node:assert/strict).
 *
 * Contract: a session resumed from DB should look identical to one that just
 * streamed in live — same role bubbles, same order, same tool merge behavior.
 */
import assert from 'node:assert/strict'
import {
  sessionRowsToMessages,
  type SessionRow,
  type SurfaceAnchor,
} from '../session-restore'

function row(overrides: Partial<SessionRow> & { id: number; role: string }): SessionRow {
  return {
    content: null,
    timestamp: null,
    reasoning: null,
    tool_calls: null,
    tool_call_id: null,
    tool_name: null,
    ...overrides,
  }
}

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`  ✓ ${name}`)
  } catch (err) {
    console.error(`  ✗ ${name}`)
    throw err
  }
}

console.log('sessionRowsToMessages')

test('user row becomes a single user ChatMessage', () => {
  const msgs = sessionRowsToMessages([
    row({ id: 1, role: 'user', content: 'hi', timestamp: 100 }),
  ])
  assert.equal(msgs.length, 1)
  assert.equal(msgs[0].role, 'user')
  assert.equal(msgs[0].content, 'hi')
  assert.equal(msgs[0].timestamp, 100_000) // seconds → ms
})

test('empty user content is dropped', () => {
  const msgs = sessionRowsToMessages([
    row({ id: 1, role: 'user', content: '', timestamp: 100 }),
    row({ id: 2, role: 'user', content: null, timestamp: 101 }),
  ])
  assert.equal(msgs.length, 0)
})

test('assistant with reasoning emits thinking first, then assistant', () => {
  const msgs = sessionRowsToMessages([
    row({
      id: 2,
      role: 'assistant',
      content: 'done',
      reasoning: 'let me think',
      timestamp: 200,
    }),
  ])
  assert.equal(msgs.length, 2)
  assert.equal(msgs[0].role, 'thinking')
  assert.equal(msgs[0].content, 'let me think')
  assert.equal(msgs[1].role, 'assistant')
  assert.equal(msgs[1].content, 'done')
})

test('assistant with only tool_calls (no content) emits placeholders only', () => {
  const msgs = sessionRowsToMessages([
    row({
      id: 3,
      role: 'assistant',
      content: null,
      timestamp: 300,
      tool_calls: JSON.stringify([
        { id: 'c1', name: 'bash', arguments: { cmd: 'ls' } },
        { id: 'c2', name: 'read', arguments: { path: 'a.txt' } },
      ]),
    }),
  ])
  assert.equal(msgs.length, 2, 'two placeholders, no assistant bubble')
  assert.equal(msgs[0].role, 'tool')
  assert.equal(msgs[0].toolId, 'c1')
  assert.equal(msgs[0].toolTitle, 'bash')
  assert.equal(msgs[0].toolStatus, 'running')
  assert.equal(msgs[1].toolId, 'c2')
  assert.equal(msgs[1].toolTitle, 'read')
  assert.equal(msgs[1].toolStatus, 'running')
})

test('tool result merges into preceding placeholder by tool_call_id', () => {
  const msgs = sessionRowsToMessages([
    row({
      id: 10,
      role: 'assistant',
      timestamp: 400,
      tool_calls: JSON.stringify([{ id: 'c1', name: 'bash' }]),
    }),
    row({
      id: 11,
      role: 'tool',
      timestamp: 401,
      tool_call_id: 'c1',
      tool_name: 'bash',
      content: JSON.stringify({ output: 'foo\nbar', exit_code: 0 }),
    }),
  ])
  assert.equal(msgs.length, 1, 'tool result merges — no new message')
  assert.equal(msgs[0].role, 'tool')
  assert.equal(msgs[0].toolStatus, 'completed')
  assert.equal(msgs[0].content, 'foo\nbar')
})

test('orphan tool result (no matching call) renders standalone', () => {
  const msgs = sessionRowsToMessages([
    row({
      id: 20,
      role: 'tool',
      timestamp: 500,
      tool_call_id: 'unknown',
      tool_name: 'mystery',
      content: JSON.stringify({ output: 'lost' }),
    }),
  ])
  assert.equal(msgs.length, 1)
  assert.equal(msgs[0].role, 'tool')
  assert.equal(msgs[0].toolStatus, 'completed')
  assert.equal(msgs[0].content, 'lost')
  assert.equal(msgs[0].toolTitle, 'mystery')
})

test('full realistic turn produces user / thinking / tool(completed) / assistant', () => {
  const msgs = sessionRowsToMessages([
    row({ id: 1, role: 'user', content: 'list', timestamp: 100 }),
    row({
      id: 2,
      role: 'assistant',
      content: null,
      reasoning: 'use bash',
      timestamp: 101,
      tool_calls: JSON.stringify([{ id: 'x', name: 'bash' }]),
    }),
    row({
      id: 3,
      role: 'tool',
      timestamp: 102,
      tool_call_id: 'x',
      content: JSON.stringify({ output: 'ok' }),
    }),
    row({ id: 4, role: 'assistant', content: 'done', timestamp: 103 }),
  ])
  assert.equal(msgs.length, 4)
  assert.deepEqual(msgs.map((m) => m.role), ['user', 'thinking', 'tool', 'assistant'])
  assert.equal(msgs[2].toolStatus, 'completed')
  assert.equal(msgs[2].content, 'ok')
  assert.equal(msgs[3].content, 'done')
})

test('anchors interleave by timestamp', () => {
  const anchors: SurfaceAnchor[] = [
    { surfaceId: 'S1', timestamp: 5_000 }, // between user (1000ms) and assistant (10000ms)
    { surfaceId: 'S2', timestamp: 20_000 }, // after last message
  ]
  const msgs = sessionRowsToMessages(
    [
      row({ id: 1, role: 'user', content: 'a', timestamp: 1 }),
      row({ id: 2, role: 'assistant', content: 'b', timestamp: 10 }),
    ],
    anchors
  )
  assert.equal(msgs.length, 4)
  assert.equal(msgs[0].role, 'user')
  assert.equal(msgs[1].role, 'surface')
  assert.equal(msgs[1].surfaceId, 'S1')
  assert.equal(msgs[2].role, 'assistant')
  assert.equal(msgs[3].role, 'surface')
  assert.equal(msgs[3].surfaceId, 'S2')
})

test('hermes openai-style tool_calls (function.name nested) extracts tool name', () => {
  // Aurora's actual hermes DB shape — name lives under .function.name, not top-level.
  // Using id as the call identifier (also exposed as call_id alongside).
  const msgs = sessionRowsToMessages([
    row({
      id: 1,
      role: 'assistant',
      timestamp: 1,
      tool_calls: JSON.stringify([
        {
          id: 'toolu_xyz',
          call_id: 'toolu_xyz',
          type: 'function',
          function: {
            name: 'terminal',
            arguments: '{"command":"ls"}',
          },
        },
      ]),
    }),
    row({
      id: 2,
      role: 'tool',
      timestamp: 2,
      tool_call_id: 'toolu_xyz',
      content: JSON.stringify({ output: 'file1\nfile2' }),
    }),
  ])
  assert.equal(msgs.length, 1, 'tool result should merge into placeholder')
  assert.equal(msgs[0].role, 'tool')
  assert.equal(msgs[0].toolTitle, 'terminal', 'name must be extracted from function.name')
  assert.equal(msgs[0].toolStatus, 'completed')
  assert.equal(msgs[0].content, 'file1\nfile2')
})

test('malformed tool_calls JSON does not crash, assistant still renders', () => {
  const msgs = sessionRowsToMessages([
    row({
      id: 1,
      role: 'assistant',
      content: 'ok',
      timestamp: 1,
      tool_calls: 'not-json',
    }),
  ])
  assert.equal(msgs.length, 1)
  assert.equal(msgs[0].role, 'assistant')
  assert.equal(msgs[0].content, 'ok')
})

test('tool result with plain string content (not JSON) passes through raw', () => {
  const msgs = sessionRowsToMessages([
    row({
      id: 1,
      role: 'assistant',
      timestamp: 1,
      tool_calls: JSON.stringify([{ id: 'c', name: 'bash' }]),
    }),
    row({
      id: 2,
      role: 'tool',
      timestamp: 2,
      tool_call_id: 'c',
      content: 'raw output string',
    }),
  ])
  assert.equal(msgs.length, 1)
  assert.equal(msgs[0].content, 'raw output string')
})

console.log('✓ all session-restore tests passed')
