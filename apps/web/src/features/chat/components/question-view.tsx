import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react"
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CornerDownLeftIcon,
  SparklesIcon,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/shared/lib/utils"
import { Badge } from "@/shared/ui/badge"
import { Button } from "@/shared/ui/button"
import { Textarea } from "@/shared/ui/textarea"
import { Kbd, KbdGroup } from "@/shared/ui/kbd"
import { LoadingSpinner } from "@/shared/ui/loading-spinner"
import { submitQuestionAnswer } from "../api"
import type { ActiveQuestion, Question } from "../lib/active-question"

const OTHER_LABEL = "Other"

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
        "group/opt relative flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left",
        "transition-[background-color,border-color,box-shadow] duration-150 outline-none",
        "focus-visible:ring-2 focus-visible:ring-ring/40",
        selected
          ? "border-primary/50 bg-primary/[0.06] ring-1 ring-primary/25 ring-inset dark:bg-primary/[0.08]"
          : "border-border bg-background hover:border-primary/30 hover:bg-muted/50"
      )}
    >
      <span
        className={cn(
          "flex size-4 shrink-0 items-center justify-center border transition-all duration-150",
          multi ? "rounded-[5px]" : "rounded-full",
          selected
            ? "scale-100 border-primary bg-primary text-primary-foreground"
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

      <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-1.5">
        <span className="text-xs font-medium text-foreground">{label}</span>
        {description && (
          <span className="text-[0.6875rem] leading-snug text-muted-foreground">
            {description}
          </span>
        )}
      </span>

      {hintKey && (
        <Kbd
          className={cn(
            "transition-opacity",
            selected ? "opacity-0" : "opacity-60 group-hover/opt:opacity-100"
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
  const [isSubmitting, setIsSubmitting] = useState(false)
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
  const footerHint = multiQuestion
    ? `${answeredCount}/${questions.length} answered`
    : allAnswered
      ? "Sends your answer to the agent"
      : "Select an option to continue"

  const handleSubmit = useCallback(async () => {
    if (!allAnswered || isSubmitting) return
    setIsSubmitting(true)
    try {
      await submitQuestionAnswer(
        sessionId,
        toolCallId,
        formatAnswer(questions, states)
      )
      // Leave the submitting state on — the view unmounts once the tool resolves
      // and the running question clears from the stream.
    } catch (err) {
      setIsSubmitting(false)
      toast.error("Couldn't send your answer", {
        description: err instanceof Error ? err.message : "Please try again.",
      })
    }
  }, [allAnswered, isSubmitting, sessionId, toolCallId, questions, states])

  const handleNext = useCallback(() => {
    if (!activeAnswered) return
    setCurrentIndex((idx) => Math.min(idx + 1, questions.length - 1))
  }, [activeAnswered, questions.length])

  const handleBack = useCallback(() => {
    setCurrentIndex((idx) => Math.max(idx - 1, 0))
  }, [])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      const inText =
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLInputElement

      // ⌘/Ctrl+Enter submits from anywhere, including the free-text field.
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault()
        void handleSubmit()
        return
      }

      if (multiQuestion && !inText && e.key === "Enter") {
        e.preventDefault()
        if (isLastQuestion) void handleSubmit()
        else handleNext()
        return
      }

      // 1–9 pick an option for the visible question (ignored while typing).
      if (!inText && /^[1-9]$/.test(e.key)) {
        const q = activeQuestion
        const idx = Number(e.key) - 1
        if (idx < q.options.length) {
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
      handleNext,
      handleSubmit,
      isLastQuestion,
      multiQuestion,
      toggleOption,
      toggleOther,
    ]
  )

  return (
    <div
      onKeyDown={handleKeyDown}
      className={cn(
        "flex w-full flex-col overflow-hidden rounded-2xl border border-input bg-card shadow-sm",
        "animate-in duration-300 fade-in-0 slide-in-from-bottom-2"
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        <SparklesIcon className="size-3 shrink-0 text-primary" />
        <span className="min-w-0 flex-1 truncate text-[0.6875rem] font-medium text-foreground">
          {multiQuestion ? "A few questions for you" : "A quick question"}
        </span>
        {multiQuestion && (
          <span className="shrink-0 text-[0.625rem] text-muted-foreground tabular-nums">
            {currentIndex + 1}/{questions.length}
          </span>
        )}
      </div>

      <div className="mx-2 border-t border-border/50" />

      {/* Active question */}
      <div className="flex max-h-[min(55vh,26rem)] flex-col gap-1.5 overflow-y-auto px-2.5 py-2">
        <p className="text-xs leading-snug font-medium text-foreground">
          <Badge
            variant="outline"
            className="mr-1.5 align-[1px] text-3xs font-semibold tracking-wider text-muted-foreground uppercase"
          >
            {activeQuestion.header}
          </Badge>
          {activeQuestion.question}
          {activeQuestion.multiSelect && (
            <span className="ml-1.5 text-[0.625rem] font-normal text-muted-foreground">
              (choose any)
            </span>
          )}
        </p>

        <div className="flex flex-col gap-1">
          {activeQuestion.options.map((opt, oi) => (
            <OptionRow
              key={opt.label}
              label={opt.label}
              description={opt.description}
              multi={activeQuestion.multiSelect}
              selected={activeState.selected.includes(opt.label)}
              hintKey={String(oi + 1)}
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
            description="Write your own answer"
            multi={activeQuestion.multiSelect}
            selected={activeState.otherActive}
            hintKey={String(activeQuestion.options.length + 1)}
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
              placeholder="Type your answer..."
              className={cn(
                "min-h-12 resize-none text-xs",
                "animate-in duration-200 fade-in-0 slide-in-from-top-1"
              )}
            />
          )}
        </div>
      </div>

      <div className="mx-2 border-t border-border/50" />

      {/* Footer */}
      <div className="flex items-center justify-between gap-3 px-2.5 py-1.5">
        <span className="truncate text-[0.625rem] text-muted-foreground">
          {footerHint}
        </span>
        <div className="flex shrink-0 items-center gap-1.5">
          {multiQuestion && (
            <Button
              size="sm"
              variant="ghost"
              onClick={handleBack}
              disabled={isFirstQuestion || isSubmitting}
              className="px-2"
            >
              <ChevronLeftIcon />
              Back
            </Button>
          )}
          {multiQuestion && !isLastQuestion ? (
            <Button
              size="sm"
              onClick={handleNext}
              disabled={!activeAnswered || isSubmitting}
              className="shrink-0"
            >
              Next
              <ChevronRightIcon />
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={!allAnswered || isSubmitting}
              className="shrink-0"
            >
              {isSubmitting ? (
                <LoadingSpinner size="sm" />
              ) : (
                <CornerDownLeftIcon />
              )}
              Send
              {!isSubmitting && (
                <KbdGroup className="ml-0.5">
                  <Kbd className="bg-primary-foreground/15 text-primary-foreground/90">
                    ⌘
                  </Kbd>
                  <Kbd className="bg-primary-foreground/15 text-primary-foreground/90">
                    ⏎
                  </Kbd>
                </KbdGroup>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
