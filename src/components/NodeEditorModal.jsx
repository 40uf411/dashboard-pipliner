import { useEffect, useMemo, useState } from 'react'
import { IoClose } from 'react-icons/io5'

function toEntries(params) {
  if (!params) return []
  return Object.entries(params).map(([k, v]) => ({ key: k, value: Array.isArray(v) ? v.join(', ') : String(v) }))
}

function fromEntries(entries, originalParams) {
  const out = {}
  entries.forEach(({ key, value }) => {
    const k = String(key || '').trim()
    if (!k) return
    // If original was array, keep array semantics by splitting commas
    const wasArray = Array.isArray(originalParams?.[k])
    if (wasArray) {
      out[k] = String(value || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    } else {
      out[k] = String(value ?? '')
    }
  })
  return out
}

export default function NodeEditorModal({ node, onSave, onClose }) {
  const initialTitle = node?.data?.title ?? ''
  const [title, setTitle] = useState(initialTitle)
  const [entries, setEntries] = useState(() => toEntries(node?.data?.params))

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const hasParams = entries.length > 0

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Edit Node</h3>
          <div
            className="btn-icon"
            role="button"
            tabIndex={0}
            onClick={onClose}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onClose()}
            aria-label="Close"
          >
            <IoClose size={18} />
          </div>
        </div>

        <div className="modal-body">
          <label className="field">
            <span className="field-label">Title</span>
            <input
              className="field-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Node title"
            />
          </label>

          <div className="field">
            <span className="field-label">Parameters</span>
            {hasParams ? (
              <div className="params-grid">
                {entries.map((row, idx) => (
                  <div key={idx} className="param-row">
                    <input
                      className="field-input"
                      placeholder="key"
                      value={row.key}
                      onChange={(e) => {
                        const next = [...entries]
                        next[idx] = { ...next[idx], key: e.target.value }
                        setEntries(next)
                      }}
                    />
                    <input
                      className="field-input"
                      placeholder="value (comma separated for lists)"
                      value={row.value}
                      onChange={(e) => {
                        const next = [...entries]
                        next[idx] = { ...next[idx], value: e.target.value }
                        setEntries(next)
                      }}
                    />
                    <div
                      className="btn-icon"
                      role="button"
                      tabIndex={0}
                      onClick={() => setEntries(entries.filter((_, i) => i !== idx))}
                      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setEntries(entries.filter((_, i) => i !== idx))}
                      title="Remove"
                      aria-label="Remove"
                    >
                      <IoClose size={16} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="muted-text">No parameters. Add one below.</div>
            )}
            <div>
              <div
                className="btn-ghost"
                role="button"
                tabIndex={0}
                onClick={() => setEntries([...entries, { key: '', value: '' }])}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setEntries([...entries, { key: '', value: '' }])}
              >
                Add param
              </div>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <div
            className="btn-ghost"
            role="button"
            tabIndex={0}
            onClick={onClose}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onClose()}
          >
            Cancel
          </div>
          <div
            className="btn-primary"
            role="button"
            tabIndex={0}
            onClick={() => {
              const next = {
                title,
                params: fromEntries(entries, node?.data?.params),
              }
              onSave(next)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                const next = {
                  title,
                  params: fromEntries(entries, node?.data?.params),
                }
                onSave(next)
              }
            }}
          >
            Save
          </div>
        </div>
      </div>
    </div>
  )
}
