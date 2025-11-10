import { useEffect, useMemo, useRef, useState } from 'react'
import { TbHierarchy2, TbDownload, TbPlugConnectedX } from 'react-icons/tb'
import { FiGitBranch, FiEdit3 } from 'react-icons/fi'
import { IoSave, IoOpen } from 'react-icons/io5'
import { RiDownloadCloud2Fill, RiUploadCloud2Fill } from 'react-icons/ri'
import { MdDisplaySettings, MdDeleteOutline, MdCloudSync } from 'react-icons/md'
import { LuSquareTerminal, LuLayoutList, LuDownload } from 'react-icons/lu'
import { HiOutlineViewGrid } from 'react-icons/hi'
import {
  BsFileEarmark,
  BsFileEarmarkBinary,
  BsFileEarmarkCode,
  BsFileEarmarkEasel,
  BsFileEarmarkSpreadsheet,
  BsFileEarmarkFont,
  BsFileEarmarkImage,
  BsFileEarmarkMusic,
  BsFileEarmarkPdf,
  BsFileEarmarkPlay,
  BsFileEarmarkRichtext,
} from 'react-icons/bs'
import { GrConnect } from 'react-icons/gr'
import reactLogo from '../assets/react.svg'
import NodePreview from './NodePreview.jsx'
import { NODE_SECTIONS, NODE_TEMPLATES } from '../nodes/nodeDefinitions.js'

const OUTPUT_VIEW_PREF_KEY = 'visual-pipeline-dashboard:outputs-view'

const FILE_TYPE_ICONS = {
  general: BsFileEarmark,
  binary: BsFileEarmarkBinary,
  bin: BsFileEarmarkBinary,
  code: BsFileEarmarkCode,
  presentation: BsFileEarmarkEasel,
  slides: BsFileEarmarkEasel,
  sheets: BsFileEarmarkSpreadsheet,
  spreadsheet: BsFileEarmarkSpreadsheet,
  text: BsFileEarmarkFont,
  txt: BsFileEarmarkFont,
  image: BsFileEarmarkImage,
  img: BsFileEarmarkImage,
  audio: BsFileEarmarkMusic,
  music: BsFileEarmarkMusic,
  pdf: BsFileEarmarkPdf,
  video: BsFileEarmarkPlay,
  richtext: BsFileEarmarkRichtext,
  word: BsFileEarmarkRichtext,
}

const normaliseTypeKey = (value) => {
  if (typeof value !== 'string') return 'general'
  const normalised = value.toLowerCase().replace(/[^a-z]/g, '')
  return normalised || 'general'
}

const getFileTypeIcon = (type) => {
  const key = normaliseTypeKey(type)
  return FILE_TYPE_ICONS[key] || FILE_TYPE_ICONS.general
}

