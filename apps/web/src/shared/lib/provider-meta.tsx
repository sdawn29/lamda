import {
  Anthropic,
  Azure,
  Bedrock,
  Cerebras,
  Cloudflare,
  Cohere,
  DeepSeek,
  Fireworks,
  Github,
  Google,
  Groq,
  HuggingFace,
  Hyperbolic,
  Kimi,
  LeptonAI,
  LmStudio,
  Minimax,
  Mistral,
  Novita,
  Ollama,
  OpenAI,
  OpenCode,
  OpenRouter,
  Perplexity,
  Replicate,
  Together,
  Vercel,
  VertexAI,
  Vllm,
  Voyage,
  Windsurf,
  XAI,
  ZAI,
} from "@lobehub/icons"
import * as React from "react"

const ICON_STROKE_CLASS = "size-3.5 shrink-0 stroke-current"
const ICON_CLASS = "size-3.5 shrink-0 fill-current"

const PROVIDER_META: Record<string, { label: string; icon: React.ReactNode }> =
  {
    anthropic: {
      label: "Anthropic",
      icon: <Anthropic size={14} />,
    },
    openai: {
      label: "OpenAI",
      icon: <OpenAI size={14} />,
    },
    google: {
      label: "Google",
      icon: <Google.Color size={14} />,
    },
    mistral: {
      label: "Mistral",
      icon: <Mistral.Color size={14} />,
    },
    groq: {
      label: "Groq",
      icon: <Groq size={14} />,
    },
    xai: {
      label: "xAI",
      icon: <XAI size={14} />,
    },
    openrouter: {
      label: "OpenRouter",
      icon: <OpenRouter size={14} />,
    },
    "vercel-ai-gateway": {
      label: "Vercel AI Gateway",
      icon: <Vercel size={14} />,
    },
    "amazon-bedrock": {
      label: "Amazon Bedrock",
      icon: <Bedrock.Color size={14} />,
    },
    "google-vertex": {
      label: "Google Vertex AI",
      icon: <VertexAI.Color size={14} />,
    },
    "azure-openai-responses": {
      label: "Azure OpenAI",
      icon: <Azure.Color size={14} />,
    },
    deepseek: {
      label: "DeepSeek",
      icon: <DeepSeek.Color size={14} />,
    },
    "github-copilot": {
      label: "GitHub Copilot",
      icon: <Github size={14} />,
    },
    "openai-codex": {
      label: "OpenAI Codex",
      icon: <OpenAI size={14} />,
    },
    cerebras: {
      label: "Cerebras",
      icon: <Cerebras.Color size={14} />,
    },
    zai: {
      label: "ZAI",
      icon: <ZAI size={14} />,
    },
    "opencode-zen": {
      label: "OpenCode Zen",
      icon: <OpenCode size={14} />,
    },
    "opencode-go": {
      label: "OpenCode Go",
      icon: <OpenCode size={14} />,
    },
    huggingface: {
      label: "Hugging Face",
      icon: <HuggingFace.Color size={14} />,
    },
    fireworks: {
      label: "Fireworks",
      icon: <Fireworks.Color size={14} />,
    },
    "kimi-for-coding": {
      label: "Kimi For Coding",
      icon: <Kimi.Color size={14} />,
    },
    minimax: {
      label: "MiniMax",
      icon: <Minimax.Color size={14} />,
    },
    ollama: {
      label: "Ollama",
      icon: <Ollama size={14} />,
    },
    sglang: {
      label: "SGLang",
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
          <path d="M4 4h16v4H4z" />
          <path d="M4 12h16v4H4z" />
          <path d="M4 20h16v0" />
        </svg>
      ),
    },
    lmstudio: {
      label: "LM Studio",
      icon: <LmStudio size={14} />,
    },
    vllm: {
      label: "vLLM",
      icon: <Vllm.Color size={14} />,
    },
    perplexity: {
      label: "Perplexity",
      icon: <Perplexity.Color size={14} />,
    },
    together: {
      label: "Together AI",
      icon: <Together.Color size={14} />,
    },
    cohere: {
      label: "Cohere",
      icon: <Cohere.Color size={14} />,
    },
    novita: {
      label: "Novita AI",
      icon: <Novita.Color size={14} />,
    },
    "cloudflare-workers": {
      label: "Cloudflare Workers",
      icon: <Cloudflare.Color size={14} />,
    },
    cloudflare: {
      label: "Cloudflare",
      icon: <Cloudflare.Color size={14} />,
    },
    replicate: {
      label: "Replicate",
      icon: <Replicate size={14} />,
    },
    hyperbolic: {
      label: "Hyperbolic",
      icon: <Hyperbolic.Color size={14} />,
    },
    tensorzero: {
      label: "TensorZero",
      icon: (
        <svg viewBox="0 0 24 24" className={ICON_CLASS} aria-hidden>
          <path d="M12 2L4 6v12l8 4 8-4V6l-8-4zm0 2.5L18 8l-6 3-6-3 6-3.5zm-6 6l6 3v6l-6-3v-6zm6 9v-6l6 3v6l-6-3z" />
        </svg>
      ),
    },
    voyage: {
      label: "Voyage AI",
      icon: <Voyage.Color size={14} />,
    },
    codestral: {
      label: "Codestral",
      icon: (
        <svg viewBox="0 0 24 24" className={ICON_CLASS} aria-hidden>
          <path d="M8 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-2M8 3a3 3 0 0 0-3 3v14a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3V6a3 3 0 0 0-3-3H8z" />
          <path d="M9 9l3 3-3 3M12 15h3" />
        </svg>
      ),
    },
    "wings-gpu": {
      label: "Wings GPU",
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
          <path d="M12 2L4 7v10l8 5 8-5V7l-8-5z" />
          <path d="M12 22V12M4 7l8 5 8-5" />
        </svg>
      ),
    },
    windsurf: {
      label: "Windsurf",
      icon: <Windsurf size={14} />,
    },
    "fireworks-inference": {
      label: "Fireworks Inference",
      icon: <Fireworks.Color size={14} />,
    },
    binarybottle: {
      label: "BinaryBottle",
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
          <path d="M8 22h8M12 2v4M7 4l5 2M17 4l-5 2M7 22l5-2M17 22l-5-2" />
          <rect x="9" y="6" width="6" height="12" rx="1" />
        </svg>
      ),
    },
    infercast: {
      label: "Infercast",
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
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v4M12 18v4M2 12h4M18 12h4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
        </svg>
      ),
    },
    lepton: {
      label: "Lepton",
      icon: <LeptonAI.Color size={14} />,
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
