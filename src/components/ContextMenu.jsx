export default function ContextMenu({ x, y, onEdit, onDelete, onClose }) {
  return (
    <div
      className="context-menu"
      style={{ left: x, top: y, position: 'fixed' }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div
        className="context-item"
        role="button"
        tabIndex={0}
        onClick={onEdit}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onEdit()}
        aria-label="Edit node"
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
