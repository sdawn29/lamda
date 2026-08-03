import { beforeEach, describe, expect, it } from "vitest"
import {
  NO_THREAD_SCOPE,
  activeScope,
  isTabVisible,
  mergeDockPersisted,
  useDockStore,
  type PersistedDockShape,
} from "./store"

// Every test starts from the store's own initial state (not the previous
// test's mutations) — same shape as `useDockStore.getState()` at module load,
// asserted fresh each time so a scope leaking between tests fails loudly
// rather than masking a real bug in the next assertion.
function resetStore(): void {
  useDockStore.setState(
    {
      scopes: {},
      activeScopeId: NO_THREAD_SCOPE,
      singletonHome: {},
      fileTreeWidth: 256,
      reviewFilesWidth: 320,
      draggingTabId: null,
      defaultSizes: { right: 560, bottom: 256 },
    },
    false
  )
}

beforeEach(resetStore)

describe("scope isolation", () => {
  it("opening a tab in scope A leaves scope B untouched", () => {
    const store = useDockStore.getState()
    store.setActiveScope("thread-a")
    store.openTab({
      type: "review",
      singleton: true,
      defaultDock: "right",
      title: "Review",
    })

    store.setActiveScope("thread-b")
    const scopeB = activeScope(useDockStore.getState())
    expect(scopeB.docks.right.tabIds).toEqual([])
    expect(Object.keys(scopeB.tabs)).toHaveLength(0)

    store.setActiveScope("thread-a")
    const scopeA = activeScope(useDockStore.getState())
    expect(scopeA.docks.right.tabIds).toHaveLength(1)
    expect(scopeA.docks.right.isOpen).toBe(true)
  })
})

describe("setDockSize", () => {
  it("updates both the active scope's size and the global defaultSizes", () => {
    const store = useDockStore.getState()
    store.setActiveScope("thread-a")
    store.setDockSize("right", 640)

    const state = useDockStore.getState()
    expect(activeScope(state).docks.right.size).toBe(640)
    expect(state.defaultSizes.right).toBe(640)
  })

  it("seeds a freshly created scope from the current defaultSizes", () => {
    const store = useDockStore.getState()
    // Resize while on thread-a, bumping the global default...
    store.setActiveScope("thread-a")
    store.setDockSize("bottom", 400)

    // ...then visit thread-b for the first time and open a dock-touching
    // action so its scope actually gets created.
    store.setActiveScope("thread-b")
    store.toggleDock("bottom")

    const scopeB = activeScope(useDockStore.getState())
    expect(scopeB.docks.bottom.size).toBe(400)
  })
})

describe("/new handoff", () => {
  it("moves the scratch scope onto the new thread only when handoff is set", () => {
    const store = useDockStore.getState()
    // Compose on /new: activeScopeId defaults to NO_THREAD_SCOPE already.
    store.openTab({
      type: "review",
      singleton: true,
      defaultDock: "right",
      title: "Review",
    })
    expect(
      activeScope(useDockStore.getState()).docks.right.tabIds
    ).toHaveLength(1)

    store.setActiveScope("thread-new", { handoff: true })

    const state = useDockStore.getState()
    expect(state.activeScopeId).toBe("thread-new")
    expect(state.scopes["thread-new"]?.docks.right.tabIds).toHaveLength(1)
    // The scratch scope was consumed, not copied — the next /new visit reads
    // the frozen default again.
    expect(state.scopes[NO_THREAD_SCOPE]).toBeUndefined()
  })

  it("does not hand off without the flag", () => {
    const store = useDockStore.getState()
    store.openTab({
      type: "review",
      singleton: true,
      defaultDock: "right",
      title: "Review",
    })

    store.setActiveScope("thread-other")

    const state = useDockStore.getState()
    expect(state.scopes["thread-other"]).toBeUndefined()
    expect(state.scopes[NO_THREAD_SCOPE]?.docks.right.tabIds).toHaveLength(1)
  })

  it("does not hand off onto a thread that already has a scope", () => {
    const store = useDockStore.getState()
    // thread-existing already has a scope (visited earlier, then navigated
    // away — e.g. via /automations, which is a plausible route in between).
    store.setActiveScope("thread-existing")
    store.toggleDock("right")
    store.setActiveScope(null) // back to NO_THREAD_SCOPE, as if on /automations

    store.openTab({
      type: "review",
      singleton: true,
      defaultDock: "right",
      title: "Review",
    })

    store.setActiveScope("thread-existing", { handoff: true })

    const state = useDockStore.getState()
    // The pre-existing scope's own (toggled-open, tab-less) layout survives —
    // it must not be clobbered by the scratch scope's tab.
    expect(state.scopes["thread-existing"]?.docks.right.tabIds).toEqual([])
    expect(state.scopes["thread-existing"]?.docks.right.isOpen).toBe(true)
  })
})

