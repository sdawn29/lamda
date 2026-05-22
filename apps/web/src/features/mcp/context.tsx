import React, { useEffect } from "react"
import { create } from "zustand"
import type { McpServerConfig } from "./types"

/**
 * MCP feature context
 * Provides workspace-specific MCP state
 */
interface McpContextValue {
  workspaceId: string
  servers: McpServerConfig[]
  isLoading: boolean
}

interface McpStore extends McpContextValue {
  initialized: boolean
  setInitialized: (value: boolean) => void
  setWorkspaceId: (workspaceId: string) => void
}

const useMcpStore = create<McpStore>((set) => ({
  initialized: false,
  workspaceId: "",
  servers: [],
  isLoading: false,
  setInitialized: (value) => set({ initialized: value }),
  setWorkspaceId: (workspaceId) => set({ workspaceId }),
}))

interface McpProviderProps {
  workspaceId: string
  children: React.ReactNode
}

export function McpProvider({ workspaceId, children }: McpProviderProps) {
  const setInitialized = useMcpStore((state) => state.setInitialized)
  const setWorkspaceId = useMcpStore((state) => state.setWorkspaceId)

  useEffect(() => {
    setInitialized(true)
    return () => setInitialized(false)
  }, [setInitialized])

  useEffect(() => {
    setWorkspaceId(workspaceId)
  }, [setWorkspaceId, workspaceId])

  return <>{children}</>
}

export function useMcpContext() {
  const initialized = useMcpStore((state) => state.initialized)
  const workspaceId = useMcpStore((state) => state.workspaceId)
  const servers = useMcpStore((state) => state.servers)
  const isLoading = useMcpStore((state) => state.isLoading)
  if (!initialized) {
    throw new Error("useMcpContext must be used within an McpProvider")
  }
  return { workspaceId, servers, isLoading }
}
