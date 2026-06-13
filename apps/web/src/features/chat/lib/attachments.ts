import type { AttachmentUpload } from "../api"
import type { UserMessage } from "../types"
import type { PendingAttachment } from "../components/chat-textbox"

/**
 * Extract the raw base64 payload from a `data:<mime>;base64,<data>` URL.
 */
function base64FromDataUrl(dataUrl: string): string {
  const commaIndex = dataUrl.indexOf(",")
  return commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl
}

/**
 * Convert input-stage pending attachments into the upload payload sent to the
 * server (base64 data, no preview URL).
 */
export function pendingToUploads(
  attachments: PendingAttachment[]
): AttachmentUpload[] {
  return attachments.map((a) => ({
    id: a.id,
    filename: a.filename,
    mediaType: a.mediaType,
    size: a.size,
    kind: a.kind,
    data: base64FromDataUrl(a.dataUrl),
  }))
}

/**
 * Convert input-stage pending attachments into the display metadata stored on
 * the optimistic user message (keeps the data URL for immediate rendering).
 */
export function pendingToDisplay(
  attachments: PendingAttachment[]
): NonNullable<UserMessage["attachments"]> {
  return attachments.map((a) => ({
    id: a.id,
    filename: a.filename,
    mediaType: a.mediaType,
    size: a.size,
    kind: a.kind,
    dataUrl: a.dataUrl,
  }))
}
