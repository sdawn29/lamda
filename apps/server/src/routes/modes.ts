import { Hono } from "hono";
import { listModes, type ModeConfig } from "@lamda/pi-sdk";
import { getWorkspace } from "@lamda/db";

/**
 * Available agent modes. The three built-ins (Ask / Plan / Agent) plus any
 * custom modes defined as markdown files in `~/.lamda/modes` (global) or a
 * workspace's `<path>/.lamda/modes` (local). The web mode picker renders this
 * list; see {@link listModes} for resolution and precedence.
 */
const modes = new Hono();

/** Picker-facing shape — the prompt body and tool allowlist stay server-side. */
interface ModeDto {
  id: string;
  label: string;
  description: string;
  color: string;
  icon: string;
  source: ModeConfig["source"];
}

function toDto(config: ModeConfig): ModeDto {
  return {
    id: config.id,
    label: config.label,
    description: config.description,
    color: config.color,
    icon: config.icon,
    source: config.source,
  };
}

modes.get("/modes", (c) => {
  // Scope to a workspace so its local `.lamda/modes` are included; without one,
  // only global + built-in modes are returned.
  const workspaceId = c.req.query("workspaceId");
  const cwd = workspaceId ? getWorkspace(workspaceId)?.path : undefined;
  return c.json({ modes: listModes(cwd).map(toDto) });
});

export default modes;