const formatTypeLabel = (type) => {
  if (!type) return 'General'
  return type
    .toString()
    .split(/[\s/_-]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

const formatExecutionTimestamp = (value) => {
  if (!value) return 'No completed runs yet'
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown execution time'
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const detectTypeFromMime = (mime) => {
  if (typeof mime !== 'string') return null
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'
  if (mime.includes('pdf')) return 'pdf'
  if (mime.includes('presentation') || mime.includes('powerpoint')) return 'presentation'
  if (mime.includes('sheet') || mime.includes('excel')) return 'sheets'
  if (mime.includes('word') || mime.includes('rtf')) return 'richtext'
  if (mime.includes('text')) return 'text'
  if (mime.includes('json') || mime.includes('xml') || mime.includes('yaml') || mime.includes('script')) return 'code'
  if (mime.includes('binary') || mime.includes('octet')) return 'binary'
  return null
}

const extractFileExtension = (value) => {
  if (typeof value !== 'string' || !value.trim()) return ''
  const basename = value.split(/[\\/]/).pop() || value
  const idx = basename.lastIndexOf('.')
  if (idx === -1) return ''
  return basename.slice(idx + 1).toLowerCase()
}

const detectTypeFromExtension = (extension) => {
  if (!extension) return null
  const map = {
    jpg: 'image',
    jpeg: 'image',
    png: 'image',
    gif: 'image',
    svg: 'image',
    webp: 'image',
    bmp: 'image',
    mp4: 'video',
    mov: 'video',
    avi: 'video',
    mkv: 'video',
    mp3: 'audio',
    wav: 'audio',
    flac: 'audio',
    m4a: 'audio',
    json: 'code',
    js: 'code',
    ts: 'code',
    py: 'code',
    ipynb: 'code',
    html: 'code',
    css: 'code',
    yaml: 'code',
    yml: 'code',
    xml: 'code',
    sql: 'code',
    npy: 'binary',
    npz: 'binary',
    bin: 'binary',
    dat: 'binary',
    h5: 'binary',
    hdf5: 'binary',
    gz: 'binary',
    tar: 'binary',
    zip: 'binary',
    pdf: 'pdf',
    ppt: 'presentation',
    pptx: 'presentation',
    key: 'presentation',
    csv: 'sheets',
    xls: 'sheets',
    xlsx: 'sheets',
    ods: 'sheets',
    doc: 'richtext',
    docx: 'richtext',
    rtf: 'richtext',
    txt: 'text',
    log: 'text',
    md: 'text',
  }
  return map[extension] || null
}

const formatFileSize = (size) => {
  const value = Number(size)
  if (!Number.isFinite(value) || value < 0) return null
  if (value < 1024) return `${value} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let unitIndex = 0
  let result = value / 1024
  while (result >= 1024 && unitIndex < units.length - 1) {
    result /= 1024
    unitIndex += 1
  }
  return `${result.toFixed(result >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
}

const formatModifiedTimestamp = (value) => {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function NodesPanel({ onAdd, disabled }) {
  const [open, setOpen] = useState(() => NODE_SECTIONS.map((sec) => sec.key))
  const [nodeSpawnActive, setNodeSpawnActive] = useState(false)
  const nodeSpawnRafRef = useRef(null)
  const toggle = (key) =>
    setOpen((arr) => (arr.includes(key) ? arr.filter((k) => k !== key) : [...arr, key]))

  useEffect(() => {
    setNodeSpawnActive(false)
    if (nodeSpawnRafRef.current) cancelAnimationFrame(nodeSpawnRafRef.current)
    nodeSpawnRafRef.current = requestAnimationFrame(() => setNodeSpawnActive(true))
    return () => {
      if (nodeSpawnRafRef.current) cancelAnimationFrame(nodeSpawnRafRef.current)
    }
  }, [])

  let previewIndex = 0

  return (
    <div className="left-panel" onMouseDown={(e) => e.stopPropagation()}>
      <div className="panel-header">Nodes</div>
      <div className="panel-body">
        {NODE_SECTIONS.map((sec) => (
          <div key={sec.key} className="panel-section">
            <div
              className="collapse-btn"
              role="button"
              tabIndex={0}
              onClick={() => toggle(sec.key)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && toggle(sec.key)}
            >
              <span className={`chev ${open.includes(sec.key) ? 'open' : ''}`}>&gt;</span>
              {sec.title}
            </div>
            {open.includes(sec.key) ? (
              <div className={`preview-grid${nodeSpawnActive ? ' node-wave' : ''}`}>
                {sec.items.map((key) => {
                  const template = NODE_TEMPLATES[key]
                  if (!template) return null
                  const preview = template.preview || {}
                  const description = preview.description || ''
                  const takes = preview.takes || ''
                  const returns = preview.returns || ''
                  const delay = 120 + previewIndex * 70
                  previewIndex += 1
                  return (
                    <NodePreview
                      key={key}
                      title={template.title}
                      subtitle={template.subtitle}
                      color={template.color}
                      draggable={!disabled}
                      description={description}
                      takes={takes}
                      returns={returns}
                      className={nodeSpawnActive ? 'node-enter' : undefined}
                      style={nodeSpawnActive ? { '--spawn-delay': `${delay}ms` } : undefined}
                      onClick={() => onAdd(key)}
                      onDragStart={(e) => {
                        if (disabled) return
                        e.dataTransfer.setData('application/reactflow', key)
                        e.dataTransfer.effectAllowed = 'move'
                      }}
                    />
                  )
                })}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  )
}

function EmptyPanel({ title }) {
  return (
    <div className="left-panel">
      <div className="panel-header">{title}</div>
      <div className="panel-body muted-text">No content yet.</div>
    </div>
  )
}

function OutputsPanel({
  files = [],
  lastExecutionAt,
  onDownload = () => {},
  executions = [],
  selectedExecutionId,
  onSelectExecution = () => {},
  executionMeta = null,
  executionsLoading = false,
  filesLoading = false,
}) {
  const [viewMode, setViewMode] = useState(() => {
    if (typeof window === 'undefined') return 'list'
    try {
      const stored = window.localStorage.getItem(OUTPUT_VIEW_PREF_KEY)
      return stored === 'grid' ? 'grid' : 'list'
    } catch {
      return 'list'
    }
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(OUTPUT_VIEW_PREF_KEY, viewMode)
    } catch {
      // ignore storage errors
    }
  }, [viewMode])

  const totalFiles = Array.isArray(files) ? files.length : 0
  const executedLabel = formatExecutionTimestamp(
    executionMeta?.completed_at || executionMeta?.started_at || lastExecutionAt
  )
  const panelClassName = `left-panel outputs-panel${viewMode === 'grid' ? ' outputs-panel-grid' : ''}`
  const executionOptions = useMemo(() => {
    if (!Array.isArray(executions)) return []
    return executions
      .filter((execution) => execution?.id)
      .map((execution) => {
        const pipelineName =
          execution?.graph?.pipeline?.name ||
          execution?.graph?.name ||
          execution?.pipeline_id ||
          'Untitled pipeline'
        const statusLabel = formatTypeLabel(execution?.status || 'unknown')
        const timeLabel = formatExecutionTimestamp(
          execution?.completed_at || execution?.started_at || null
        )
        return {
          id: execution.id,
          label: `${pipelineName} · ${statusLabel} · ${timeLabel}`,
        }
      })
  }, [executions])
  const hasExecutionOptions = executionOptions.length > 0
  const pipelineName =
    executionMeta?.graph?.pipeline?.name ||
    executionMeta?.graph?.name ||
    executionMeta?.pipeline_id ||
    (executionMeta ? 'Ad-hoc execution' : null)
  const statusLabel = executionMeta ? formatTypeLabel(executionMeta.status || 'unknown') : null
  const statusSlug = (executionMeta?.status || 'unknown').toLowerCase()
  const requestedBy = executionMeta?.requested_by || (executionMeta ? 'Unknown' : null)
  const sourceLabel = executionMeta?.source ? formatTypeLabel(executionMeta.source) : null

  const getFileType = (entry) => {
    if (!entry || typeof entry !== 'object') return 'general'
    const extension = extractFileExtension(entry.name || entry.filename || entry.path || '')
    const typeCandidates = [
      detectTypeFromMime(entry.mimeType),
      detectTypeFromMime(entry.contentType),
      detectTypeFromExtension(extension),
      entry.type,
      entry.kind,
      entry.category,
      entry.format,
    ].filter(Boolean)
    return typeCandidates.length ? typeCandidates[0] : 'general'
  }

  const preparedFiles = useMemo(() => {
    if (!Array.isArray(files)) return []
    return files.map((file, index) => {
      const type = getFileType(file)
      const Icon = getFileTypeIcon(type)
      const fallbackName = `Output ${index + 1}`
      const pathDisplay = file?.path || file?.relativePath || null
      const categoryLabel = formatTypeLabel(file?.category || file?.node || file?.source || 'Output')
      const sizeLabel = formatFileSize(file?.sizeBytes ?? file?.size_bytes)
      const modifiedLabel = formatModifiedTimestamp(file?.modifiedAt ?? file?.modified_at)
      const mimeLabel = file?.mimeType || file?.media_type || file?.contentType || file?.content_type || null
      return {
        ...file,
        _id: file?.id || file?.uuid || `${fallbackName}-${index}`,
        _typeLabel: formatTypeLabel(type),
        _Icon: Icon,
        _displayName: file?.name || file?.filename || fallbackName,
        _categoryLabel: categoryLabel,
        _pathDisplay: pathDisplay,
        _sizeLabel: sizeLabel,
        _modifiedLabel: modifiedLabel,
        _mimeLabel: mimeLabel,
      }
    })
  }, [files])

  const renderEmpty = (
    <div className="output-empty">
      <p>
        {!hasExecutionOptions
          ? 'No tracked outputs yet.'
          : selectedExecutionId
              ? 'No files recorded for this execution yet.'
              : 'Select an execution to view its outputs.'}
      </p>
      <p className="muted-text">
        {!hasExecutionOptions
          ? 'Enable track output on a node and run the pipeline to collect files.'
          : selectedExecutionId
              ? 'Enable track output on the relevant nodes and rerun the pipeline to collect artifacts.'
              : 'Use the dropdown above to choose which execution to inspect.'}
      </p>
    </div>
  )

  const renderList = () => {
    if (!preparedFiles.length) return renderEmpty
    return (
      <div className="output-list">
        {preparedFiles.map((file) => (
          <div key={file._id} className="output-row">
            <div className="output-row-main output-row-details">
              <div className="output-file-icon" aria-hidden="true">
                <file._Icon size={22} />
              </div>
              <div className="output-info-block">
                <div className="output-name">{file._displayName}</div>
                {file._pathDisplay ? (
                  <div className="output-path" title={file._pathDisplay}>
                    {file._pathDisplay}
                  </div>
                ) : null}
                <div className="output-sub">
                  {file._categoryLabel ? <span>{file._categoryLabel}</span> : null}
                  {file._categoryLabel && file._typeLabel ? (
                    <span className="output-dot">•</span>
                  ) : null}
                  {file._typeLabel ? (
                    <span className="output-type-label">{file._typeLabel}</span>
                  ) : null}
                </div>
                <div className="output-meta output-meta-inline">
                  {file._sizeLabel ? <span className="output-chip">{file._sizeLabel}</span> : null}
                  {file._mimeLabel ? <span className="output-chip">{file._mimeLabel}</span> : null}
                  {file._modifiedLabel ? (
                    <span className="output-chip">{file._modifiedLabel}</span>
                  ) : null}
                </div>
              </div>
            </div>
            <button
              type="button"
              className="output-row-download"
              onClick={() => onDownload(file)}
              aria-label={`Download ${file._displayName}`}
            >
              <LuDownload size={20} />
              <span>Download</span>
            </button>
          </div>
        ))}
      </div>
    )
  }

  const renderGrid = () => {
    if (!preparedFiles.length) return renderEmpty
    return (
      <div className="output-grid">
        {preparedFiles.map((file) => (
          <div key={file._id} className="output-card">
            <div className="output-card-icon" aria-hidden="true">
              <file._Icon size={26} />
            </div>
            <div className="output-card-name">{file._displayName}</div>
            {file._pathDisplay ? (
              <div className="output-card-path" title={file._pathDisplay}>
                {file._pathDisplay}
              </div>
            ) : null}
            <div className="output-card-sub">
              {file._categoryLabel ? <span>{file._categoryLabel}</span> : null}
              {file._categoryLabel && file._typeLabel ? <span className="output-dot">•</span> : null}
              {file._typeLabel ? <span>{file._typeLabel}</span> : null}
            </div>
            {file._sizeLabel || file._mimeLabel || file._modifiedLabel ? (
              <div className="output-card-meta">
                {file._sizeLabel ? <span className="output-chip">{file._sizeLabel}</span> : null}
                {file._mimeLabel ? <span className="output-chip">{file._mimeLabel}</span> : null}
                {file._modifiedLabel ? (
                  <span className="output-chip">{file._modifiedLabel}</span>
                ) : null}
              </div>
            ) : null}
            <button
              type="button"
              className="output-card-download"
              onClick={() => onDownload(file)}
              aria-label={`Download ${file._displayName}`}
              title="Download"
            >
              <LuDownload size={18} />
            </button>
          </div>
        ))}
      </div>
    )
  }

  const executionIdLabel = executionMeta?.id || '—'
  const startedLabel = executionMeta?.started_at ? formatExecutionTimestamp(executionMeta.started_at) : '—'
  const completedLabel = executionMeta?.completed_at
    ? formatExecutionTimestamp(executionMeta.completed_at)
    : executionMeta
        ? executionMeta.status === 'finished'
            ? 'Awaiting timestamp'
            : 'In progress'
        : '—'
  const statusClass = statusSlug.replace(/[^a-z0-9-]/g, '') || 'unknown'
  const executionSummary = executionMeta ? (
    <div className="execution-summary">
      <div className="execution-summary-grid">
        <div className="execution-summary-card execution-summary-id">
          <span className="execution-summary-label">Execution ID</span>
          <span className="execution-summary-value mono" title={executionIdLabel}>
            {executionIdLabel}
          </span>
        </div>
        <div className="execution-summary-card">
          <span className="execution-summary-label">Pipeline</span>
          <span className="execution-summary-value">{pipelineName || 'Untitled pipeline'}</span>
        </div>
        <div className="execution-summary-card">
          <span className="execution-summary-label">Status</span>
          <span className={`execution-status-pill status-${statusClass}`}>{statusLabel}</span>
        </div>
        <div className="execution-summary-card">
          <span className="execution-summary-label">Requested By</span>
          <span className="execution-summary-value">{requestedBy}</span>
        </div>
        <div className="execution-summary-card">
          <span className="execution-summary-label">Source</span>
          <span className="execution-summary-value">{sourceLabel || 'Unknown'}</span>
        </div>
        <div className="execution-summary-card">
          <span className="execution-summary-label">Started</span>
          <span className="execution-summary-value">{startedLabel}</span>
        </div>
        <div className="execution-summary-card">
          <span className="execution-summary-label">Completed</span>
          <span className="execution-summary-value">{completedLabel}</span>
        </div>
      </div>
      {filesLoading ? (
        <div className="execution-summary-note">
          <div className="loading-spinner tiny" />
          <span>Fetching outputs...</span>
        </div>
      ) : null}
    </div>
  ) : null

  return (
    <div className={panelClassName} onMouseDown={(e) => e.stopPropagation()}>
      <div className="panel-header output-header">
        <div className="output-header-meta">
          <span className="output-header-title">Outputs</span>
          <div className="output-header-sub">
            <span>{totalFiles} file{totalFiles === 1 ? '' : 's'}</span>
            <span className="output-dot">•</span>
            <span>{executedLabel}</span>
          </div>
        </div>
        <div className="output-header-controls">
          {hasExecutionOptions ? (
            <div className={`execution-select${executionsLoading ? ' disabled' : ''}`}>
              <select
                value={selectedExecutionId || ''}
                onChange={(e) => onSelectExecution && onSelectExecution(e.target.value)}
                disabled={executionsLoading}
                aria-label="Select execution"
              >
                {!selectedExecutionId ? (
                  <option value="" disabled>
                    Select execution
                  </option>
                ) : null}
                {executionOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div className="output-view-toggle" role="group" aria-label="Toggle output view">
            <button
              type="button"
              className={`output-view-btn${viewMode === 'list' ? ' active' : ''}`}
              onClick={() => setViewMode('list')}
              aria-pressed={viewMode === 'list'}
              title="List view"
            >
              <LuLayoutList size={18} />
            </button>
            <button
              type="button"
              className={`output-view-btn${viewMode === 'grid' ? ' active' : ''}`}
              onClick={() => setViewMode('grid')}
              aria-pressed={viewMode === 'grid'}
              title="Grid view"
            >
              <HiOutlineViewGrid size={18} />
            </button>
          </div>
        </div>
      </div>
      <div className="panel-body output-panel-body">
        {executionSummary}
        {viewMode === 'grid' ? renderGrid() : renderList()}
      </div>
    </div>
  )
}

function TerminalPanel({
  connected,
  connecting,
  serverHost,
  serverUser,
  serverPassword,
  onServerHostChange,
  onServerUserChange,
  onServerPasswordChange,
  logs = [],
  onConnect,
  onDisconnect,
}) {
  const displayedLogs = Array.isArray(logs) ? logs : []
  const [disconnecting, setDisconnecting] = useState(false)

  useEffect(() => {
    if (!connected) setDisconnecting(false)
  }, [connected])

  const hint = connecting
    ? 'Connecting to backend...'
    : disconnecting
        ? 'Disconnecting from backend...'
        : connected
            ? 'Front <-> Server stream'
            : 'Not connected - configure backend'

  const handleDownloadLogs = () => {
    if (!displayedLogs.length) return
    const logText = displayedLogs
      .map((entry) => `[${entry.time}] ${(entry.source || '').toUpperCase()} ${entry.message}`)
      .join('\n')
    const blob = new Blob([logText], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `terminal-log-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const handleConnectSubmit = (e) => {
    e.preventDefault()
    if (connecting) return
    onConnect && onConnect()
  }

  const handleToggleConnection = () => {
    if (connecting || disconnecting) return
    if (connected) {
      setDisconnecting(true)
      onDisconnect && onDisconnect()
      return
    }
    onConnect && onConnect()
  }

  const buttonBusy = connecting || disconnecting
  const showConnecting = connecting && !connected
  const showDisconnecting = disconnecting && connected
  const overlayActive = buttonBusy
  const overlayText = showDisconnecting ? 'Tearing down session...' : 'Establishing secure tunnel...'

  return (
    <div className="left-panel terminal-panel" onMouseDown={(e) => e.stopPropagation()}>
      <div className="panel-header terminal-header">
        <div className="terminal-title-block">
          <span>Terminal</span>
          <span className="terminal-hint">{hint}</span>
        </div>
        <div className="terminal-actions">
          <button
            type="button"
            className="btn-primary"
            onClick={handleToggleConnection}
            disabled={
              buttonBusy ||
              (!connected && !onConnect) ||
              (connected && !onDisconnect)
            }
          >
            {showConnecting ? (
              'Connecting...'
            ) : showDisconnecting ? (
              'Disconnecting...'
            ) : connected ? (
              <>
                <TbPlugConnectedX size={16} />
                Disconnect
              </>
            ) : (
              <>
                <GrConnect size={16} />
                Connect
              </>
            )}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={handleDownloadLogs}
            disabled={!displayedLogs.length}
          >
            <RiDownloadCloud2Fill size={16} />
            Download log
          </button>
        </div>
      </div>
      <div className="terminal-shell">
        <div className="terminal-chrome" aria-hidden="true">
          <span className="terminal-title">session: dashboard-preview</span>
        </div>
        <div
          className={`terminal-viewport ${connected ? 'state-connected' : 'state-disconnected'}${
            buttonBusy ? ' is-transitioning' : ''
          }`}
        >
          <div className="terminal-view terminal-view-log" aria-hidden={!connected}>
            <div className="terminal-body">
              {displayedLogs.length ? (
                displayedLogs.map((entry, idx) => (
                  <div key={entry.id || entry.message || idx} className="terminal-row">
                    <span className="terminal-time">{entry.time}</span>
                    <span className={`terminal-source ${entry.source === 'front-end' ? 'outbound' : 'inbound'}`}>
                      {entry.source}
                    </span>
                    <span className="terminal-text">{entry.message}</span>
                  </div>
                ))
              ) : (
                <div className="terminal-empty">No conversation recorded yet.</div>
              )}
            </div>
          </div>
          <div className="terminal-view terminal-view-form" aria-hidden={connected}>
            <form className="terminal-settings" onSubmit={handleConnectSubmit}>
              <div className="terminal-settings-grid">
                <label className="field">
                  <span className="field-label">Hostname</span>
                  <input
                    className="field-input"
                    type="text"
                    value={serverHost}
                    onChange={(e) => onServerHostChange && onServerHostChange(e.target.value)}
                    placeholder="e.g. pipelines.internal"
                  />
                </label>
                <label className="field">
                  <span className="field-label">Username</span>
                  <input
                    className="field-input"
                    type="text"
                    value={serverUser}
                    onChange={(e) => onServerUserChange && onServerUserChange(e.target.value)}
                    placeholder="deploy"
                  />
                </label>
                <label className="field">
                  <span className="field-label">Password</span>
                  <input
                    className="field-input"
                    type="password"
                    value={serverPassword}
                    onChange={(e) => onServerPasswordChange && onServerPasswordChange(e.target.value)}
                    placeholder="********"
                  />
                </label>
              </div>
              <div className="terminal-settings-actions">
                <button type="submit" className="btn-primary" disabled={connecting}>
                  {connecting ? (
                    'Connecting...'
                  ) : (
                    <>
                      <GrConnect size={16} />
                      Connect
                    </>
                  )}
                </button>
                <span className="terminal-hint subtle">Connection logic pending integration</span>
              </div>
            </form>
          </div>

          <div className={`terminal-transition-overlay${overlayActive ? ' active' : ''}`}>
            <div className="loading-spinner tiny" />
            <span className="terminal-transition-text">{overlayText}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
function LeftDock({
  active,
  onToggle,
  onAddNode,
  disabled = false,
  preview,
  pipelines = [],
  currentPipelineId,
  currentPipelineName,
  onLoadPipeline,
  onQuickLoad,
  onSavePipeline,
  onSyncPipelines = () => {},
  onDownloadPipeline,
  onUploadPipeline,
  onOpenSettings,
  onClearSavedPipelines,
  onDeletePipeline,
  onRenamePipeline,
  syncingPipelines = false,
  serverConnected = false,
  connectingServer = false,
  serverHost = 'localhost',
  serverUser = '',
  serverPassword = '',
  onServerHostChange = () => {},
  onServerUserChange = () => {},
  onServerPasswordChange = () => {},
  onConnectServer = () => {},
  onDisconnectServer = () => {},
  terminalLogs = [],
  outputs = [],
  lastExecutionAt = null,
  onDownloadOutput = () => {},
  executions = [],
  selectedExecutionId = null,
  onSelectExecution = () => {},
  executionMeta = null,
  executionsLoading = false,
  executionFilesLoading = false,
}) {
  return (
    <>
      <div className="left-nav" onMouseDown={(e) => e.stopPropagation()}>
        <div
          className={`left-nav-btn ${active === 'pipelines' ? 'active' : ''}`}
          role="button"
          tabIndex={0}
          onClick={() => onToggle('pipelines')}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onToggle('pipelines')}
          title="Pipelines"
          aria-label="Pipelines"
        >
          <TbHierarchy2 size={18} />
        </div>
        <div
          className={`left-nav-btn ${active === 'nodes' ? 'active' : ''}`}
          role="button"
          tabIndex={0}
          onClick={() => onToggle('nodes')}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onToggle('nodes')}
          title="Nodes"
          aria-label="Nodes"
        >
          <FiGitBranch size={18} />
        </div>
        <div
          className={`left-nav-btn ${active === 'outputs' ? 'active' : ''}`}
          role="button"
          tabIndex={0}
          onClick={() => onToggle('outputs')}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onToggle('outputs')}
          title="Outputs"
          aria-label="Outputs"
        >
          <TbDownload size={18} />
        </div>
        <div
          className={`left-nav-btn ${active === 'terminal' ? 'active' : ''}`}
          role="button"
          tabIndex={0}
          onClick={() => onToggle('terminal')}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onToggle('terminal')}
          title="Terminal"
          aria-label="Terminal"
        >
          <LuSquareTerminal size={18} />
        </div>
      </div>

      {active ? (
        active === 'nodes' ? (
          <NodesPanel onAdd={onAddNode} disabled={disabled} />
        ) : active === 'pipelines' ? (
          <PipelinesPanel
            onClose={() => onToggle('pipelines')}
            preview={preview}
            pipelines={pipelines}
            currentPipelineId={currentPipelineId}
            currentPipelineName={currentPipelineName}
            onLoadPipeline={onLoadPipeline}
            onQuickLoad={onQuickLoad}
            onSavePipeline={onSavePipeline}
            onSyncPipelines={onSyncPipelines}
            onDownloadPipeline={onDownloadPipeline}
            onUploadPipeline={onUploadPipeline}
            onOpenSettings={onOpenSettings}
            onClearSavedPipelines={onClearSavedPipelines}
            onDeletePipeline={onDeletePipeline}
            onRenamePipeline={onRenamePipeline}
            syncingPipelines={syncingPipelines}
            serverConnected={serverConnected}
          />
        ) : active === 'terminal' ? (
          <TerminalPanel
            connected={serverConnected}
            connecting={connectingServer}
            serverHost={serverHost}
            serverUser={serverUser}
            serverPassword={serverPassword}
            onServerHostChange={onServerHostChange}
            onServerUserChange={onServerUserChange}
            onServerPasswordChange={onServerPasswordChange}
            onConnect={onConnectServer}
            onDisconnect={onDisconnectServer}
            logs={terminalLogs}
          />
        ) : (
          <OutputsPanel
            files={outputs}
            lastExecutionAt={lastExecutionAt}
            onDownload={onDownloadOutput}
            executions={executions}
            selectedExecutionId={selectedExecutionId}
            onSelectExecution={onSelectExecution}
            executionMeta={executionMeta}
            executionsLoading={executionsLoading}
            filesLoading={executionFilesLoading}
          />
        )
      ) : null}
    </>
  )
}

export default LeftDock

function PipelinesPanel({
  onClose,
  preview,
  pipelines = [],
  currentPipelineId,
  currentPipelineName,
  onLoadPipeline,
  onQuickLoad,
  onSavePipeline,
  onSyncPipelines,
  onDownloadPipeline,
  onUploadPipeline,
  onOpenSettings,
  onClearSavedPipelines,
  onDeletePipeline,
  onRenamePipeline,
  syncingPipelines = false,
  serverConnected = false,
}) {
  const [pulse, setPulse] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [draftName, setDraftName] = useState('')
  const editingInputRef = useRef(null)
  const spawnRafRef = useRef(null)
  const [spawnWaveActive, setSpawnWaveActive] = useState(false)

  useEffect(() => {
    if (editingId && editingInputRef.current) {
      editingInputRef.current.focus()
      editingInputRef.current.select()
    }
  }, [editingId])

  const currentPipeline = pipelines.find((p) => p.id === currentPipelineId) || null
  const currentImage = preview || currentPipeline?.preview || reactLogo
  const otherPipelines = pipelines.filter((p) => p.id !== currentPipelineId)
  const hasSaved = pipelines.length > 0
  const disableLoad = pipelines.length === 0
  const canSync = serverConnected && !syncingPipelines
  const gridClassName = `pipelines-grid${spawnWaveActive ? ' spawn-wave' : ''}`

  const handleLoad = (id) => {
    if (!id || id === currentPipelineId) {
      setPulse(id || 'current')
      setTimeout(() => setPulse(null), 320)
      return
    }
    setPulse(id)
    setTimeout(() => {
      setPulse(null)
      onLoadPipeline && onLoadPipeline(id)
      onClose && onClose()
    }, 320)
  }

  const startEditing = (pipeline) => {
    if (!pipeline) return
    setEditingId(pipeline.id)
    setDraftName(pipeline.name || '')
  }

  const cancelEditing = () => {
    setEditingId(null)
    setDraftName('')
  }

  const commitEditing = () => {
    if (!editingId) return
    const original = pipelines.find((pipe) => pipe.id === editingId)
    if (!original) {
      cancelEditing()
      return
    }
    const trimmed = String(draftName ?? '').trim()
    if (trimmed === String(original.name || '').trim()) {
      cancelEditing()
      return
    }
    onRenamePipeline && onRenamePipeline(editingId, draftName)
    cancelEditing()
  }

  const handleEditKey = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      commitEditing()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      cancelEditing()
    }
  }

  useEffect(() => {
    if (editingId && !pipelines.some((p) => p.id === editingId)) {
      setEditingId(null)
      setDraftName('')
    }
  }, [editingId, pipelines])

  useEffect(() => {
    setSpawnWaveActive(false)
    if (spawnRafRef.current) cancelAnimationFrame(spawnRafRef.current)
    spawnRafRef.current = requestAnimationFrame(() => setSpawnWaveActive(true))
    return () => {
      if (spawnRafRef.current) cancelAnimationFrame(spawnRafRef.current)
    }
  }, [pipelines])

  return (
    <div className="left-panel" onMouseDown={(e) => e.stopPropagation()}>
      <div className="panel-header">Pipelines</div>
      <div className="panel-body">
        <div className="pipeline-actions">
          <div
            className="pipeline-action"
            role="button"
            tabIndex={0}
            onClick={() => onSavePipeline && onSavePipeline()}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSavePipeline && onSavePipeline()}
            title="Save current pipeline to your workspace"
            aria-label="Save pipeline"
          >
            <IoSave size={18} />
            <span>Save</span>
          </div>
          <div
            className={`pipeline-action${canSync ? '' : ' disabled'}`}
            role="button"
            tabIndex={canSync ? 0 : -1}
            onClick={() => {
              if (!canSync) return
              onSyncPipelines && onSyncPipelines()
            }}
            onKeyDown={(e) => {
              if (!canSync) return
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onSyncPipelines && onSyncPipelines()
              }
            }}
            title={
              serverConnected
                ? syncingPipelines
                    ? 'Fetching pipelines from server...'
                    : 'Fetch pipelines from the connected server'
                : 'Connect to the server before syncing.'
            }
            aria-label="Sync pipelines"
            aria-disabled={!canSync}
          >
            <MdCloudSync size={18} />
            <span>{syncingPipelines ? 'Syncing...' : 'Sync'}</span>
          </div>
          <div
            className="pipeline-action danger"
            role="button"
            tabIndex={0}
            onClick={() => {
              onClearSavedPipelines && onClearSavedPipelines()
              onClose && onClose()
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                onClearSavedPipelines && onClearSavedPipelines()
                onClose && onClose()
              }
            }}
            title="Remove all saved pipelines from this browser"
            aria-label="Clear saved pipelines"
          >
            <MdDeleteOutline size={18} />
            <span>Clear cache</span>
          </div>
          <div
            className={`pipeline-action${disableLoad ? ' disabled' : ''}`}
            role="button"
            tabIndex={disableLoad ? -1 : 0}
            onClick={() => !disableLoad && onQuickLoad && onQuickLoad()}
            onKeyDown={(e) => {
              if (disableLoad) return
              if (e.key === 'Enter' || e.key === ' ') onQuickLoad && onQuickLoad()
            }}
            title={disableLoad ? 'Save a pipeline before loading.' : 'Load the most recently saved pipeline'}
            aria-label="Load pipeline"
            aria-disabled={disableLoad}
          >
            <IoOpen size={18} />
            <span>Load</span>
          </div>
          <div
            className="pipeline-action"
            role="button"
            tabIndex={0}
            onClick={() => onDownloadPipeline && onDownloadPipeline()}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onDownloadPipeline && onDownloadPipeline()}
            title="Download the current pipeline as a .board file"
            aria-label="Download pipeline"
          >
            <RiDownloadCloud2Fill size={18} />
            <span>Download</span>
          </div>
          <div
            className="pipeline-action"
            role="button"
            tabIndex={0}
            onClick={() => onUploadPipeline && onUploadPipeline()}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onUploadPipeline && onUploadPipeline()}
            title="Upload a .board file and add it to your workspace"
            aria-label="Upload pipeline"
          >
            <RiUploadCloud2Fill size={18} />
            <span>Upload</span>
          </div>
        </div>

        <div
          className={`pipeline-card current${pulse === 'current' ? ' pulse-gold' : ''}${spawnWaveActive ? ' ios-enter' : ''}`}
          style={{
            backgroundImage: `url(${currentImage})`,
            ...(spawnWaveActive ? { '--spawn-delay': '0ms' } : {}),
          }}
          role="button"
          tabIndex={0}
          onClick={() => {
            setPulse('current')
            setTimeout(() => setPulse(null), 320)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              setPulse('current')
              setTimeout(() => setPulse(null), 320)
            }
          }}
        >
          <div className="bottom-blur">
            <div className="caption">
              Current: {currentPipelineName || 'Pipeline'}
            </div>
          </div>
        </div>

        <div className="pipelines-sep">Saved pipelines</div>

        {otherPipelines.length ? (
          <div className={gridClassName}>
            {otherPipelines.map((p, idx) => {
              const displayName = p.name || 'Untitled pipeline'
              const isEditing = editingId === p.id

              return (
                <div
                  key={p.id}
                  className={`pipeline-card${pulse === p.id ? ' pulse-gold' : ''}${isEditing ? ' editing' : ''}${spawnWaveActive ? ' ios-enter' : ''}`}
                  style={{
                    backgroundImage: `url(${p.preview || reactLogo})`,
                    ...(spawnWaveActive ? { '--spawn-delay': `${(idx + 1) * 45}ms` } : {}),
                  }}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    if (isEditing) return
                    handleLoad(p.id)
                  }}
                  onKeyDown={(e) => {
                    if (isEditing) return
                    if (e.key === 'Enter' || e.key === ' ') handleLoad(p.id)
                  }}
                >
                  <div className="bottom-blur">
                    <div className="caption">
                      {isEditing ? (
                        <input
                          ref={isEditing ? editingInputRef : null}
                          className="pipeline-edit-input"
                          value={draftName}
                          onChange={(e) => setDraftName(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={handleEditKey}
                          onBlur={commitEditing}
                          aria-label="Edit pipeline name"
                        />
                      ) : (
                        displayName
                      )}
                    </div>
                  </div>
                  <div className="hover-overlay">
                    <div className="pipeline-hover-actions">
                      <button
                        type="button"
                        className="pipeline-round-btn danger"
                        onClick={(e) => {
                          e.stopPropagation()
                          onDeletePipeline && onDeletePipeline(p.id)
                        }}
                        aria-label={`Delete ${displayName}`}
                      >
                        <MdDeleteOutline size={16} />
                      </button>
                      <button
                        type="button"
                        className="pipeline-round-btn"
                        onClick={(e) => {
                          e.stopPropagation()
                          if (isEditing) {
                            commitEditing()
                          } else {
                            startEditing(p)
                          }
                        }}
                        aria-label={`Edit ${displayName}`}
                      >
                        <FiEdit3 size={16} />
                      </button>
                    </div>
                    {!isEditing ? (
                      <div className="hover-center">
                        <IoOpen size={26} />
                        <div className="hover-text">Load pipeline</div>
                      </div>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="muted-text" style={{ padding: '14px 0 6px' }}>
            {hasSaved
              ? 'All saved pipelines are already loaded.'
              : 'No saved pipelines yet. Save the current pipeline to build your library.'}
          </div>
        )}
      </div>
    </div>
  )
}



