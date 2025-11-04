export default function ContextMenu({ x, y, onEdit, onDelete, onClose, canEdit = true }) {
  return (
    <div
      className="context-menu"
      style={{ left: x, top: y, position: 'fixed' }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div
        className={`context-item${canEdit ? '' : ' disabled'}`}
        role="button"
        tabIndex={0}
        onClick={onEdit}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onEdit()}
        aria-label="Edit node"
        aria-disabled={!canEdit}
      >
        Edit
      </div>
      <div
        className="context-item danger"
        role="button"
        tabIndex={0}
        onClick={onDelete}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onDelete()}
        aria-label="Delete node"
      >
        Delete
      </div>
    </div>
  )
}
