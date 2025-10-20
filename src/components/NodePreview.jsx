import '../nodes/nodeStyles.css'

const COLORS = {
  orange: '#f97316',
  green: '#22c55e',
  red: '#ef4444',
  yellow: '#eab308',
  grey: '#9ca3af',
  violet: '#7c3aed',
  azure: '#3b82f6',
}

export default function NodePreview({ title, subtitle, color = 'grey', description, takes, returns, onClick, onDragStart, draggable = true }) {
  const accent = COLORS[color] ?? COLORS.grey
  return (
    <div
      className="node-preview-wrapper"
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onClick?.()}
      draggable={draggable}
      onDragStart={onDragStart}
      aria-label={`Add ${title}${subtitle ? ' ' + subtitle : ''}`}
    >
      <div className="rf-node-card" style={{ pointerEvents: 'none' }}>
        <div
          className="rf-node-header"
          style={{ background: `linear-gradient(to bottom, ${accent} 0%, ${accent}33 45%, var(--panel-bg) 100%)` }}
        >
          <span className="rf-node-title">{title}</span>
          {subtitle ? <span className="rf-node-sub">{subtitle}</span> : null}
        </div>
        <div className="rf-node-body">
          {description ? <div className="rf-node-desc">{description}</div> : null}
          {(takes || returns) ? (
            <div className="rf-node-io">
              {takes ? <div className="rf-io">Takes: {takes}</div> : null}
              {returns ? <div className="rf-io">Returns: {returns}</div> : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
