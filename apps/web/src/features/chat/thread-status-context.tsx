import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react"

export type ThreadStatus = "running" | "idle" | "completed"

interface ThreadStatusContextValue {
  getStatus: (threadId: string) => ThreadStatus
  setStatus: (threadId: string, status: ThreadStatus) => void
}

const ThreadStatusContext = createContext<ThreadStatusContextValue | null>(null)

export function ThreadStatusProvider({ children }: { children: ReactNode }) {
  const [statuses, setStatuses] = useState<Record<string, ThreadStatus>>({})

  const getStatus = useCallback(
    (threadId: string): ThreadStatus => statuses[threadId] ?? "idle",
    [statuses]
  )

  const setStatus = useCallback((threadId: string, status: ThreadStatus) => {
    setStatuses((prev) => ({ ...prev, [threadId]: status }))
  }, [])

  return (
    <ThreadStatusContext.Provider value={{ getStatus, setStatus }}>
      {children}
    </ThreadStatusContext.Provider>
  )
}

export function useThreadStatus(threadId: string): ThreadStatus {
  const ctx = useContext(ThreadStatusContext)
  if (!ctx) throw new Error("useThreadStatus must be used within ThreadStatusProvider")
  return ctx.getStatus(threadId)
}

export function useSetThreadStatus() {
  const ctx = useContext(ThreadStatusContext)
  if (!ctx) throw new Error("useSetThreadStatus must be used within ThreadStatusProvider")
  return ctx.setStatus
}
