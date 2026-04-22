import { useAcpTransportEvents } from './useAcpTransportEvents'
import { useProjectBootstrap } from './useProjectBootstrap'
import { useSessionDerivedHydration } from './useSessionDerivedHydration'
import { useWorkspacePersistence } from './useWorkspacePersistence'

export function useAcpEvents() {
  useAcpTransportEvents()
  useProjectBootstrap()
  useSessionDerivedHydration()
  useWorkspacePersistence()
}
