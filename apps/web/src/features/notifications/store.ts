import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

const MAX_NOTIFICATIONS = 100
const RETENTION_MS = 14 * 24 * 60 * 60 * 1000

// "toast" covers everything mirrored from sonner (see toast-bridge.tsx) —
// thread awaiting/error notices, API errors, save confirmations, etc. all
// already go through `toast.*()`, so there's no separate "thread" kind.
export type NotificationKind = "indexing" | "thread" | "toast" | "generic"

export type NotificationVariant =
  | "success"
  | "error"
  | "warning"
  | "info"
  | "default"

export type NotificationPriority = "low" | "normal" | "high"

export type NotificationAction =
  | {
      type: "open-thread"
      label?: string
      threadId: string
    }
  | {
      type: "open-workspace"
      label?: string
      workspaceId: string
    }

export interface NotificationProgress {
  current: number
  total: number
  phase: string
}

export interface NotificationItem {
  id: string
  kind: NotificationKind
  title: string
  description?: string
  progress?: NotificationProgress
  variant?: NotificationVariant
  priority?: NotificationPriority
  action?: NotificationAction
  workspaceId?: string
  threadId?: string
  createdAt: number
  updatedAt: number
  read: boolean
}

interface NotificationStore {
  items: Record<string, NotificationItem>
  /** Insert or update a notification by id (progress items live-update in place instead of stacking). */
  upsert: (
    id: string,
    fields: Omit<NotificationItem, "id" | "createdAt" | "updatedAt" | "read"> & {
      read?: boolean
    }
  ) => void
  markRead: (id: string) => void
  markAllRead: () => void
  clearRead: () => void
  dismiss: (id: string) => void
  clear: () => void
  prune: () => void
}

function pruneItems(
  items: Record<string, NotificationItem>
): Record<string, NotificationItem> {
  const cutoff = Date.now() - RETENTION_MS
  return Object.fromEntries(
    Object.entries(items)
      .filter(([, item]) => (item.updatedAt ?? item.createdAt) >= cutoff)
      .sort(
        ([, a], [, b]) =>
          (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt)
      )
      .slice(0, MAX_NOTIFICATIONS)
  )
}

export const useNotificationStore = create<NotificationStore>()(
  persist(
    (set) => ({
      items: {},
      upsert: (id, fields) =>
        set((state) => {
          const existing = state.items[id]
          const now = Date.now()
          return {
            items: pruneItems({
              ...state.items,
              [id]: {
                id,
                createdAt: existing?.createdAt ?? now,
                updatedAt: now,
                read: fields.read ?? existing?.read ?? false,
                ...fields,
              },
            }),
          }
        }),
      markRead: (id) =>
        set((state) => {
          const existing = state.items[id]
          if (!existing || existing.read) return state
          return {
            items: {
              ...state.items,
              [id]: { ...existing, read: true },
            },
          }
        }),
      markAllRead: () =>
        set((state) => ({
          items: Object.fromEntries(
            Object.entries(state.items).map(([id, item]) => [
              id,
              item.read ? item : { ...item, read: true },
            ])
          ),
        })),
      clearRead: () =>
        set((state) => ({
          items: Object.fromEntries(
            Object.entries(state.items).filter(([, item]) => !item.read)
          ),
        })),
      dismiss: (id) =>
        set((state) => {
          const rest = { ...state.items }
          delete rest[id]
          return { items: rest }
        }),
      clear: () => set({ items: {} }),
      prune: () => set((state) => ({ items: pruneItems(state.items) })),
    }),
    {
      name: "lamda.notifications.v1",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ items: pruneItems(state.items) }),
      migrate: (persisted) => {
        if (
          !persisted ||
          typeof persisted !== "object" ||
          !("items" in persisted)
        ) {
          return { items: {} }
        }
        const items = (persisted as { items?: Record<string, NotificationItem> })
          .items
        return {
          items: pruneItems(
            Object.fromEntries(
              Object.entries(items ?? {}).map(([id, item]) => [
                id,
                {
                  ...item,
                  id,
                  updatedAt: item.updatedAt ?? item.createdAt ?? Date.now(),
                  priority: item.priority ?? "normal",
                },
              ])
            )
          ),
        }
      },
    }
  )
)

export function selectNotificationList(state: NotificationStore): NotificationItem[] {
  return Object.values(state.items).sort(
    (a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt)
  )
}

export function selectUnreadCount(state: NotificationStore): number {
  return Object.values(state.items).filter(
    (n) => !n.read && n.priority !== "low"
  ).length
}
