import { invoke } from '@tauri-apps/api/core'
import type { PatchOp } from '../../stores/coedit'

export async function tauriReadResource(server: string, uri: string): Promise<string> {
  return await invoke<string>('mcp_read_resource', { server, uri })
}

export async function tauriCallTool(server: string, tool: string, args: Record<string, unknown>): Promise<unknown> {
  return await invoke('mcp_call_tool', { server, tool, args })
}

export async function tauriListTools(server: string): Promise<unknown> {
  return await invoke('mcp_list_tools', { server })
}

export async function tauriListResources(server: string): Promise<unknown> {
  return await invoke('mcp_list_resources', { server })
}

export async function tauriUpsertCoeditSurfaceInstance(args: {
  surfaceInstanceId: string
  sessionId: string
  surfaceId: string
  server: string
  resourceUri: string
  stateJson: Record<string, unknown>
  revision: number
}): Promise<unknown> {
  return await invoke('coedit_upsert_surface_instance', args)
}

export async function tauriSubmitCoeditPatch(args: {
  surfaceInstanceId: string
  baseRevision: number
  patch: PatchOp[]
  selection?: { start: number; end: number } | null
}): Promise<unknown> {
  return await invoke('coedit_submit_patch', args)
}

export async function tauriApplyHostPatch(args: {
  surfaceInstanceId: string
  baseRevision: number
  patch: PatchOp[]
  authoredBy: string
}): Promise<unknown> {
  return await invoke('coedit_apply_host_patch', args)
}
