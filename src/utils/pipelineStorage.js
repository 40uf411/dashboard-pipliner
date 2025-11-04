const STORAGE_KEY = 'visual-pipeline-dashboard:pipelines'
const BOARD_KIND = 'visual-pipeline-board'
const BOARD_VERSION = 1

const hasWindow = typeof window !== 'undefined'

const safeLocalStorage = () => {
  if (!hasWindow) return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

const hydratePipeline = (raw) => {
  if (!raw || typeof raw !== 'object') return null
  const {
    id,
    name,
    createdAt,
    updatedAt,
    nodes = [],
    edges = [],
    idSeq = 1000,
    preview = null,
    meta = {},
  } = raw
  if (!id || !name) return null
  return {
    id,
    name,
    createdAt: createdAt || new Date().toISOString(),
    updatedAt: updatedAt || createdAt || new Date().toISOString(),
    nodes: Array.isArray(nodes) ? nodes : [],
    edges: Array.isArray(edges) ? edges : [],
    idSeq: Number.isFinite(idSeq) ? idSeq : 1000,
    preview,
    meta: typeof meta === 'object' && meta ? meta : {},
  }
}

export const readPipelines = () => {
  const storage = safeLocalStorage()
  if (!storage) return []
  const raw = storage.getItem(STORAGE_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map(hydratePipeline)
      .filter(Boolean)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  } catch {
    return []
  }
}

const writePipelines = (pipelines) => {
  const storage = safeLocalStorage()
  if (!storage) return
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(pipelines))
  } catch {
    // ignore quota / serialization errors silently
  }
}

export const upsertPipeline = (pipelines, pipeline) => {
  const hydrated = hydratePipeline(pipeline)
  if (!hydrated) return pipelines
  const next = [...pipelines]
  const idx = next.findIndex((p) => p.id === hydrated.id)
  if (idx >= 0) {
    next[idx] = { ...next[idx], ...hydrated, updatedAt: new Date().toISOString() }
  } else {
    next.unshift({
      ...hydrated,
      createdAt: hydrated.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
  }
  writePipelines(next)
  return next
}

export const deletePipeline = (pipelines, pipelineId) => {
  const next = pipelines.filter((p) => p.id !== pipelineId)
  writePipelines(next)
  return next
}

export const persistPipelines = (pipelines) => {
  writePipelines(pipelines)
}

export const createBoardEnvelope = (pipeline) => {
  const hydrated = hydratePipeline(pipeline)
  if (!hydrated) return null
  return {
    kind: BOARD_KIND,
    version: BOARD_VERSION,
    exportedAt: new Date().toISOString(),
    pipeline: {
      ...hydrated,
    },
  }
}

export const serialiseBoard = (pipeline) => {
  const envelope = createBoardEnvelope(pipeline)
  if (!envelope) return null
  return JSON.stringify(envelope, null, 2)
}

export const parseBoard = (raw) => {
  if (!raw) throw new Error('Empty board content')
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    throw new Error('Invalid board file: not valid JSON')
  }
  if (!parsed || typeof parsed !== 'object') throw new Error('Invalid board file')
  if (parsed.kind !== BOARD_KIND) throw new Error('Unsupported board file')
  if (typeof parsed.version !== 'number' || parsed.version > BOARD_VERSION) {
    throw new Error('Unsupported board version')
  }
  const pipeline = hydratePipeline(parsed.pipeline || {})
  if (!pipeline) throw new Error('Board file does not contain a valid pipeline')
  return pipeline
}

export const slugify = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'pipeline'
