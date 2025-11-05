import { IoClose } from 'react-icons/io5'
import { GiCancel } from 'react-icons/gi'
import { BiSave } from 'react-icons/bi'

export default function ConfirmDialog({
  open,
  title = 'Are you sure?',
  message = 'This action cannot be undone.',
  onCancel,
  onConfirm,
}) {
  if (!open) return null
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-shell" onClick={(e) => e.stopPropagation()}>
        <div className="glass-card modal-card confirm-card">
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
