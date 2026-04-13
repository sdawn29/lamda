export type EventSourceCleanup = () => void

export function addEventSourceListener(
  eventSource: EventSource,
  eventName: string,
  listener: (event: Event) => void
): EventSourceCleanup {
  eventSource.addEventListener(eventName, listener)
  return () => {
    eventSource.removeEventListener(eventName, listener)
  }
}

export function addJsonEventSourceListener<T>(
  eventSource: EventSource,
  eventName: string,
  listener: (payload: T, event: MessageEvent) => void
): EventSourceCleanup {
  return addEventSourceListener(eventSource, eventName, (event) => {
    if (!(event instanceof MessageEvent)) return

    try {
      listener(JSON.parse(event.data) as T, event)
    } catch (error) {
      console.error(`[sse:${eventName}]`, error)
    }
  })
}
