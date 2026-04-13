import { invoke } from '@tauri-apps/api/core'

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
