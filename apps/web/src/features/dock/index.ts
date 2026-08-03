export {
  useDockStore,
  activeScope,
  isTabVisible,
  openFileTab,
  openReviewPanel,
  toggleReviewPanel,
} from "./store"
export { DockZone, useIsForeignDockDrag } from "./components/dock-zone"
export type {
  DockId,
  DockTab,
  DockPanelContext,
  FilePreview,
  FileTabPayload,
} from "./types"
