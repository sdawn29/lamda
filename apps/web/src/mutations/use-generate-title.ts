import { useMutation } from "@tanstack/react-query"
import { generateTitle } from "@/api/sessions"

export function useGenerateTitle() {
  return useMutation({
    mutationFn: (message: string) => generateTitle(message),
  })
}
