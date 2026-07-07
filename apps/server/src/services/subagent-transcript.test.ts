import { describe, expect, it } from "vitest";
import type { SessionEvent } from "@lamda/pi-sdk";
import { SubagentTranscriptRecorder } from "./subagent-transcript.js";

const INFO = {
  agent: "explore",
  agentLabel: "Explore",
  color: "teal",
  icon: "telescope",
  model: "anthropic::claude-sonnet-5",
};

function ev(value: unknown): SessionEvent {
  return value as SessionEvent;
}

function assistantStart(): SessionEvent {
  return ev({ type: "message_start", message: { role: "assistant" } });
}

function textDelta(delta: string): SessionEvent {
  return ev({
    type: "message_update",
    message: { role: "assistant" },
    assistantMessageEvent: { type: "text_delta", delta },
  });
}

function toolStart(id: string, name = "read"): SessionEvent {
  return ev({
    type: "tool_execution_start",
    toolCallId: id,
    toolName: name,
    args: { path: "a.ts" },
  });
}

function toolEnd(id: string, isError = false, result?: unknown): SessionEvent {
  return ev({
    type: "tool_execution_end",
    toolCallId: id,
    toolName: "read",
    result: result ?? { content: [{ type: "text", text: "ok" }] },
    isError,
  });
}

describe("SubagentTranscriptRecorder", () => {
  it("folds assistant deltas and tool events into blocks", () => {
    const recorder = new SubagentTranscriptRecorder(INFO);
    recorder.markRunning();
    recorder.handleEvent(assistantStart());
    recorder.handleEvent(textDelta("Hello "));
    recorder.handleEvent(textDelta("world"));
    expect(recorder.handleEvent(toolStart("t1"))).toBe("eager");
    expect(recorder.handleEvent(toolEnd("t1"))).toBe("eager");

    const snap = recorder.snapshot();
    expect(snap.status).toBe("running");
    expect(snap.blocks).toHaveLength(2);
    expect(snap.blocks[0]).toMatchObject({
      role: "assistant",
      content: "Hello world",
    });
    expect(snap.blocks[1]).toMatchObject({
      role: "tool",
      toolCallId: "t1",
      status: "done",
    });
    expect((snap.blocks[1] as { duration?: number }).duration).toBeTypeOf(
      "number",
    );
    expect(snap.stats.toolCalls).toBe(1);
  });

  it("records usage stats and assistant errors from message_end", () => {
    const recorder = new SubagentTranscriptRecorder(INFO);
    recorder.handleEvent(
      ev({
        type: "message_end",
        message: {
          role: "assistant",
          usage: { totalTokens: 120, cost: { total: 0.5 } },
        },
      }),
    );
    recorder.handleEvent(
      ev({
        type: "message_end",
        message: {
          role: "assistant",
          stopReason: "error",
          errorMessage: "boom",
          usage: { totalTokens: 30, cost: { total: 0.1 } },
        },
      }),
    );
    const snap = recorder.snapshot();
    expect(snap.stats.totalTokens).toBe(150);
    expect(snap.stats.cost).toBeCloseTo(0.6);
    expect(recorder.assistantError).toBe("boom");
  });

  it("returns the last non-empty assistant text as the final report", () => {
    const recorder = new SubagentTranscriptRecorder(INFO);
    recorder.handleEvent(assistantStart());
    recorder.handleEvent(textDelta("first"));
    recorder.handleEvent(assistantStart());
    recorder.handleEvent(textDelta("final report"));
    expect(recorder.lastAssistantText()).toBe("final report");
  });

  it("finish marks still-running tools as interrupted", () => {
    const recorder = new SubagentTranscriptRecorder(INFO);
    recorder.handleEvent(toolStart("t1"));
    recorder.finish("aborted");
    const snap = recorder.snapshot();
    expect(snap.status).toBe("aborted");
    expect(snap.endedAt).toBeTypeOf("number");
    expect(snap.blocks[0]).toMatchObject({ role: "tool", status: "error" });
  });

  it("snapshots have fresh identities each call", () => {
    const recorder = new SubagentTranscriptRecorder(INFO);
    recorder.handleEvent(toolStart("t1"));
    const a = recorder.snapshot();
    const b = recorder.snapshot();
    expect(a).not.toBe(b);
    expect(a.blocks).not.toBe(b.blocks);
    expect(a.blocks[0]).not.toBe(b.blocks[0]);
    expect(a).toEqual(b);
  });

  it("elides middle blocks beyond the cap, keeping head and tail", () => {
    const recorder = new SubagentTranscriptRecorder(INFO);
    for (let i = 0; i < 350; i++) {
      recorder.handleEvent(toolStart(`t${i}`));
      recorder.handleEvent(toolEnd(`t${i}`));
    }
    const snap = recorder.snapshot();
    expect(snap.truncated).toBe(true);
    expect(snap.blocks.length).toBeLessThanOrEqual(300);
    expect(snap.blocks[0]).toMatchObject({ toolCallId: "t0" });
    expect(snap.blocks.at(-1)).toMatchObject({ toolCallId: "t349" });
  });

  it("caps per-block text growth", () => {
    const recorder = new SubagentTranscriptRecorder(INFO);
    recorder.handleEvent(assistantStart());
    const chunk = "x".repeat(10_000);
    recorder.handleEvent(textDelta(chunk));
    recorder.handleEvent(textDelta(chunk));
    recorder.handleEvent(textDelta(chunk));
    const block = recorder.snapshot().blocks[0] as { content: string };
    expect(block.content.length).toBeLessThan(17_000);
    expect(block.content.endsWith("… [truncated]")).toBe(true);
  });

  it("strips images and oversized details from nested tool results", () => {
    const recorder = new SubagentTranscriptRecorder(INFO);
    recorder.handleEvent(toolStart("t1"));
    recorder.handleEvent(
      toolEnd("t1", false, {
        content: [
          { type: "text", text: "fine" },
          { type: "image", data: "AAAA", mimeType: "image/png" },
        ],
        details: { big: "y".repeat(20_000) },
      }),
    );
    const block = recorder.snapshot().blocks[0] as {
      result: { content: { type: string; text?: string }[]; details?: unknown };
    };
    expect(block.result.content[0]).toEqual({ type: "text", text: "fine" });
    expect(block.result.content[1].type).toBe("text");
    expect(block.result.content[1].text).toContain("image omitted");
    expect(block.result.details).toBeUndefined();
  });
});
