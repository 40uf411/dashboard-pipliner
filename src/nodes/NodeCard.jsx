import { memo } from 'react'
import { Handle, Position } from 'reactflow'
import './nodeStyles.css'

const COLORS = {
  orange: '#f97316',
  green: '#22c55e',
  red: '#ef4444',
  yellow: '#eab308',
  grey: '#9ca3af',
  violet: '#7c3aed',
  azure: '#3b82f6',
}

function ParamList({ params }) {
  if (!params) return null
  const entries = Object.entries(params)
  if (!entries.length) return null
  return (
    <div className="rf-node-params">
      {entries.map(([k, v]) => (
        <div key={k} className="rf-param-row">
          <span className="rf-param-key">{k}</span>
          <span className="rf-param-value">{Array.isArray(v) ? v.join(', ') : String(v)}</span>
        </div>
      ))}
    </div>
  )
}

function NodeCard({ data, selected }) {
  const {
    title = 'Node',
    body = '',
    color = 'grey',
    params,
    targets = 1,
    sources = 1,
    subtitle,
    alert,
  } = data || {}
  const accent = COLORS[color] ?? COLORS.grey

  // compute even spacing for multiple handles
  const targetPositions = Array.from({ length: targets }, (_, i) => `${((i + 1) / (targets + 1)) * 100}%`)
  const sourcePositions = Array.from({ length: sources }, (_, i) => `${((i + 1) / (sources + 1)) * 100}%`)

  return (
    <div className={`rf-node-card${selected ? ' selected' : ''}`}>
      <div
        className="rf-node-header"
        style={{
          background: `linear-gradient(to bottom, ${accent} 0%, ${accent}33 45%, var(--panel-bg) 100%)`,
        }}
      >
        <span className="rf-node-title">{title}</span>
        {subtitle ? <span className="rf-node-sub">{subtitle}</span> : null}
      </div>
      <div className="rf-node-body">
        {body}
        <ParamList params={params} />
        {alert ? (
          <div className={`rf-alert rf-alert-${alert.color || 'green'}`}>{alert.message || ''}</div>
        ) : null}
      </div>

      {targetPositions.map((top, idx) => (
        <Handle key={`t-${idx}`} id={`t-${idx}`} type="target" position={Position.Left} style={{ top }} />
      ))}
      {sourcePositions.map((top, idx) => (
        <Handle key={`s-${idx}`} id={`s-${idx}`} type="source" position={Position.Right} style={{ top }} />
      ))}
    </div>
  )
}

export default memo(NodeCard)
