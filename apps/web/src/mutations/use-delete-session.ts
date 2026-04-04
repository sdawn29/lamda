import { useMutation } from "@tanstack/react-query"
import { deleteSession } from "@/api/sessions"

export function useDeleteSession() {
  return useMutation({
    mutationFn: (id: string) => deleteSession(id),
  })
}
