import { apiFetch } from "./client"

export interface Model {
  id: string
  name: string
  provider: string
}

export interface ModelsResponse {
  models: Model[]
}

export function fetchModels(signal?: AbortSignal): Promise<ModelsResponse> {
  return apiFetch<ModelsResponse>("/models", { signal })
}
