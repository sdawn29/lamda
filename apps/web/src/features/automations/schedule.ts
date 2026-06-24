export type SchedulePreset = "hourly" | "daily" | "weekly" | "custom"

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

/** Build a 5-field cron expression from the form's preset controls. */
export function buildCron(
  preset: SchedulePreset,
  opts: { minute?: number; hour?: number; weekday?: number; custom?: string },
): string {
  const minute = clamp(opts.minute ?? 0, 0, 59)
  const hour = clamp(opts.hour ?? 9, 0, 23)
  const weekday = clamp(opts.weekday ?? 1, 0, 6)
  switch (preset) {
    case "hourly":
      return `${minute} * * * *`
    case "daily":
      return `${minute} ${hour} * * *`
    case "weekly":
      return `${minute} ${hour} * * ${weekday}`
    case "custom":
      return opts.custom?.trim() || `${minute} ${hour} * * *`
  }
}

/** Best-effort: recover the preset + fields from an existing cron expression. */
export function parseCron(cron: string): {
  preset: SchedulePreset
  minute: number
  hour: number
  weekday: number
  custom: string
} {
  const parts = cron.trim().split(/\s+/)
  const fallback = {
    preset: "custom" as SchedulePreset,
    minute: 0,
    hour: 9,
    weekday: 1,
    custom: cron,
  }
  if (parts.length !== 5) return fallback
  const [min, hr, dom, mon, dow] = parts
  const m = Number(min)
  const h = Number(hr)
  const wd = Number(dow)
  const numeric = (v: string) => /^\d+$/.test(v)

  if (dom === "*" && mon === "*" && dow === "*") {
    if (hr === "*" && numeric(min)) {
      return { preset: "hourly", minute: m, hour: 9, weekday: 1, custom: cron }
    }
    if (numeric(min) && numeric(hr)) {
      return { preset: "daily", minute: m, hour: h, weekday: 1, custom: cron }
    }
  }
  if (dom === "*" && mon === "*" && numeric(dow) && numeric(min) && numeric(hr)) {
    return { preset: "weekly", minute: m, hour: h, weekday: wd, custom: cron }
  }
  return fallback
}

/** Short human-readable summary of a cron expression for list rows. */
export function humanizeCron(cron: string): string {
  const { preset, minute, hour, weekday } = parseCron(cron)
  switch (preset) {
    case "hourly":
      return `Hourly at :${pad(minute)}`
    case "daily":
      return `Daily · ${formatTime(hour, minute)}`
    case "weekly":
      return `${WEEKDAYS[weekday]} · ${formatTime(hour, minute)}`
    default:
      return cron
  }
}

const WEEKDAYS_LONG = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
]

/** A full sentence describing when an automation runs — for the form preview. */
export function describeCron(cron: string): string {
  const { preset, minute, hour, weekday } = parseCron(cron)
  switch (preset) {
    case "hourly":
      return `Runs every hour at :${pad(minute)}`
    case "daily":
      return `Runs every day at ${formatTime(hour, minute)}`
    case "weekly":
      return `Runs every ${WEEKDAYS_LONG[weekday]} at ${formatTime(hour, minute)}`
    default:
      return `Runs on cron schedule “${cron}”`
  }
}

export const WEEKDAY_OPTIONS = WEEKDAYS.map((label, value) => ({ label, value }))

function clamp(n: number, lo: number, hi: number): number {
  if (Number.isNaN(n)) return lo
  return Math.min(hi, Math.max(lo, Math.trunc(n)))
}

function pad(n: number): string {
  return String(n).padStart(2, "0")
}

function formatTime(hour: number, minute: number): string {
  return `${pad(hour)}:${pad(minute)}`
}
