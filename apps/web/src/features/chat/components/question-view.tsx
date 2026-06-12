import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  CheckIcon,
  ChevronLeftIcon,
  CornerDownLeftIcon,
  XIcon,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/shared/lib/utils"
import { Button } from "@/shared/ui/button"
import { Textarea } from "@/shared/ui/textarea"
import { Kbd } from "@/shared/ui/kbd"
import { LoadingSpinner } from "@/shared/ui/loading-spinner"
import { submitQuestionAnswer } from "../api"
import type { ActiveQuestion, Question } from "../lib/active-question"

const OTHER_LABEL = "Other"

/** Sent in place of an answer when the user closes the question UI. */
const DISMISS_ANSWER =
  "[User dismissed the question without answering. Continue without their input.]"

/** Letter shortcuts shown on options — a, b, c, … pressed to toggle them. */
const OPTION_KEYS = "abcdefghijklmnopqrstuvwxyz"

interface QuestionState {
  selected: string[]
  otherActive: boolean
  otherText: string
}

function emptyState(): QuestionState {
  return { selected: [], otherActive: false, otherText: "" }
}

function isAnswered(s: QuestionState): boolean {
  if (s.selected.length > 0) return true
  return s.otherActive && s.otherText.trim().length > 0
}

/** Build the human-readable answer string handed back to the agent. */
function formatAnswer(questions: Question[], states: QuestionState[]): string {
  return questions
    .map((q, i) => {
      const s = states[i]
      const parts = [...s.selected]
      if (s.otherActive && s.otherText.trim()) {
        parts.push(`${OTHER_LABEL}: ${s.otherText.trim()}`)
      }
      return `${q.question}\n→ ${parts.join(", ")}`
    })
    .join("\n\n")
}

interface OptionRowProps {
  label: string
  description?: string
  selected: boolean
  multi: boolean
  hintKey?: string
  onSelect: () => void
}

function OptionRow({
  label,
  description,
  selected,
  multi,
  hintKey,
  onSelect,
}: OptionRowProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "group/opt flex w-full items-start gap-2 rounded-lg px-2 py-1 text-left",
        "transition-colors duration-150 outline-none",
        "focus-visible:ring-2 focus-visible:ring-ring/40",
        selected
          ? "bg-primary/[0.07] dark:bg-primary/[0.1]"
          : "hover:bg-muted/60"
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex size-3.5 shrink-0 items-center justify-center border transition-all duration-150",
          multi ? "rounded-[4px]" : "rounded-full",
          selected
            ? "border-primary bg-primary text-primary-foreground"
            : "border-muted-foreground/35 bg-transparent group-hover/opt:border-primary/50"
        )}
      >
        <CheckIcon
          className={cn(
            "size-2.5 transition-transform duration-150",
            selected ? "scale-100" : "scale-0"
          )}
          strokeWidth={3}
        />
      </span>

      <span className="min-w-0 flex-1 text-xs leading-snug">
        <span className="font-medium text-foreground">{label}</span>
        {description && (
          <span className="text-muted-foreground"> — {description}</span>
        )}
      </span>

      {hintKey && (
        <Kbd
          className={cn(
            "mt-px shrink-0 transition-opacity",
            selected
              ? "bg-primary/15 text-primary opacity-100"
              : "opacity-60 group-hover/opt:opacity-100"
          )}
        >
          {hintKey}
        </Kbd>
      )}
    </button>
  )
}

interface QuestionViewProps {
  sessionId: string
  question: ActiveQuestion
}

