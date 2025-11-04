import { useState, memo } from 'react'
import { TbGitBranch, TbHierarchy2, TbDownload } from 'react-icons/tb'
import { IoCodeDownload } from 'react-icons/io5'
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

function LeftDock({ active, onToggle, onAddNode, disabled = false, preview }) {
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
          <TbGitBranch size={18} />
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
          <TbHierarchy2 size={18} />
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
          <PipelinesPanel onClose={() => onToggle('pipelines')} preview={preview} />
        ) : (
          <EmptyPanel title="Outputs" />
        )
      ) : null}
    </>
  )
}

export default memo(LeftDock)

function PipelinesPanel({ onClose, preview }) {
  const cards = [
    { id: 'cur', title: 'Current: Clay data analysis', current: true, img: preview || reactLogo },
    { id: 'p1', title: 'Microstructure QA', img: reactLogo },
    { id: 'p2', title: 'Crack Detection', img: reactLogo },
    { id: 'p3', title: 'Porosity Estimation', img: reactLogo },
  ]

  const [pulse, setPulse] = useState(null)

  const loadPipeline = (id) => {
    // Always pulse; only close for non-current pipelines
    setPulse(id)
    setTimeout(() => {
      setPulse(null)
      if (id !== 'cur') onClose && onClose()
    }, 450)
  }

  return (
    <div className="left-panel" onMouseDown={(e) => e.stopPropagation()}>
      <div className="panel-header">Pipelines</div>
      <div className="panel-body">
        {/* Current pipeline card */}
        <div
          className={`pipeline-card current${pulse === 'cur' ? ' pulse-gold' : ''}`}
          style={{ backgroundImage: `url(${cards[0].img})` }}
          role="button"
          tabIndex={0}
          onClick={() => loadPipeline('cur')}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && loadPipeline('cur')}
        >
          <div className="bottom-blur">
            <div className="caption">{cards[0].title}</div>
          </div>
        </div>

        <div className="pipelines-sep">Other pipelines</div>

        <div className="pipelines-grid">
          {cards.slice(1).map((c) => (
            <div
              key={c.id}
              className={`pipeline-card${pulse === c.id ? ' pulse-gold' : ''}`}
              style={{ backgroundImage: `url(${c.img})` }}
              role="button"
              tabIndex={0}
              onClick={() => loadPipeline(c.id)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && loadPipeline(c.id)}
            >
              <div className="bottom-blur">
                <div className="caption">{c.title}</div>
              </div>
              <div className="hover-overlay">
                <IoCodeDownload size={26} />
                <div className="hover-text">Load pipeline</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
