export default function ConfirmDialog({ open, title = 'Are you sure?', message = 'This action cannot be undone.', onCancel, onConfirm }) {
  if (!open) return null
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-panel danger" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{title}</h3>
        </div>
        <div className="modal-body">
          <div className="muted-text">{message}</div>
        </div>
        <div className="modal-footer">
          <div className="btn-ghost" role="button" tabIndex={0} onClick={onCancel} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onCancel()}>Cancel</div>
          <div className="btn-danger" role="button" tabIndex={0} onClick={onConfirm} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onConfirm()}>OK</div>
        </div>
      </div>
    </div>
  )
}
