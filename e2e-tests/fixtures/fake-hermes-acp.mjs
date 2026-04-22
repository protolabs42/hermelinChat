#!/usr/bin/env node
import crypto from 'node:crypto'
import readline from 'node:readline'

const args = process.argv.slice(2)
if (args[0] !== 'acp') {
  console.error('fake-hermes-acp only supports `acp`')
  process.exit(2)
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity })
const sessionModels = new Map()

function send(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`)
}

function fakeSessionId() {
  return crypto.randomUUID()
}

function emitSessionUpdate(sessionId, update) {
  send({
    jsonrpc: '2.0',
    method: 'session/update',
    params: {
      sessionId,
      update,
    },
  })
}

rl.on('line', (line) => {
  const trimmed = line.trim()
  if (!trimmed) return

  let msg
  try {
    msg = JSON.parse(trimmed)
  } catch {
    return
  }

  if (msg.method === 'initialize') {
    send({
      jsonrpc: '2.0',
      id: msg.id,
      result: {
        protocolVersion: 1,
        agentCapabilities: {
          loadSession: true,
          sessionCapabilities: { fork: {}, list: {}, resume: {} },
        },
        agentInfo: { name: 'fake-hermes-e2e', version: '0.1.0' },
      },
    })
    return
  }

  if (msg.method === 'session/new') {
    const sessionId = fakeSessionId()
    const model = 'fake-hermes-e2e'
    sessionModels.set(sessionId, model)
    send({
      jsonrpc: '2.0',
      id: msg.id,
      result: {
        sessionId,
        models: {
          currentModelId: model,
          availableModels: [{ modelId: model, name: model, description: 'Hermetic fake ACP model for desktop E2E' }],
        },
      },
    })
    emitSessionUpdate(sessionId, {
      sessionUpdate: 'session_info_update',
      sessionId,
      model,
    })
    return
  }

  if (msg.method === 'session/load') {
    const sessionId = msg.params?.sessionId ?? fakeSessionId()
    const model = sessionModels.get(sessionId) ?? 'fake-hermes-e2e'
    sessionModels.set(sessionId, model)
    send({
      jsonrpc: '2.0',
      id: msg.id,
      result: {
        sessionId,
        models: {
          currentModelId: model,
          availableModels: [{ modelId: model, name: model, description: 'Hermetic fake ACP model for desktop E2E' }],
        },
      },
    })
    emitSessionUpdate(sessionId, {
      sessionUpdate: 'session_info_update',
      sessionId,
      model,
    })
    return
  }

  if (msg.method === 'session/prompt') {
    const sessionId = msg.params?.sessionId ?? fakeSessionId()
    const prompt = Array.isArray(msg.params?.prompt)
      ? msg.params.prompt.map((part) => part?.text ?? '').join('').trim()
      : ''
    const reply = prompt ? `fake desktop reply: ${prompt}` : 'fake desktop reply'
    send({
      jsonrpc: '2.0',
      id: msg.id,
      result: { stopReason: 'end_turn' },
    })
    emitSessionUpdate(sessionId, {
      sessionUpdate: 'agent_message_chunk',
      sessionId,
      content: { type: 'text', text: reply },
    })
    return
  }

  if (msg.method === 'session/cancel') {
    return
  }

  if (msg.id !== undefined) {
    send({
      jsonrpc: '2.0',
      id: msg.id,
      error: { code: -32601, message: `Unsupported method: ${msg.method}` },
    })
  }
})

rl.on('close', () => process.exit(0))