export function QuestionView({ sessionId, question }: QuestionViewProps) {
  const { toolCallId, questions } = question
  const [states, setStates] = useState<QuestionState[]>(() =>
    questions.map(emptyState)
  )
  const [currentIndex, setCurrentIndex] = useState(0)
  // Which resolution is in flight — sending the answers or dismissing the tool.
  const [pendingAction, setPendingAction] = useState<"send" | "dismiss" | null>(
    null
  )
  const isSubmitting = pendingAction !== null
  const otherRef = useRef<HTMLTextAreaElement>(null)

  const update = useCallback((qi: number, next: Partial<QuestionState>) => {
    setStates((prev) => prev.map((s, i) => (i === qi ? { ...s, ...next } : s)))
  }, [])

  const toggleOption = useCallback(
    (qi: number, label: string, multi: boolean) => {
      setStates((prev) =>
        prev.map((s, i) => {
          if (i !== qi) return s
          if (multi) {
            const has = s.selected.includes(label)
            return {
              ...s,
              selected: has
                ? s.selected.filter((l) => l !== label)
                : [...s.selected, label],
            }
          }
          // Single-select: choosing a concrete option clears "Other".
          return {
            selected: [label],
            otherActive: false,
            otherText: s.otherText,
          }
        })
      )
    },
    []
  )

  const toggleOther = useCallback((qi: number, multi: boolean) => {
    setStates((prev) =>
      prev.map((s, i) => {
        if (i !== qi) return s
        if (multi) return { ...s, otherActive: !s.otherActive }
        // Single-select: activating "Other" clears option selections.
        return { ...s, otherActive: !s.otherActive, selected: [] }
      })
    )
    // Focus the free-text field on the next paint when turning it on.
    requestAnimationFrame(() => otherRef.current?.focus())
  }, [])

  const answeredCount = useMemo(
    () => states.filter(isAnswered).length,
    [states]
  )
  const allAnswered = answeredCount === questions.length
  const multiQuestion = questions.length > 1
  const activeQuestion = questions[currentIndex] ?? questions[0]
  const activeState = states[currentIndex] ?? emptyState()
  const activeAnswered = isAnswered(activeState)
  const isFirstQuestion = currentIndex === 0
  const isLastQuestion = currentIndex === questions.length - 1

  const handleSubmit = useCallback(async () => {
    if (!allAnswered || isSubmitting) return
    setPendingAction("send")
    try {
      await submitQuestionAnswer(
        sessionId,
        toolCallId,
        formatAnswer(questions, states)
      )
      // Leave the submitting state on — the view unmounts once the tool resolves
      // and the running question clears from the stream.
    } catch (err) {
      setPendingAction(null)
      toast.error("Couldn't send your answer", {
        description: err instanceof Error ? err.message : "Please try again.",
      })
    }
  }, [allAnswered, isSubmitting, sessionId, toolCallId, questions, states])

  const handleDismiss = useCallback(async () => {
    if (isSubmitting) return
    setPendingAction("dismiss")
    try {
      await submitQuestionAnswer(sessionId, toolCallId, DISMISS_ANSWER)
      // View unmounts once the tool resolves, same as a regular answer.
    } catch (err) {
      setPendingAction(null)
      toast.error("Couldn't dismiss the question", {
        description: err instanceof Error ? err.message : "Please try again.",
      })
    }
  }, [isSubmitting, sessionId, toolCallId])

  const goTo = useCallback(
    (idx: number) => {
      setCurrentIndex(Math.min(Math.max(idx, 0), questions.length - 1))
    },
    [questions.length]
  )

  const handleNext = useCallback(() => {
    if (!activeAnswered) return
    goTo(currentIndex + 1)
  }, [activeAnswered, currentIndex, goTo])

  const handleBack = useCallback(() => {
    goTo(currentIndex - 1)
  }, [currentIndex, goTo])

  const handleKeyDown = useCallback(
    (e: globalThis.KeyboardEvent) => {
      if (e.isComposing) return
      const inText =
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLInputElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable)
      // The listener is window-level — leave unrelated text fields (e.g. a
      // search box elsewhere in the app) completely alone.
      if (inText && e.target !== otherRef.current) return

      // ⌘/Ctrl+Enter submits from anywhere, including the free-text field.
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault()
        void handleSubmit()
        return
      }

      // Plain Enter advances (or sends on the last question). Works inside the
      // free-text field too; Shift+Enter still inserts a newline there.
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        if (isLastQuestion) void handleSubmit()
        else handleNext()
        return
      }

      if (inText) return

      // Esc closes the question and lets the agent continue unanswered.
      // Ignored while typing in the free-text field to protect drafts.
      if (e.key === "Escape") {
        e.preventDefault()
        void handleDismiss()
        return
      }

      // ←/→ move between questions without touching the buttons.
      if (multiQuestion && e.key === "ArrowLeft") {
        e.preventDefault()
        handleBack()
        return
      }
      if (multiQuestion && e.key === "ArrowRight") {
        e.preventDefault()
        handleNext()
        return
      }

      // a, b, c, … toggle the matching option for the visible question
      // (ignored while typing and when a modifier is held, e.g. ⌘A).
      if (
        /^[a-z]$/i.test(e.key) &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey
      ) {
        const q = activeQuestion
        const idx = OPTION_KEYS.indexOf(e.key.toLowerCase())
        if (idx >= 0 && idx < q.options.length) {
          e.preventDefault()
          toggleOption(currentIndex, q.options[idx].label, q.multiSelect)
        } else if (idx === q.options.length) {
          e.preventDefault()
          toggleOther(currentIndex, q.multiSelect)
        }
      }
    },
    [
      activeQuestion,
      currentIndex,
      handleBack,
      handleDismiss,
      handleNext,
      handleSubmit,
      isLastQuestion,
      multiQuestion,
      toggleOption,
      toggleOther,
    ]
  )

  // Window-level listener: the shortcuts work as soon as the question appears,
  // without requiring focus to be inside the card first.
  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [handleKeyDown])

  const footerHint = multiQuestion
    ? `${answeredCount}/${questions.length} answered`
    : allAnswered
      ? "⏎ to send"
      : `a–${OPTION_KEYS[Math.min(activeQuestion.options.length, OPTION_KEYS.length - 1)]} to select`

  return (
    <div
      className={cn(
        "flex w-full flex-col rounded-2xl border border-input bg-card shadow-sm",
        "animate-in duration-300 fade-in-0 slide-in-from-bottom-2"
      )}
    >
      {/* Active question — keyed so each step fades in. */}
      <div
        key={currentIndex}
        className={cn(
          "flex max-h-[min(50vh,22rem)] flex-col gap-1.5 overflow-y-auto pt-2.5",
          "animate-in duration-150 fade-in-0"
        )}
      >
        <div className="flex items-baseline justify-between gap-3 px-3">
          <p className="min-w-0 text-xs leading-snug font-medium text-foreground">
            <span className="mr-1.5 text-3xs font-semibold tracking-wider text-muted-foreground uppercase">
              {activeQuestion.header}
            </span>
            {activeQuestion.question}
            {activeQuestion.multiSelect && (
              <span className="ml-1.5 text-3xs font-normal text-muted-foreground">
                choose any
              </span>
            )}
          </p>
          <div className="flex shrink-0 translate-y-[-1px] items-center gap-1.5">
            {multiQuestion && (
              /* Step dots — clickable to jump between questions. */
              <div className="flex items-center gap-1">
                {questions.map((q, i) => (
                  <button
                    key={i}
                    type="button"
                    aria-label={`Go to question ${i + 1}: ${q.header}`}
                    aria-current={i === currentIndex ? "step" : undefined}
                    onClick={() => goTo(i)}
                    className="group/step flex h-4 items-center outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  >
                    <span
                      className={cn(
                        "h-1 rounded-full transition-all duration-200",
                        i === currentIndex
                          ? "w-3.5 bg-primary"
                          : isAnswered(states[i])
                            ? "w-1.5 bg-primary/40 group-hover/step:bg-primary/60"
                            : "w-1.5 bg-muted-foreground/25 group-hover/step:bg-muted-foreground/40"
                      )}
                    />
                  </button>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={handleDismiss}
              disabled={isSubmitting}
              aria-label="Dismiss without answering"
              title="Dismiss without answering (Esc)"
              className={cn(
                "flex size-4 items-center justify-center rounded-sm text-muted-foreground/60",
                "transition-colors outline-none hover:text-foreground",
                "focus-visible:ring-2 focus-visible:ring-ring/40",
                "disabled:pointer-events-none disabled:opacity-50"
              )}
            >
              <XIcon className="size-3.5" />
            </button>
          </div>
        </div>

        <div className="flex flex-col px-1 pb-1">
          {activeQuestion.options.map((opt, oi) => (
            <OptionRow
              key={opt.label}
              label={opt.label}
              description={opt.description}
              multi={activeQuestion.multiSelect}
              selected={activeState.selected.includes(opt.label)}
              hintKey={OPTION_KEYS[oi]}
              onSelect={() =>
                toggleOption(
                  currentIndex,
                  opt.label,
                  activeQuestion.multiSelect
                )
              }
            />
          ))}
          <OptionRow
            label={OTHER_LABEL}
            description="write your own"
            multi={activeQuestion.multiSelect}
            selected={activeState.otherActive}
            hintKey={OPTION_KEYS[activeQuestion.options.length]}
            onSelect={() =>
              toggleOther(currentIndex, activeQuestion.multiSelect)
            }
          />
          {activeState.otherActive && (
            <Textarea
              ref={otherRef}
              value={activeState.otherText}
              onChange={(e) =>
                update(currentIndex, { otherText: e.target.value })
              }
              placeholder="Type your answer…"
              className={cn(
                "mx-2 mt-1 min-h-12 w-auto resize-none rounded-lg text-xs",
                "animate-in duration-150 fade-in-0"
              )}
            />
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-3 px-3 pb-2">
        <span className="truncate text-3xs text-muted-foreground">
          {footerHint}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          {multiQuestion && (
            <Button
              size="sm"
              variant="ghost"
              onClick={handleBack}
              disabled={isFirstQuestion || isSubmitting}
              aria-label="Back"
              className="size-7 p-0"
            >
              <ChevronLeftIcon />
            </Button>
          )}
          {multiQuestion && !isLastQuestion ? (
            <Button
              size="sm"
              onClick={handleNext}
              disabled={!activeAnswered || isSubmitting}
              className="h-7 px-2.5 text-xs"
            >
              Next
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={!allAnswered || isSubmitting}
              className="h-7 px-2.5 text-xs"
            >
              {pendingAction === "send" ? (
                <LoadingSpinner size="sm" />
              ) : (
                <CornerDownLeftIcon className="size-3" />
              )}
              Send
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
