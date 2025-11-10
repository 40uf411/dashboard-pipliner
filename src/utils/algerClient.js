const DEFAULT_PORT = 8765
const MAX_CONTENT_PREVIEW = 140

const WS_PROTOCOL_REGEX = /^wss?:\/\//i
const HTTP_PROTOCOL_REGEX = /^https?:\/\//i

/**
 * Build a websocket URL that the Alger server accepts, ensuring protocol, port,
 * and credential query params are present.
 */
export function buildAlgerWebSocketURL(host, username, password) {
  const trimmedHost = (host || '').trim()
  const trimmedUser = (username || '').trim()
  const trimmedPass = (password || '').trim()

  if (!trimmedHost) {
    throw new Error('Server host is required.')
  }
  if (!trimmedUser || !trimmedPass) {
    throw new Error('Username and password are required.')
  }

  let normalized = trimmedHost
  if (HTTP_PROTOCOL_REGEX.test(normalized)) {
    normalized = normalized.replace(/^http/i, 'ws')
  } else if (!WS_PROTOCOL_REGEX.test(normalized)) {
    normalized = `ws://${normalized}`
  }

  const url = new URL(normalized)
  if (!url.port) {
    url.port = String(DEFAULT_PORT)
  }
  if (!url.pathname) {
    url.pathname = '/'
  }
  url.searchParams.set('username', trimmedUser)
  url.searchParams.set('password', trimmedPass)
  return url.toString()
}

function truncate(text, length) {
  if (!text) return ''
  return text.length > length ? `${text.slice(0, length)}...` : text
}

/**
 * Provide a compact textual description of a server frame for terminal logs.
 */
export function describeAlgerFrame(rawPayload) {
  if (typeof rawPayload !== 'string') {
    return '[binary payload]'
  }
  try {
    const parsed = JSON.parse(rawPayload)
    const segments = []
    if (typeof parsed.type !== 'undefined') segments.push(`type ${parsed.type}`)
    if (typeof parsed.id !== 'undefined') segments.push(`id ${parsed.id}`)
    if (typeof parsed.requestId !== 'undefined') segments.push(`req ${parsed.requestId}`)

    let contentPreview = ''
    if (typeof parsed.content !== 'undefined') {
      const body = parsed.content
      if (typeof body === 'string' && body.length) {
        try {
          contentPreview = JSON.stringify(JSON.parse(body))
        } catch {
          contentPreview = body
        }
      } else if (body && typeof body === 'object') {
        contentPreview = JSON.stringify(body)
      } else {
        contentPreview = String(body || '')
      }
    }
    const preview = truncate(contentPreview.replace(/\s+/g, ' ').trim(), MAX_CONTENT_PREVIEW)
    return segments.length ? `${segments.join(' | ')}${preview ? ` :: ${preview}` : ''}` : (preview || rawPayload)
  } catch {
    return truncate(rawPayload.replace(/\s+/g, ' ').trim(), MAX_CONTENT_PREVIEW)
  }
}

export const ALGER_DEFAULT_PORT = DEFAULT_PORT
