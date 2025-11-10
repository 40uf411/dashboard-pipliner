import { useEffect, useMemo, useState } from 'react'
import { IoClose } from 'react-icons/io5'
import { GiCancel } from 'react-icons/gi'
import { BiSave } from 'react-icons/bi'
import { getNodeTemplate } from '../nodes/nodeDefinitions.js'
import useModalPresence from '../hooks/useModalPresence.js'

const clone = (value) => JSON.parse(JSON.stringify(value ?? {}))

function toEntries(params) {
  if (!params) return []
  return Object.entries(params).map(([k, v]) => ({ key: k, value: Array.isArray(v) ? v.join(', ') : String(v) }))
}

function fromEntries(entries, originalParams) {
  const out = {}
  entries.forEach(({ key, value }) => {
    const k = String(key || '').trim()
    if (!k) return
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
  const [cachedNode, setCachedNode] = useState(node)
  const [shouldRender, isLeaving] = useModalPresence(Boolean(node), 660)

  useEffect(() => {
    if (node) setCachedNode(node)
  }, [node])

  const targetNode = node || cachedNode

  const templateKey = targetNode?.data?.templateKey
  const template = templateKey ? getNodeTemplate(templateKey) : null
  const structured = Boolean(
    template && template.editable && Array.isArray(template.fields) && template.fields.length
  )

  const initialTitle = targetNode?.data?.title ?? ''
  const isOutputNode = useMemo(() => {
    const category = String(targetNode?.data?.category || '').toLowerCase()
    const kind = String(targetNode?.data?.kind || '').toLowerCase()
    return category === 'output' || kind === 'output'
  }, [targetNode])
  const [title, setTitle] = useState(initialTitle)
  const initialTrackOutput = Boolean(targetNode?.data?.trackOutput)
  const [trackOutput, setTrackOutput] = useState(isOutputNode ? true : initialTrackOutput)

  const initialStructured = useMemo(() => {
    if (!structured) return {}
    const defaults = template?.defaultParams ? clone(template.defaultParams) : {}
    const provided = targetNode?.data?.params ? clone(targetNode.data.params) : {}
    return { ...defaults, ...provided }
  }, [structured, template, targetNode])

  const [formValues, setFormValues] = useState(initialStructured)
  const [entries, setEntries] = useState(() =>
    structured ? [] : toEntries(targetNode?.data?.params)
  )

  useEffect(() => setTitle(initialTitle), [initialTitle])
  useEffect(() => setTrackOutput(isOutputNode ? true : initialTrackOutput), [initialTrackOutput, isOutputNode])

  useEffect(() => {
    if (structured) {
      setFormValues(initialStructured)
    } else {
      setEntries(toEntries(targetNode?.data?.params))
    }
  }, [structured, initialStructured, targetNode])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const updateField = (name, value) => {
    setFormValues((prev) => ({ ...prev, [name]: value }))
  }

  const handleCheckboxToggle = (name, option) => {
    setFormValues((prev) => {
      const current = Array.isArray(prev[name]) ? prev[name] : []
      const exists = current.includes(option)
      const next = exists ? current.filter((val) => val !== option) : [...current, option]
      return { ...prev, [name]: next }
    })
  }

  const handleMultiNumberChange = (name, idx, raw) => {
    setFormValues((prev) => {
      const current = Array.isArray(prev[name]) ? [...prev[name]] : []
      const nextValue = raw === '' ? '' : Number(raw)
      current[idx] = Number.isNaN(nextValue) ? '' : nextValue
      return { ...prev, [name]: current }
    })
  }

  const handleMultiNumberRemove = (name, idx) => {
    setFormValues((prev) => {
      const current = Array.isArray(prev[name]) ? [...prev[name]] : []
      current.splice(idx, 1)
      return { ...prev, [name]: current }
    })
  }

  const handleMultiNumberAdd = (name, fallback) => {
    setFormValues((prev) => {
      const current = Array.isArray(prev[name]) ? [...prev[name]] : []
      current.push(typeof fallback === 'number' ? fallback : 0)
      return { ...prev, [name]: current }
    })
  }

  const renderField = (field) => {
    if (!structured) return null
    const values = formValues
    const shouldShow = typeof field.shouldShow === 'function' ? field.shouldShow(values) : true
    if (!shouldShow) return null
    const disabled = typeof field.isDisabled === 'function' ? field.isDisabled(values) : false
    const value = values[field.name]
    const help = field.help ? <div className="muted-text">{field.help}</div> : null

    if (field.type === 'select') {
      const selected = value ?? field.options?.[0]?.value ?? ''
      return (
        <label key={field.name} className="field">
          <span className="field-label">{field.label}</span>
          <select
            className="field-input"
            value={selected}
            onChange={(e) => updateField(field.name, e.target.value)}
            disabled={disabled}
          >
            {(field.options || []).map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {help}
        </label>
      )
    }

    if (field.type === 'textarea') {
      return (
        <label key={field.name} className="field">
          <span className="field-label">{field.label}</span>
          <textarea
            className="field-input"
            rows={4}
            value={value ?? ''}
            placeholder={field.placeholder || ''}
            onChange={(e) => updateField(field.name, e.target.value)}
            disabled={disabled}
          />
          {help}
        </label>
      )
    }

    if (field.type === 'number') {
      const displayValue = value === '' || value === null || typeof value === 'undefined' ? '' : value
      return (
        <label key={field.name} className="field">
          <span className="field-label">{field.label}</span>
          <input
            className="field-input"
            type="number"
            value={displayValue}
            onChange={(e) => {
              const raw = e.target.value
              if (raw === '') {
                updateField(field.name, '')
              } else {
                const num = Number(raw)
                updateField(field.name, Number.isNaN(num) ? '' : num)
              }
            }}
            min={field.min}
            max={field.max}
            step={field.step}
            disabled={disabled}
          />
          {help}
        </label>
      )
    }

    if (field.type === 'checkbox-group') {
      const selected = Array.isArray(value) ? value : []
      return (
        <div key={field.name} className="field">
          <span className="field-label">{field.label}</span>
          <div className="checkbox-group">
            {(field.options || []).map((opt) => {
              const checked = selected.includes(opt.value)
              return (
                <label key={opt.value} className="checkbox-option">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => handleCheckboxToggle(field.name, opt.value)}
                    disabled={disabled}
                  />
                  <span>{opt.label}</span>
                </label>
              )
            })}
          </div>
          {help}
        </div>
      )
    }

    if (field.type === 'multi-number') {
      const numbers = Array.isArray(value) ? value : []
      return (
        <div key={field.name} className="field">
          <span className="field-label">{field.label}</span>
          <div className="params-grid">
            {numbers.map((num, idx) => (
              <div key={idx} className="param-row">
                <input
                  className="field-input"
                  type="number"
                  value={num === '' || num === null || typeof num === 'undefined' ? '' : num}
                  onChange={(e) => handleMultiNumberChange(field.name, idx, e.target.value)}
                  min={field.min}
                  step={field.step}
                  disabled={disabled}
                />
                <div
                  className="btn-icon"
                  role="button"
                  tabIndex={0}
                  onClick={() => handleMultiNumberRemove(field.name, idx)}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleMultiNumberRemove(field.name, idx)}
                  aria-label="Remove value"
                >
                  <IoClose size={16} />
                </div>
              </div>
            ))}
          </div>
          <div
            className="btn-ghost"
            role="button"
            tabIndex={0}
            onClick={() => handleMultiNumberAdd(field.name, field.min)}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleMultiNumberAdd(field.name, field.min)}
          >
            Add value
          </div>
          {help}
        </div>
      )
    }

    if (field.type === 'range') {
      const fallback = typeof value === 'number' ? value : template?.defaultParams?.[field.name]
      const numericValue =
        typeof value === 'number'
          ? value
          : typeof fallback === 'number'
          ? fallback
          : typeof field.min === 'number'
          ? field.min
          : 0
      return (
        <div key={field.name} className="field">
          <span className="field-label">{field.label}</span>
          <input
            type="range"
            min={field.min ?? 0}
            max={field.max ?? 100}
            step={field.step ?? 1}
            value={numericValue}
            onChange={(e) => updateField(field.name, Number(e.target.value))}
            disabled={disabled}
          />
          <div className="muted-text">Current: {numericValue}</div>
          {help}
        </div>
      )
    }

    return null
  }

  const buildParams = () => {
    if (!structured || !template) {
      return fromEntries(entries, targetNode?.data?.params)
    }
    const values = formValues
    const result = {}
    template.fields.forEach((field) => {
      const shouldShow = typeof field.shouldShow === 'function' ? field.shouldShow(values) : true
      let val = values[field.name]

      if (!shouldShow) {
        if (typeof val !== 'undefined') result[field.name] = val
        return
      }

      if (field.type === 'number' || field.type === 'range') {
        if (val === '' || val === null || typeof val === 'undefined' || Number.isNaN(val)) {
          const fallback = template.defaultParams?.[field.name]
          if (typeof fallback !== 'undefined') {
            val = clone(fallback)
          } else {
            return
          }
        } else {
          val = Number(val)
        }
      } else if (field.type === 'checkbox-group') {
        val = Array.isArray(val) ? val : []
      } else if (field.type === 'multi-number') {
        const arr = Array.isArray(val) ? val : []
        const numbers = arr
          .map((num) => Number(num))
          .filter((num) => !Number.isNaN(num))
        if (!numbers.length && template.defaultParams?.[field.name]) {
          val = clone(template.defaultParams[field.name])
        } else {
          val = numbers
        }
      } else if (field.type === 'textarea') {
        val = String(val ?? '')
      } else if (typeof val === 'undefined') {
        if (template.defaultParams && Object.prototype.hasOwnProperty.call(template.defaultParams, field.name)) {
          val = clone(template.defaultParams[field.name])
        }
      }

      result[field.name] = val
    })
    return result
  }

  const handleSave = () => {
    const next = {
      title,
      params: buildParams(),
      trackOutput: isOutputNode ? true : Boolean(trackOutput),
    }
    onSave(next)
  }

  const structuredNote = structured && template ? (
    <div className="muted-text">
      Configure attributes for the {template.subtitle || template.title || 'node'} type.
    </div>
  ) : null

  if (!shouldRender || !targetNode) return null

  const fallbackHasParams = entries.length > 0
  const transitionState = isLeaving ? 'modal-leaving' : 'modal-entering'

  return (
    <div className={`modal-overlay ${transitionState}`} onClick={onClose}>
      <div className={`modal-shell ${transitionState}`} onClick={(e) => e.stopPropagation()}>
        <div className={`glass-card modal-card ${transitionState}`}>
          <div className="glass-header">
            <div>
              <p className="glass-eyebrow">{template?.subtitle || 'Node'}</p>
              <h3 className="glass-title">Edit Node</h3>
            </div>
            <button
              className="icon-button"
              type="button"
              onClick={onClose}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onClose()}
              aria-label="Close editor"
            >
              <IoClose size={18} />
            </button>
          </div>

          <div className="glass-body modal-scroll">
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
            <span className="field-label">Track output</span>
            <label className="checkbox-option">
              <input
                type="checkbox"
                checked={trackOutput}
                onChange={(e) => setTrackOutput(e.target.checked)}
                disabled={isOutputNode}
                aria-label="Toggle track output"
              />
              <span>{trackOutput ? 'Enabled' : 'Disabled'}</span>
            </label>
            <div className="muted-text">
              {isOutputNode
                ? 'Always on for output nodes.'
                : 'Enable this to capture the node output during execution.'}
            </div>
          </div>

          {structured ? (
            <>
              {structuredNote}
              {template.fields.map((field) => renderField(field))}
            </>
          ) : (
            <div className="field">
              <span className="field-label">Parameters</span>
              {fallbackHasParams ? (
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
          )}
          </div>

          <div className="glass-footer">
            <button
              className="btn-secondary"
              type="button"
              onClick={onClose}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onClose()}
            >
              <GiCancel size={16} />
              Cancel
            </button>
            <button
              className="btn-primary"
              type="button"
              onClick={handleSave}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') handleSave()
              }}
            >
              <BiSave size={16} />
              Save changes
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
