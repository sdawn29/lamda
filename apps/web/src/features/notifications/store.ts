import { create } from "zustand"

// "toast" covers everything mirrored from sonner (see toast-bridge.tsx) —
// thread awaiting/error notices, API errors, save confirmations, etc. all
// already go through `toast.*()`, so there's no separate "thread" kind.
export type NotificationKind = "indexing" | "toast" | "generic"

export type NotificationVariant =
  | "success"
  | "error"
  | "warning"
  | "info"
  | "default"

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
  workspaceId?: string
  threadId?: string
  createdAt: number
  read: boolean
}

interface NotificationStore {
  items: Record<string, NotificationItem>
  /** Insert or update a notification by id (progress items live-update in place instead of stacking). */
  upsert: (
    id: string,
    fields: Omit<NotificationItem, "id" | "createdAt" | "read"> & {
      read?: boolean
    }
  ) => void
  markRead: (id: string) => void
  markAllRead: () => void
  dismiss: (id: string) => void
  clear: () => void
}

export const useNotificationStore = create<NotificationStore>()((set) => ({
  items: {},
  upsert: (id, fields) =>
    set((state) => {
      const existing = state.items[id]
      return {
        items: {
          ...state.items,
          [id]: {
            id,
            createdAt: existing?.createdAt ?? Date.now(),
            read: fields.read ?? existing?.read ?? false,
            ...fields,
          },
        },
      }
    }),
  markRead: (id) =>
    set((state) => {
      const existing = state.items[id]
      if (!existing || existing.read) return state
      return { items: { ...state.items, [id]: { ...existing, read: true } } }
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
  dismiss: (id) =>
    set((state) => {
      const { [id]: _removed, ...rest } = state.items
      return { items: rest }
    }),
  clear: () => set({ items: {} }),
}))

export function selectNotificationList(state: NotificationStore): NotificationItem[] {
  return Object.values(state.items).sort((a, b) => b.createdAt - a.createdAt)
}

export function selectUnreadCount(state: NotificationStore): number {
  return Object.values(state.items).filter((n) => !n.read).length
}
