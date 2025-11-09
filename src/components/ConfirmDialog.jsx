import { IoClose } from 'react-icons/io5'
import { GiCancel } from 'react-icons/gi'
import { BiSave } from 'react-icons/bi'
import useModalPresence from '../hooks/useModalPresence.js'

export default function ConfirmDialog({
  open,
  title = 'Are you sure?',
  message = 'This action cannot be undone.',
  onCancel,
  onConfirm,
}) {
  const [shouldRender, isLeaving] = useModalPresence(open, 640)
  const transitionState = isLeaving ? 'modal-leaving' : 'modal-entering'
  if (!shouldRender) return null
  return (
    <div className={`modal-overlay ${transitionState}`} onClick={onCancel}>
      <div className={`modal-shell ${transitionState}`} onClick={(e) => e.stopPropagation()}>
        <div className={`glass-card modal-card confirm-card ${transitionState}`}>
          <div className="glass-header">
            <div>
              <p className="glass-eyebrow">Confirmation</p>
              <h3 className="glass-title">{title}</h3>
            </div>
            <button
              className="icon-button"
              type="button"
              onClick={onCancel}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onCancel()}
              aria-label="Close dialog"
            >
              <IoClose size={18} />
            </button>
          </div>
          <div className="glass-body modal-scroll">
            <p className="muted-text">{message}</p>
          </div>
          <div className="glass-footer">
            <button
              className="btn-secondary"
              type="button"
              onClick={onCancel}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onCancel()}
            >
              <GiCancel size={16} />
              Cancel
            </button>
            <button
              className="btn-danger"
              type="button"
              onClick={onConfirm}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onConfirm()}
            >
              <BiSave size={16} />
              Confirm
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
