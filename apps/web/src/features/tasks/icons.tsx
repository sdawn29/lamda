import {
  Terminal, Play, Code, Zap, Rocket, Package, Server, Database,
  Globe, Wrench, FlaskConical, Cpu, Layers, Settings2,
  Bug, RefreshCw, Upload, Download, Lock, Bolt,
} from "lucide-react"
import { cn } from "@/shared/lib/utils"

export const TASK_ICONS = [
  { id: "terminal",  label: "Terminal",  Icon: Terminal },
  { id: "play",      label: "Play",      Icon: Play },
  { id: "code",      label: "Code",      Icon: Code },
  { id: "zap",       label: "Zap",       Icon: Zap },
  { id: "rocket",    label: "Rocket",    Icon: Rocket },
  { id: "package",   label: "Package",   Icon: Package },
  { id: "server",    label: "Server",    Icon: Server },
  { id: "database",  label: "Database",  Icon: Database },
  { id: "globe",     label: "Globe",     Icon: Globe },
  { id: "wrench",    label: "Wrench",    Icon: Wrench },
  { id: "flask",     label: "Test",      Icon: FlaskConical },
  { id: "cpu",       label: "CPU",       Icon: Cpu },
  { id: "layers",    label: "Layers",    Icon: Layers },
  { id: "settings",  label: "Settings",  Icon: Settings2 },
  { id: "bug",       label: "Debug",     Icon: Bug },
  { id: "refresh",   label: "Refresh",   Icon: RefreshCw },
  { id: "upload",    label: "Upload",    Icon: Upload },
  { id: "download",  label: "Download",  Icon: Download },
  { id: "lock",      label: "Lock",      Icon: Lock },
  { id: "bolt",      label: "Bolt",      Icon: Bolt },
] as const

export type TaskIconId = (typeof TASK_ICONS)[number]["id"]

export function TaskIcon({ id, className }: { id?: string; className?: string }) {
  const entry = TASK_ICONS.find((i) => i.id === id) ?? TASK_ICONS[0]
  return <entry.Icon className={cn("h-3.5 w-3.5", className)} />
}
