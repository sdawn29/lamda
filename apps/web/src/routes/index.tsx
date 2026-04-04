import { createFileRoute } from "@tanstack/react-router"
import { ChatTextbox } from "@/components/chat-textbox"

export const Route = createFileRoute("/")({
  component: Index,
})

function Index() {
  return (
    <div className="flex h-full flex-col justify-end p-6">
      <div className="mx-auto w-full max-w-2xl">
        <ChatTextbox onSend={(msg) => console.log("Sent:", msg)} />
      </div>
    </div>
  )
}
