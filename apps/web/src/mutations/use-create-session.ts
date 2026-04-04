import { useMutation } from "@tanstack/react-query"
import { createSession, type CreateSessionBody } from "@/api/sessions"

export function useCreateSession() {
  return useMutation({
    mutationFn: (body: CreateSessionBody = {}) => createSession(body),
  })
}
