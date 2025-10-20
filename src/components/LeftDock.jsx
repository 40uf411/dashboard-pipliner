import { useState, memo } from 'react'
import { TbGitBranch, TbHierarchy2, TbDownload } from 'react-icons/tb'
import { IoAddOutline, IoCodeDownload } from 'react-icons/io5'
import reactLogo from '../assets/react.svg'
import NodePreview from './NodePreview.jsx'

const sections = [
  {
    key: 'input',
    title: 'Input',
    items: [
      { key: 'input-dataset', label: 'Dataset' },
    ],
  },
  {
    key: 'processing',
    title: 'Processing',
    items: [
      { key: 'processing-concat', label: 'Concat' },
      { key: 'processing-segmentation', label: 'Segmentation' },
      { key: 'processing-filter', label: 'Filter' },
    ],
  },
  {
    key: 'analytics',
    title: 'Analytics',
    items: [
      { key: 'analytics-structural', label: 'Structural Descriptor' },
      { key: 'analytics-simulation', label: 'Simulation' },
    ],
  },
  {
    key: 'output',
    title: 'Output',
    items: [
      { key: 'output-figure', label: 'Figure Vis' },
      { key: 'output-log', label: 'Text Log' },
      { key: 'output-save', label: 'File Save' },
    ],
  },
]

function NodesPanel({ onAdd, disabled }) {
  const [open, setOpen] = useState(['input', 'processing', 'analytics', 'output'])
  const toggle = (key) =>
    setOpen((arr) => (arr.includes(key) ? arr.filter((k) => k !== key) : [...arr, key]))

  return (
    <div className="left-panel" onMouseDown={(e) => e.stopPropagation()}>
      <div className="panel-header">Nodes</div>
      <div className="panel-body">
        {sections.map((sec) => (
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
                {sec.items.map((it) => {
                  // map item key to preview data
                  let color = 'grey', title = 'Node', subtitle = it.label, description = '', takes = '', returns = ''
                  switch (it.key) {
                    case 'input-dataset':
                      title = 'Input'; subtitle = 'Dataset'; color = 'green';
                      description = 'Provides a dataset from a file path.'; returns = 'dataset'; break
                    case 'processing-concat':
                      title = 'Processing'; subtitle = 'Concat'; color = 'violet';
                      description = 'Concatenate two datasets into one.'; takes = 'dataset A, dataset B'; returns = 'dataset'; break
                    case 'processing-segmentation':
                      title = 'Processing'; subtitle = 'Segmentation'; color = 'violet';
                      description = 'Segments an image/volume using a selected algorithm.'; takes = 'dataset'; returns = 'segmented dataset'; break
                    case 'processing-filter':
                      title = 'Processing'; subtitle = 'Filter'; color = 'violet';
                      description = 'Applies a configurable filter with kernel size.'; takes = 'dataset'; returns = 'filtered dataset'; break
                    case 'analytics-structural':
                      title = 'Analytics'; subtitle = 'Structural Descriptor'; color = 'red';
                      description = 'Computes structural descriptors for selected phases/directions.'; takes = 'dataset'; returns = 'descriptors'; break
                    case 'analytics-simulation':
                      title = 'Analytics'; subtitle = 'Simulation'; color = 'red';
                      description = 'Runs a simulation over the input data.'; takes = 'dataset'; returns = 'results'; break
                    case 'output-figure':
                      title = 'Output'; subtitle = 'Figure Vis'; color = 'azure';
                      description = 'Visualizes results as plots/figures.'; takes = 'dataset'; break
                    case 'output-log':
                      title = 'Output'; subtitle = 'Text Log'; color = 'azure';
                      description = 'Logs textual output for inspection.'; takes = 'dataset'; break
                    case 'output-save':
                      title = 'Output'; subtitle = 'File Save'; color = 'azure';
                      description = 'Saves results to a file path.'; takes = 'dataset'; break
                  }
                  return (
                    <NodePreview
                      key={it.key}
                      title={title}
                      subtitle={subtitle}
                      color={color}
                      draggable={!disabled}
                      description={description}
                      takes={takes}
                      returns={returns}
                      onClick={() => onAdd(it.key)}
                      onDragStart={(e) => {
                        if (disabled) return
                        e.dataTransfer.setData('application/reactflow', it.key)
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
