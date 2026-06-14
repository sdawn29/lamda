import type { ExtensionFactory } from "@earendil-works/pi-coding-agent";
import type { ToolApprovalBridge } from "./types.js";

/**
 * Build an in-process extension that gates every tool call through the host's
 * approval bridge. The SDK fires `tool_call` before a tool executes; returning
 * `{ block: true }` stops the call and feeds `reason` back to the agent as the
 * tool result. The handler is async, so it can pause until the user decides
 * (the bridge receives `ctx.signal` to bail out if the turn is aborted).
 */
export function createToolApprovalExtension(
  bridge: ToolApprovalBridge,
): ExtensionFactory {
  return (pi) => {
    pi.on("tool_call", async (event, ctx) => {
      const decision = await bridge.decide(
        {
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          input: event.input,
          cwd: ctx.cwd,
        },
        ctx.signal,
      );
      if (!decision.allow) {
        return { block: true, reason: decision.reason ?? "Denied by user" };
      }
      // Allowed — return nothing so execution proceeds.
    });
  };
}
