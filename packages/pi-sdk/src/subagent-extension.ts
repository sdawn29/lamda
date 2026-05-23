import { readdir, readFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { Type } from "@earendil-works/pi-ai";
import {
  defineTool,
  type AuthStorage,
  type ExtensionAPI,
  type ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import { createManagedSession } from "./session.js";
import type { SdkConfig, SessionEvent } from "./types.js";

type ThinkingLevel = NonNullable<SdkConfig["thinkingLevel"]>;

interface SubagentDefinition {
  name: string;
  description: string;
  tools: string[];
  thinking?: ThinkingLevel;
  path: string;
}

interface SubagentExtensionOptions {
  authStorage: AuthStorage;
  modelRegistry: ModelRegistry;
  provider?: string;
  model?: string;
  thinkingLevel?: ThinkingLevel;
}

interface SubagentChildTool {
  toolCallId: string;
  toolName: string;
  args: unknown;
  status: "running" | "done" | "error";
  result?: unknown;
  partialResult?: unknown;
  startTime: number;
  duration?: number;
}

const AGENTS_DIR = ".lamda/agents";
const THINKING_LEVELS = new Set(["off", "minimal", "low", "medium", "high", "xhigh"]);
const DEFAULT_TOOLS = ["read", "grep", "find", "ls"];

function parseFrontmatter(content: string): Record<string, string> | null {
  const normalized = content.replace(/^\uFEFF/, "");
  if (!normalized.startsWith("---")) return null;

  const lines = normalized.split(/\r?\n/);
  const result: Record<string, string> = {};

  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim() === "---") return result;
    if (!line.trim() || line.trimStart().startsWith("#")) continue;

    const separator = line.indexOf(":");
    if (separator === -1) continue;

    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (key) result[key] = value.replace(/^['"]|['"]$/g, "");
  }

  return null;
}

function parseTools(value: string | undefined): string[] {
  if (!value) return DEFAULT_TOOLS;
  return value
    .split(",")
    .map((tool) => tool.trim())
    .filter(Boolean);
}

function parseThinking(value: string | undefined): ThinkingLevel | undefined {
  if (!value) return undefined;
  return THINKING_LEVELS.has(value) ? (value as ThinkingLevel) : undefined;
}

async function loadSubagents(cwd: string): Promise<SubagentDefinition[]> {
  const agentsPath = join(cwd, AGENTS_DIR);
  let entries: string[];
  try {
    entries = await readdir(agentsPath);
  } catch {
    return [];
  }

  const agents: SubagentDefinition[] = [];
  for (const entry of entries) {
    const extension = extname(entry).toLowerCase();
    if (![".md", ".yaml", ".yml"].includes(extension)) continue;

    const path = join(agentsPath, entry);
    const frontmatter = parseFrontmatter(await readFile(path, "utf8"));
    if (!frontmatter) continue;

    const name = frontmatter.name?.trim() || basename(entry, extension);
    const description = frontmatter.description?.trim() || `Run the ${name} subagent.`;
    agents.push({
      name,
      description,
      tools: parseTools(frontmatter.tools),
      thinking: parseThinking(frontmatter.thinking),
      path,
    });
  }

  return agents.sort((a, b) => a.name.localeCompare(b.name));
}

function formatAgentList(agents: SubagentDefinition[]) {
  if (agents.length === 0) return `No subagents found in ${AGENTS_DIR}.`;
  return agents
    .map((agent) => `- ${agent.name}: ${agent.description} (tools: ${agent.tools.join(", ")})`)
    .join("\n");
}

function getAgentEndError(event: Extract<SessionEvent, { type: "agent_end" }>) {
  for (let index = event.messages.length - 1; index >= 0; index -= 1) {
    const message = event.messages[index] as { role?: string; errorMessage?: string };
    if (message.role === "assistant" && message.errorMessage) return message.errorMessage;
  }
  return undefined;
}

export function createSubagentExtension(options: SubagentExtensionOptions) {
  return function subagentExtension(pi: ExtensionAPI) {
    pi.registerTool(defineTool({
      name: "subagent",
      label: "Subagent",
      description: `Delegate a task to a named subagent defined in ${AGENTS_DIR}. Use this for focused, isolated investigation or execution.`,
      promptSnippet: `subagent: run a focused child Pi agent from ${AGENTS_DIR} and stream back its output.`,
      parameters: Type.Object({
        agent: Type.Optional(Type.String({ description: "Subagent name from .lamda/agents. Omit to list available subagents." })),
        prompt: Type.Optional(Type.String({ description: "Task to send to the subagent." })),
      }),
      executionMode: "parallel",
      async execute(_toolCallId, params, signal, onUpdate, ctx) {
        const agents = await loadSubagents(ctx.cwd);
        if (!params.agent) {
          return {
            content: [{ type: "text", text: formatAgentList(agents) }],
            details: { agents },
          };
        }

        const agent = agents.find((candidate) => candidate.name === params.agent);
        if (!agent) {
          return {
            content: [{ type: "text", text: `Unknown subagent "${params.agent}".\n\n${formatAgentList(agents)}` }],
            details: { agents },
          };
        }

        const prompt = params.prompt?.trim();
        if (!prompt) {
          return {
            content: [{ type: "text", text: `Provide a prompt for subagent "${agent.name}".` }],
            details: { agent },
          };
        }

        const child = await createManagedSession({
          cwd: ctx.cwd,
          authStorage: options.authStorage,
          modelRegistry: options.modelRegistry,
          provider: ctx.model?.provider ?? options.provider,
          model: ctx.model?.id ?? options.model,
          thinkingLevel: agent.thinking ?? options.thinkingLevel,
          tools: agent.tools,
        });

        const iterator = child.events();
        let output = "";
        let thinking = "";
        let errorMessage: string | undefined;
        const childTools = new Map<string, SubagentChildTool>();
        const publish = () => {
          onUpdate?.({
            content: [{ type: "text", text: output }],
            details: {
              agent: agent.name,
              allowedTools: agent.tools,
              tools: agent.tools,
              thinking,
              sessionFile: child.sessionFile,
              childTools: Array.from(childTools.values()),
            },
          });
        };

        const abort = () => {
          void child.abort();
        };
        signal?.addEventListener("abort", abort, { once: true });

        try {
          const stream = (async () => {
            for await (const event of iterator) {
              if (event.type === "message_update") {
                const assistantEvent = event.assistantMessageEvent;
                if (assistantEvent.type === "text_delta") {
                  output += assistantEvent.delta;
                  publish();
                } else if (assistantEvent.type === "thinking_delta") {
                  thinking += assistantEvent.delta;
                }
              } else if (event.type === "tool_execution_start") {
                childTools.set(event.toolCallId, {
                  toolCallId: event.toolCallId,
                  toolName: event.toolName,
                  args: event.args,
                  status: "running",
                  startTime: Date.now(),
                });
                publish();
              } else if (event.type === "tool_execution_update") {
                const existing = childTools.get(event.toolCallId);
                childTools.set(event.toolCallId, {
                  toolCallId: event.toolCallId,
                  toolName: event.toolName,
                  args: event.args,
                  status: existing?.status ?? "running",
                  startTime: existing?.startTime ?? Date.now(),
                  duration: existing?.duration,
                  result: existing?.result,
                  partialResult: event.partialResult,
                });
                publish();
              } else if (event.type === "tool_execution_end") {
                const existing = childTools.get(event.toolCallId);
                const startTime = existing?.startTime ?? Date.now();
                childTools.set(event.toolCallId, {
                  toolCallId: event.toolCallId,
                  toolName: event.toolName,
                  args: existing?.args ?? {},
                  status: event.isError ? "error" : "done",
                  startTime,
                  duration: Date.now() - startTime,
                  result: event.result,
                  partialResult: existing?.partialResult,
                });
                publish();
              } else if (event.type === "agent_end") {
                errorMessage = getAgentEndError(event);
                break;
              }
            }
          })();

          await child.prompt(prompt);
          await stream;
        } finally {
          signal?.removeEventListener("abort", abort);
          await iterator.return?.(undefined);
          child.dispose();
        }

        if (errorMessage) {
          output = output ? `${output}\n\nSubagent error: ${errorMessage}` : `Subagent error: ${errorMessage}`;
        }

        return {
          content: [{ type: "text", text: output || `${agent.name} completed without text output.` }],
          details: {
            agent: agent.name,
            allowedTools: agent.tools,
            tools: agent.tools,
            thinking,
            sessionFile: child.sessionFile,
            childTools: Array.from(childTools.values()),
            errorMessage,
          },
        };
      },
    }));
  };
}
