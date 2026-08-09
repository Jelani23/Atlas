// This is purely a UI presentation concern. The full response text always
// stays intact in state (and in whatever the backend/session history holds)
// — this only decides how much of it the *homepage* shows at once. The
// Conversations view always renders the untouched full text.

const HOME_PREVIEW_MAX_CHARS = 320

export interface ResponsePreview {
  preview: string
  isTruncated: boolean
}

/**
 * Produces a homepage-safe preview of a response: full text if it's short,
 * otherwise a clean cut at the nearest sentence/line boundary before the
 * limit (falling back to a word boundary) with an ellipsis.
 */
export function previewResponse(
  text: string,
  maxChars: number = HOME_PREVIEW_MAX_CHARS,
): ResponsePreview {
  const trimmed = text.trim()
  if (trimmed.length <= maxChars) {
    return { preview: trimmed, isTruncated: false }
  }

  const slice = trimmed.slice(0, maxChars)

  // Prefer cutting at the end of a sentence.
  const sentenceEnd = Math.max(
    slice.lastIndexOf(". "),
    slice.lastIndexOf("! "),
    slice.lastIndexOf("? "),
    slice.lastIndexOf("\n"),
  )

  let cut: string
  if (sentenceEnd > maxChars * 0.4) {
    cut = slice.slice(0, sentenceEnd + 1)
  } else {
    // fall back to the last whole word
    const wordEnd = slice.lastIndexOf(" ")
    cut = wordEnd > 0 ? slice.slice(0, wordEnd) : slice
  }

  return { preview: `${cut.trim()}…`, isTruncated: true }
}

/** Short, single-line preview used for the recent-conversation list. */
export function previewLine(text: string, maxChars = 72): string {
  const trimmed = text.trim().replace(/\s+/g, " ")
  if (trimmed.length <= maxChars) return trimmed
  const wordEnd = trimmed.slice(0, maxChars).lastIndexOf(" ")
  const cut = wordEnd > 0 ? trimmed.slice(0, wordEnd) : trimmed.slice(0, maxChars)
  return `${cut}…`
}
