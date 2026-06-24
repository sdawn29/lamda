import { Cron } from "croner"
import { getAutomation, listEnabledAutomations } from "@lamda/db"
import { runAutomation } from "./automation-runner.js"

// Active cron jobs keyed by automation id. One job per enabled automation.
const jobs = new Map<string, Cron>()

function fire(automationId: string): void {
  runAutomation(automationId, "scheduled").catch((err: unknown) => {
    console.error(`[automation:${automationId}] scheduled run failed`, err)
  })
}

/** (Re)create the cron job for an automation. Invalid patterns are logged, not thrown. */
export function registerAutomation(id: string, cron: string): void {
  unregisterAutomation(id)
  try {
    // `protect: true` skips a fire if the previous one is still running —
    // belt-and-suspenders alongside the runner's hasActiveRun() guard.
    const job = new Cron(cron, { name: id, protect: true }, () => fire(id))
    jobs.set(id, job)
  } catch (err) {
    console.error(`[automation:${id}] invalid cron "${cron}":`, err)
  }
}

export function unregisterAutomation(id: string): void {
  const job = jobs.get(id)
  if (job) {
    job.stop()
    jobs.delete(id)
  }
}

/** Reconcile an automation's job with its current DB state (enabled + cron). */
export function rescheduleAutomation(id: string): void {
  const automation = getAutomation(id)
  if (!automation || !automation.enabled) {
    unregisterAutomation(id)
    return
  }
  registerAutomation(id, automation.cron)
}

/** Register jobs for every enabled automation. Called once on server start. */
export function startAutomationScheduler(): void {
  for (const automation of listEnabledAutomations()) {
    registerAutomation(automation.id, automation.cron)
  }
  if (jobs.size > 0) {
    console.error(`[automation] scheduled ${jobs.size} automation(s)`)
  }
}

export function stopAutomationScheduler(): void {
  for (const job of jobs.values()) job.stop()
  jobs.clear()
}

/** Validate a cron expression without scheduling it. */
export function isValidCron(expr: string): boolean {
  try {
    new Cron(expr).stop()
    return true
  } catch {
    return false
  }
}
