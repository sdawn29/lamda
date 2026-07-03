import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createCliEnv } from "@lamda/cli-env";

const execFileAsync = promisify(execFile);

/**
 * Rejects values that a CLI would interpret as an option flag. Every call uses
 * execFile (no shell), but a leading-dash argument can still be parsed by the
 * CLI as an option (argument injection), e.g. a branch named `--upload-pack=...`.
 */
export function assertNotOption(value: string, label: string): void {
  if (value.startsWith("-")) {
    throw new Error(`Invalid ${label}: must not start with '-'`);
  }
}

export function assertPositiveInt(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Invalid ${label}: must be a positive integer`);
  }
}

function isExecError(
  err: unknown,
): err is { stdout?: string; stderr?: string; code?: number } {
  return typeof err === "object" && err !== null;
}

export interface CliRunResult {
  stdout: string;
  stderr: string;
}

export interface CliRunnerOptions {
  /** The CLI binary to invoke, e.g. "gh" or "glab". */
  binary: string;
  /** Extra env vars merged into createCliEnv (e.g. GH_PROMPT_DISABLED). */
  env?: Record<string, string | undefined>;
  /** Default timeout (ms) for a run() call that doesn't pass its own. */
  defaultTimeoutMs?: number;
  /** `.name` given to thrown errors, e.g. "GhError". */
  errorName: string;
}

export interface CliRunner {
  /** Runs the CLI and returns stdout/stderr. Throws on non-zero exit. */
  run(args: string[], cwd: string, timeout?: number): Promise<CliRunResult>;
  /** Runs the CLI and JSON.parses stdout. */
  runJson<T>(args: string[], cwd: string, timeout?: number): Promise<T>;
  /** Error class thrown by run()/runJson(), named `errorName`. */
  CliError: new (
    message: string,
    stderr: string,
  ) => Error & {
    stderr: string;
  };
}

/**
 * Builds a `run`/`runJson` pair scoped to a single CLI binary, with its own
 * named error class. Used by @lamda/github (`gh`) and @lamda/gitlab (`glab`)
 * so the process-spawning, env-resolution, and error-wrapping logic behind
 * those two CLIs stays in one place instead of two near-identical copies.
 */
export function createCliRunner(opts: CliRunnerOptions): CliRunner {
  const defaultTimeout = opts.defaultTimeoutMs ?? 20000;

  class CliRunnerError extends Error {
    readonly stderr: string;
    constructor(message: string, stderr: string) {
      super(message);
      this.name = opts.errorName;
      this.stderr = stderr;
    }
  }

  async function run(
    args: string[],
    cwd: string,
    timeout = defaultTimeout,
  ): Promise<CliRunResult> {
    try {
      const { stdout, stderr } = await execFileAsync(opts.binary, args, {
        cwd,
        timeout,
        maxBuffer: 1024 * 1024 * 16,
        env: createCliEnv(opts.env ?? {}),
      });
      return { stdout, stderr };
    } catch (err: unknown) {
      if (isExecError(err)) {
        const stderr = typeof err.stderr === "string" ? err.stderr : "";
        const message =
          stderr.trim() ||
          (err as Error).message ||
          `${opts.binary} command failed`;
        throw new CliRunnerError(message, stderr);
      }
      throw new CliRunnerError(`${opts.binary} command failed`, "");
    }
  }

  async function runJson<T>(
    args: string[],
    cwd: string,
    timeout = defaultTimeout,
  ): Promise<T> {
    const { stdout } = await run(args, cwd, timeout);
    return JSON.parse(stdout) as T;
  }

  return { run, runJson, CliError: CliRunnerError };
}
