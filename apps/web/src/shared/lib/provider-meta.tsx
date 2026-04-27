import * as React from "react"

const ICON_CLASS = "size-3.5 shrink-0 fill-current"
const ICON_STROKE_CLASS = "size-3.5 shrink-0 stroke-current"

const PROVIDER_META: Record<string, { label: string; icon: React.ReactNode }> =
  {
    anthropic: {
      label: "Anthropic",
      icon: (
        <svg viewBox="0 0 24 24" className={ICON_CLASS} aria-hidden>
          <path d="M13.827 3.52h3.603L24 20h-3.603l-6.57-16.48zm-3.654 0H6.57L0 20h3.603l1.732-4.355h5.698l-1.853-4.584-3.19 8.063H6.57L10.173 3.52z" />
        </svg>
      ),
    },
    openai: {
      label: "OpenAI",
      icon: (
        <svg viewBox="0 0 24 24" className={ICON_CLASS} aria-hidden>
          <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08-4.778 2.758a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5Z" />
        </svg>
      ),
    },
    google: {
      label: "Google",
      icon: (
        <svg viewBox="0 0 24 24" className="size-3.5 shrink-0" aria-hidden>
          <path
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            fill="#4285F4"
          />
          <path
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            fill="#34A853"
          />
          <path
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            fill="#FBBC05"
          />
          <path
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            fill="#EA4335"
          />
        </svg>
      ),
    },
    mistral: {
      label: "Mistral",
      icon: (
        <svg viewBox="0 0 24 24" className={ICON_CLASS} aria-hidden>
          <path d="M0 0h4v4H0zm6.667 0h4v4h-4zM0 6.667h4v4H0zm6.667 0h4v4h-4zm6.666 0h4v4h-4zM0 13.333h4v4H0zm6.667 0h4v4h-4zm6.666 0h4v4h-4zm6.667 0h4v4h-4zM13.333 0h4v4h-4zm6.667 0h4v4h-4z" />
        </svg>
      ),
    },
    groq: {
      label: "Groq",
      icon: (
        <svg
          viewBox="0 0 24 24"
          className={ICON_STROKE_CLASS}
          fill="none"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M16 16l5 5" />
        </svg>
      ),
    },
    xai: {
      label: "xAI",
      icon: (
        <svg viewBox="0 0 24 24" className={ICON_CLASS} aria-hidden>
          <path d="M2 2L9.5 12.5 2 22h3l5.75-7.5L16.5 22H22l-7.75-10L22 2h-3l-5.5 7-5.5-7z" />
        </svg>
      ),
    },
    openrouter: {
      label: "OpenRouter",
      icon: (
        <svg
          viewBox="0 0 24 24"
          className={ICON_STROKE_CLASS}
          fill="none"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M3 7h11l-3-3M3 7l3 3" />
          <path d="M21 17H10l3 3M21 17l-3-3" />
        </svg>
      ),
    },
    "vercel-ai-gateway": {
      label: "Vercel AI Gateway",
      icon: (
        <svg viewBox="0 0 24 24" className={ICON_CLASS} aria-hidden>
          <path d="M12 1L24 22H0L12 1z" />
        </svg>
      ),
    },
    "amazon-bedrock": {
      label: "Amazon Bedrock",
      icon: (
        <svg viewBox="0 0 24 24" className={ICON_CLASS} aria-hidden>
          <path d="M12 2L2 7v10l10 5 10-5V7L12 2zm0 2.18L20 8.5v7L12 19.82 4 15.5v-7l8-4.32z" />
        </svg>
      ),
    },
    "google-vertex": {
      label: "Google Vertex AI",
      icon: (
        <svg viewBox="0 0 24 24" className="size-3.5 shrink-0" aria-hidden>
          <path
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            fill="#4285F4"
          />
          <path
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            fill="#34A853"
          />
          <path
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            fill="#FBBC05"
          />
          <path
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            fill="#EA4335"
          />
        </svg>
      ),
    },
    "azure-openai-responses": {
      label: "Azure OpenAI",
      icon: (
        <svg viewBox="0 0 24 24" className={ICON_CLASS} aria-hidden>
          <path d="M9.105 3.5L2 19.5h4.5l1.42-3.85h6.66l-2.04-4.6-3.27 7.45H6.62L11.42 3.5zM14.42 7.5L22 20.5h-5.79L13.5 13z" />
        </svg>
      ),
    },
    deepseek: {
      label: "DeepSeek",
      icon: (
        <svg
          viewBox="0 0 24 24"
          className={ICON_STROKE_CLASS}
          fill="none"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M3 14c2-3 5-3 7-1.5s5 1.5 7-1.5c1 3-1 7-5 8.5-3.5 1.3-7-1-9-6z" />
          <circle cx="16" cy="9" r="0.8" fill="currentColor" stroke="none" />
        </svg>
      ),
    },
    "github-copilot": {
      label: "GitHub Copilot",
      icon: (
        <svg viewBox="0 0 24 24" className={ICON_CLASS} aria-hidden>
          <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
        </svg>
      ),
    },
    "openai-codex": {
      label: "OpenAI Codex",
      icon: (
        <svg viewBox="0 0 24 24" className={ICON_CLASS} aria-hidden>
          <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08-4.778 2.758a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5Z" />
        </svg>
      ),
    },
    cerebras: {
      label: "Cerebras",
      icon: (
        <svg
          viewBox="0 0 24 24"
          className={ICON_STROKE_CLASS}
          fill="none"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <circle cx="6" cy="6" r="1.6" fill="currentColor" stroke="none" />
          <circle cx="18" cy="6" r="1.6" fill="currentColor" stroke="none" />
          <circle cx="6" cy="18" r="1.6" fill="currentColor" stroke="none" />
          <circle cx="18" cy="18" r="1.6" fill="currentColor" stroke="none" />
          <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
          <path d="M7.5 7.5L10.5 10.5M16.5 7.5L13.5 10.5M7.5 16.5L10.5 13.5M16.5 16.5L13.5 13.5" />
        </svg>
      ),
    },
    zai: {
      label: "ZAI",
      icon: (
        <svg viewBox="0 0 24 24" className={ICON_CLASS} aria-hidden>
          <path d="M5 4h14v3.5L9 17h10v3H5v-3.5L15 7H5z" />
        </svg>
      ),
    },
    "opencode-zen": {
      label: "OpenCode Zen",
      icon: (
        <svg
          viewBox="0 0 24 24"
          className={ICON_STROKE_CLASS}
          fill="none"
          strokeWidth="1.6"
          strokeLinecap="round"
          aria-hidden
        >
          <path d="M19.5 12a7.5 7.5 0 1 1-3.2-6.15" />
          <circle cx="18" cy="6" r="1.2" fill="currentColor" stroke="none" />
        </svg>
      ),
    },
    "opencode-go": {
      label: "OpenCode Go",
      icon: (
        <svg
          viewBox="0 0 24 24"
          className={ICON_STROKE_CLASS}
          fill="none"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 3" />
        </svg>
      ),
    },
    huggingface: {
      label: "Hugging Face",
      icon: (
        <svg
          viewBox="0 0 24 24"
          className={ICON_STROKE_CLASS}
          fill="none"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <circle cx="12" cy="12" r="9" />
          <circle cx="9" cy="10.5" r="1.1" fill="currentColor" stroke="none" />
          <circle cx="15" cy="10.5" r="1.1" fill="currentColor" stroke="none" />
          <path d="M8.5 14.5c1 1.5 2.2 2.2 3.5 2.2s2.5-.7 3.5-2.2" />
        </svg>
      ),
    },
    fireworks: {
      label: "Fireworks",
      icon: (
        <svg viewBox="0 0 24 24" className={ICON_CLASS} aria-hidden>
          <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" />
        </svg>
      ),
    },
    "kimi-for-coding": {
      label: "Kimi For Coding",
      icon: (
        <svg viewBox="0 0 24 24" className={ICON_CLASS} aria-hidden>
          <path d="M16.5 3a9 9 0 1 0 4.5 16.8 9 9 0 0 1 0-13.6A8.97 8.97 0 0 0 16.5 3z" />
        </svg>
      ),
    },
    minimax: {
      label: "MiniMax",
      icon: (
        <svg
          height="1em"
          // style={{flex:"none",line-height: }}
          viewBox="0 0 24 24"
          width="1em"
          xmlns="http://www.w3.org/2000/svg"
        >
          <title>Minimax</title>
          <defs>
            <linearGradient
              id="lobe-icons-minimax-_R_0_"
              x1="0%"
              x2="100.182%"
              y1="50.057%"
              y2="50.057%"
            >
              <stop offset="0%" stopColor="#E2167E"></stop>
              <stop offset="100%" stopColor="#FE603C"></stop>
            </linearGradient>
          </defs>
          <path
            d="M16.278 2c1.156 0 2.093.927 2.093 2.07v12.501a.74.74 0 00.744.709.74.74 0 00.743-.709V9.099a2.06 2.06 0 012.071-2.049A2.06 2.06 0 0124 9.1v6.561a.649.649 0 01-.652.645.649.649 0 01-.653-.645V9.1a.762.762 0 00-.766-.758.762.762 0 00-.766.758v7.472a2.037 2.037 0 01-2.048 2.026 2.037 2.037 0 01-2.048-2.026v-12.5a.785.785 0 00-.788-.753.785.785 0 00-.789.752l-.001 15.904A2.037 2.037 0 0113.441 22a2.037 2.037 0 01-2.048-2.026V18.04c0-.356.292-.645.652-.645.36 0 .652.289.652.645v1.934c0 .263.142.506.372.638.23.131.514.131.744 0a.734.734 0 00.372-.638V4.07c0-1.143.937-2.07 2.093-2.07zm-5.674 0c1.156 0 2.093.927 2.093 2.07v11.523a.648.648 0 01-.652.645.648.648 0 01-.652-.645V4.07a.785.785 0 00-.789-.78.785.785 0 00-.789.78v14.013a2.06 2.06 0 01-2.07 2.048 2.06 2.06 0 01-2.071-2.048V9.1a.762.762 0 00-.766-.758.762.762 0 00-.766.758v3.8a2.06 2.06 0 01-2.071 2.049A2.06 2.06 0 010 12.9v-1.378c0-.357.292-.646.652-.646.36 0 .653.29.653.646V12.9c0 .418.343.757.766.757s.766-.339.766-.757V9.099a2.06 2.06 0 012.07-2.048 2.06 2.06 0 012.071 2.048v8.984c0 .419.343.758.767.758.423 0 .766-.339.766-.758V4.07c0-1.143.937-2.07 2.093-2.07z"
            fill="url(#lobe-icons-minimax-_R_0_)"
            fillRule="nonzero"
          ></path>
        </svg>
      ),
    },
  }

export function getProviderMeta(providerId: string) {
  return (
    PROVIDER_META[providerId] ?? {
      label: providerId
        .split(/[-_]/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" "),
      icon: (
        <span className="flex size-3.5 shrink-0 items-center justify-center rounded-sm bg-muted text-[9px] leading-none font-bold text-muted-foreground uppercase">
          {providerId.charAt(0)}
        </span>
      ),
    }
  )
}
