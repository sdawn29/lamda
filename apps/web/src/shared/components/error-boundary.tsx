import { Component, type ErrorInfo, type ReactNode } from "react"

interface Props {
  children: ReactNode
  fallback?: (error: Error, reset: () => void) => ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack)
  }

  reset = () => this.setState({ error: null })

  render() {
    const { error } = this.state
    if (error) {
      return this.props.fallback ? (
        this.props.fallback(error, this.reset)
      ) : (
        <DefaultErrorFallback error={error} reset={this.reset} />
      )
    }
    return this.props.children
  }
}

function DefaultErrorFallback({
  error,
  reset,
}: {
  error: Error
  reset: () => void
}) {
  return (
    <div className="flex h-svh flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">Something went wrong</p>
        <p className="max-w-sm text-xs text-muted-foreground">{error.message}</p>
      </div>
      <button
        type="button"
        onClick={reset}
        className="rounded border px-3 py-1.5 text-xs hover:bg-muted"
      >
        Try again
      </button>
    </div>
  )
}
