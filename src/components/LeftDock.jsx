import { useEffect, useRef, useState } from 'react'
import { TbHierarchy2, TbDownload, TbPlugConnectedX } from 'react-icons/tb'
import { FiGitBranch, FiEdit3 } from 'react-icons/fi'
import { IoSave, IoOpen } from 'react-icons/io5'
import { RiDownloadCloud2Fill, RiUploadCloud2Fill } from 'react-icons/ri'
import { MdDisplaySettings, MdDeleteOutline, MdCloudSync } from 'react-icons/md'
import { LuSquareTerminal } from 'react-icons/lu'
import { GrConnect } from 'react-icons/gr'
import reactLogo from '../assets/react.svg'
import NodePreview from './NodePreview.jsx'
import { NODE_SECTIONS, NODE_TEMPLATES } from '../nodes/nodeDefinitions.js'

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
          <EmptyPanel title="Outputs" />
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