describe("closeWorkspaceFileTabs", () => {
  it("clears matching previews across every scope, not just the active one", () => {
    const store = useDockStore.getState()
    store.setActiveScope("thread-a")
    store.openFilePreview({
      title: "a.ts",
      filePath: "/ws/a.ts",
      workspacePath: "/ws",
    })

    store.setActiveScope("thread-b")
    store.openFilePreview({
      title: "b.ts",
      filePath: "/ws/b.ts",
      workspacePath: "/ws",
    })
    store.openFilePreview({
      title: "c.ts",
      filePath: "/other/c.ts",
      workspacePath: "/other",
    })

    store.closeWorkspaceFileTabs("/ws")

    const state = useDockStore.getState()
    expect(state.scopes["thread-a"]?.filePreviews).toEqual([])
    expect(state.scopes["thread-b"]?.filePreviews).toHaveLength(1)
    expect(state.scopes["thread-b"]?.filePreviews[0]?.filePath).toBe(
      "/other/c.ts"
    )
  })
})

describe("dropScope", () => {
  it("removes only the targeted scope", () => {
    const store = useDockStore.getState()
    store.setActiveScope("thread-a")
    store.toggleDock("right")
    store.setActiveScope("thread-b")
    store.toggleDock("bottom")

    store.dropScope("thread-a")

    const state = useDockStore.getState()
    expect(state.scopes["thread-a"]).toBeUndefined()
    expect(state.scopes["thread-b"]).toBeDefined()
  })

  it("is a no-op for a scope that was never created", () => {
    const store = useDockStore.getState()
    const before = useDockStore.getState().scopes
    store.dropScope("never-visited")
    expect(useDockStore.getState().scopes).toBe(before)
  })
})

describe("mergeDockPersisted", () => {
  const current = useDockStore.getInitialState()

  it("reads the pre-migration docks.{right,bottom}.size shape into defaultSizes", () => {
    const persisted: PersistedDockShape = {
      docks: { right: { size: 700 }, bottom: { size: 300 } },
    }
    const merged = mergeDockPersisted(persisted, current)
    expect(merged.defaultSizes).toEqual({ right: 700, bottom: 300 })
  })

  it("prefers the new defaultSizes shape over the pre-migration one", () => {
    const persisted: PersistedDockShape = {
      defaultSizes: { right: 800, bottom: 320 },
      docks: { right: { size: 111 }, bottom: { size: 222 } },
    }
    const merged = mergeDockPersisted(persisted, current)
    expect(merged.defaultSizes).toEqual({ right: 800, bottom: 320 })
  })

  it("falls back to current state for missing or garbage payloads", () => {
    expect(mergeDockPersisted(undefined, current).defaultSizes).toEqual(
      current.defaultSizes
    )
    expect(mergeDockPersisted(null, current).defaultSizes).toEqual(
      current.defaultSizes
    )
    expect(
      mergeDockPersisted({ garbage: true }, current).defaultSizes
    ).toEqual(current.defaultSizes)
    expect(
      mergeDockPersisted("not even an object", current).defaultSizes
    ).toEqual(current.defaultSizes)
  })
})

describe("isTabVisible", () => {
  it("returns false when the active scope has never been created", () => {
    const store = useDockStore.getState()
    store.setActiveScope("thread-untouched")
    expect(isTabVisible(useDockStore.getState(), "terminal")).toBe(false)
  })

  it("returns true only for the active tab of an open dock", () => {
    const store = useDockStore.getState()
    store.setActiveScope("thread-a")
    store.openTab({
      type: "terminal",
      singleton: true,
      defaultDock: "bottom",
      title: "Terminal",
    })
    expect(isTabVisible(useDockStore.getState(), "terminal")).toBe(true)

    store.closeDock("bottom")
    expect(isTabVisible(useDockStore.getState(), "terminal")).toBe(false)
  })
})
