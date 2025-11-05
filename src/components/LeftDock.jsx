import { useEffect, useRef, useState, memo } from 'react'
import { TbGitBranch, TbHierarchy2, TbDownload } from 'react-icons/tb'
import { FiGitBranch, FiEdit3 } from 'react-icons/fi'
import { IoSave, IoOpen } from 'react-icons/io5'
import { RiDownloadCloud2Fill, RiUploadCloud2Fill } from 'react-icons/ri'
import { MdDisplaySettings, MdDeleteOutline } from 'react-icons/md'
import { LuLayoutDashboard } from 'react-icons/lu'
import reactLogo from '../assets/react.svg'
import NodePreview from './NodePreview.jsx'
import { NODE_SECTIONS, NODE_TEMPLATES } from '../nodes/nodeDefinitions.js'

function NodesPanel({ onAdd, disabled }) {
  const [open, setOpen] = useState(() => NODE_SECTIONS.map((sec) => sec.key))
  const toggle = (key) =>
    setOpen((arr) => (arr.includes(key) ? arr.filter((k) => k !== key) : [...arr, key]))

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
              <span className={`chev ${open.includes(sec.key) ? 'open' : ''}`}>▸</span>
              {sec.title}
            </div>
            {open.includes(sec.key) ? (
              <div className="preview-grid">
                {sec.items.map((key) => {
                  const template = NODE_TEMPLATES[key]
                  if (!template) return null
                  const preview = template.preview || {}
                  const description = preview.description || ''
                  const takes = preview.takes || ''
                  const returns = preview.returns || ''
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
  onDownloadPipeline,
  onUploadPipeline,
  onOpenSettings,
  onClearDashboard,
  onDeletePipeline,
  onRenamePipeline,
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
          onDownloadPipeline={onDownloadPipeline}
          onUploadPipeline={onUploadPipeline}
          onOpenSettings={onOpenSettings}
          onClearDashboard={onClearDashboard}
          onDeletePipeline={onDeletePipeline}
          onRenamePipeline={onRenamePipeline}
        />
        ) : (
          <EmptyPanel title="Outputs" />
        )
      ) : null}
    </>
  )
}

export default memo(LeftDock)

function PipelinesPanel({
  onClose,
  preview,
  pipelines = [],
  currentPipelineId,
  currentPipelineName,
  onLoadPipeline,
  onQuickLoad,
  onSavePipeline,
  onDownloadPipeline,
  onUploadPipeline,
  onOpenSettings,
  onClearDashboard,
  onDeletePipeline,
  onRenamePipeline,
}) {
  const [pulse, setPulse] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [draftName, setDraftName] = useState('')
  const editingInputRef = useRef(null)

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

  return (
    <div className="left-panel" onMouseDown={(e) => e.stopPropagation()}>
      <div className="panel-header">Pipelines</div>
      <div className="panel-body">
        <div className="pipeline-actions">
          <div
            className="pipeline-action danger"
            role="button"
            tabIndex={0}
            onClick={() => {
              onClearDashboard && onClearDashboard()
              onClose && onClose()
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                onClearDashboard && onClearDashboard()
                onClose && onClose()
              }
            }}
            title="Clear all nodes and edges from the dashboard"
            aria-label="Clear dashboard"
          >
            <LuLayoutDashboard size={18} />
            <span>Clear</span>
          </div>
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
          <div
            className="pipeline-action"
            role="button"
            tabIndex={0}
            onClick={() => onOpenSettings && onOpenSettings()}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onOpenSettings && onOpenSettings()}
            title="Open workspace settings"
            aria-label="Open settings"
          >
            <MdDisplaySettings size={18} />
            <span>Settings</span>
          </div>
        </div>

        <div
          className={`pipeline-card current${pulse === 'current' ? ' pulse-gold' : ''}`}
          style={{ backgroundImage: `url(${currentImage})` }}
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
          <div className="pipelines-grid">
            {otherPipelines.map((p) => {
              const displayName = p.name || 'Untitled pipeline'
              const isEditing = editingId === p.id

              return (
                <div
                  key={p.id}
                  className={`pipeline-card${pulse === p.id ? ' pulse-gold' : ''}${isEditing ? ' editing' : ''}`}
                  style={{ backgroundImage: `url(${p.preview || reactLogo})` }}
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
