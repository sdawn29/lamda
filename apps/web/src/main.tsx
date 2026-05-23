import { StrictMode } from "react"
import ReactDOM from "react-dom/client"
import {
  RouterProvider,
  createHashHistory,
  createRouter,
} from "@tanstack/react-router"
import { QueryClientProvider } from "@tanstack/react-query"

import "./index.css"

// Import the generated route tree
import { routeTree } from "./routeTree.gen"
import { ThemeProvider } from "./shared/components/theme-provider"
import { KeyboardShortcutsProvider } from "./shared/components/keyboard-shortcuts-provider"
import { queryClient } from "./shared/lib/query-client"

import { ErrorToastProvider } from "./features/chat"
import { initThreadStatusWebSocket } from "./features/chat/thread-status-store"

initThreadStatusWebSocket()

const router = createRouter({ routeTree, history: createHashHistory() })

// Register the router instance for type safety
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}

// Render the app
const rootElement = document.getElementById("root")!
if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement)
  root.render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <KeyboardShortcutsProvider>
          <ThemeProvider>
            <ErrorToastProvider>
              <RouterProvider router={router} />
            </ErrorToastProvider>
          </ThemeProvider>
        </KeyboardShortcutsProvider>
      </QueryClientProvider>
    </StrictMode>
  )
}
