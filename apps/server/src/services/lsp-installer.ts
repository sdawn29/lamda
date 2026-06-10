/**
 * LSP Installer — runs language-server install commands on behalf of the
 * settings UI.
 *
 * Install commands are fixed recipes from the registry in @lamda/lsp
 * (`npm install -g …`, `rustup component add …`, …); the client only names a
 * language, never a command. One job per language at a time; jobs are kept in
 * memory so the UI can poll status and read the tail of the output on failure.
 */

import { spawn } from "node:child_process";
import { listLanguageRegistry, isCommandOnPath } from "@lamda/lsp";
import type { LspInstallSpec, LspServerCommand } from "@lamda/lsp";

export type InstallStatus = "running" | "success" | "error";

export interface InstallJob {
  language: string;
  /** The binary the job installs (primary or fallback command). */
  target: string;
  /** Human-readable command line, e.g. "npm install -g pyright". */
  commandLine: string;
  status: InstallStatus;
  /** Tail of combined stdout+stderr (capped). */
  output: string;
  startedAt: number;
  finishedAt?: number;
}

const jobs = new Map<string, InstallJob>();

const OUTPUT_CAP = 8 * 1024;
const INSTALL_TIMEOUT_MS = 10 * 60 * 1000;

interface InstallCandidate {
  target: string;
  spec: LspInstallSpec;
}

/** Primary first, then fallbacks — every command that has an install recipe. */
function installCandidates(entry: {
  command: string;
  install?: LspInstallSpec;
  fallbacks: LspServerCommand[];
}): InstallCandidate[] {
  const candidates: InstallCandidate[] = [];
  if (entry.install) candidates.push({ target: entry.command, spec: entry.install });
  for (const fb of entry.fallbacks) {
    if (fb.install) candidates.push({ target: fb.command, spec: fb.install });
  }
  return candidates;
}

/**
 * Pick the first candidate whose package-manager tool is on PATH.
 * Returns null when the language has no recipe or no usable tool.
 */
export async function resolveInstallCandidate(
  language: string,
): Promise<InstallCandidate | null> {
  const entry = listLanguageRegistry().find((e) => e.language === language);
  if (!entry) return null;
  for (const candidate of installCandidates(entry)) {
    if (await isCommandOnPath(candidate.spec.tool)) return candidate;
  }
  return null;
}

export function getInstallJobs(): InstallJob[] {
  return Array.from(jobs.values());
}

/**
 * Start an install for a language. Returns the job, or an error string when
 * the language is unknown/not installable or an install is already running.
 */
export async function startInstall(
  language: string,
): Promise<{ job: InstallJob } | { error: string }> {
  const existing = jobs.get(language);
  if (existing?.status === "running") {
    return { error: `An install for ${language} is already running.` };
  }

  const candidate = await resolveInstallCandidate(language);
  if (!candidate) {
    return {
      error: `No usable installer for ${language}. Install the required package manager (e.g. npm) and retry.`,
    };
  }

  const { spec, target } = candidate;
  const job: InstallJob = {
    language,
    target,
    commandLine: `${spec.command} ${spec.args.join(" ")}`,
    status: "running",
    output: "",
    startedAt: Date.now(),
  };
  jobs.set(language, job);

  const child = spawn(spec.command, spec.args, {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env },
    timeout: INSTALL_TIMEOUT_MS,
  });

  const append = (chunk: Buffer) => {
    job.output = (job.output + chunk.toString("utf8")).slice(-OUTPUT_CAP);
  };
  child.stdout.on("data", append);
  child.stderr.on("data", append);

  child.on("error", (err) => {
    job.status = "error";
    job.output = (job.output + `\n${err.message}`).slice(-OUTPUT_CAP);
    job.finishedAt = Date.now();
  });

  child.on("exit", (code, signal) => {
    if (job.status !== "running") return; // already failed via "error"
    if (code === 0) {
      job.status = "success";
    } else {
      job.status = "error";
      const reason = signal ? `terminated by ${signal}` : `exited with code ${code}`;
      job.output = (job.output + `\n${job.commandLine}: ${reason}`).slice(-OUTPUT_CAP);
    }
    job.finishedAt = Date.now();
    console.log(`[lsp-install] ${language} (${target}): ${job.status}`);
  });

  return { job };
}
