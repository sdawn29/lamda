import { create } from "zustand"

interface SkillsSearchStore {
  query: string
  setQuery: (query: string) => void
}

/** Shared with the title bar, which renders the search input for /skills. */
export const useSkillsSearchStore = create<SkillsSearchStore>()((set) => ({
  query: "",
  setQuery: (query) => set({ query }),
}))
