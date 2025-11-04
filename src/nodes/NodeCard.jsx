import { memo } from 'react'
import { Handle, Position } from 'reactflow'
import './nodeStyles.css'
import { getParamEntries } from './nodeDefinitions.js'

const COLORS = {
  orange: '#f97316',
  green: '#22c55e',
  red: '#ef4444',
  yellow: '#eab308',
  grey: '#9ca3af',
  violet: '#7c3aed',
  azure: '#3b82f6',
}

function ParamList({ templateKey, params }) {
  if (!params) return null
  let entries = []
  if (templateKey) {
    entries = getParamEntries(templateKey, params)
  }
  if (!entries.length) {
    entries = Object.entries(params || {}).map(([k, v]) => ({
      key: k,
      value: Array.isArray(v) ? v.join(', ') : String(v),
    }))
  }
  if (!entries.length) return null
  return (
    <div className="rf-node-params">
      {entries.map(({ key, value }) => (
        <div key={key} className="rf-param-row">
          <span className="rf-param-key">{key}</span>
          <span className="rf-param-value">{Array.isArray(value) ? value.join(', ') : String(value)}</span>
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
    templateKey,
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
        <ParamList templateKey={templateKey} params={params} />
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
