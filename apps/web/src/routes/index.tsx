import { createFileRoute } from "@tanstack/react-router"
import { ChatTextbox } from "@/components/chat-textbox"

export const Route = createFileRoute("/")({
  component: Index,
})

function Index() {
  return (
    <div className="flex items-end justify-center p-6">
      <div className="w-full max-w-2xl">
        <ChatTextbox onSend={(msg) => console.log("Sent:", msg)} />
      </div>
    </div>
  )
}
