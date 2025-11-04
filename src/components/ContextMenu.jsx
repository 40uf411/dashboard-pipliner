import { FaRegEdit } from 'react-icons/fa'
import { MdDeleteOutline } from 'react-icons/md'

export default function ContextMenu({ x, y, onEdit, onDelete, onClose, canEdit = true }) {
  const handleEdit = () => {
    if (!canEdit) return
    onEdit && onEdit()
    onClose && onClose()
  }

  const handleDelete = () => {
    onDelete && onDelete()
    onClose && onClose()
  }

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
        tabIndex={canEdit ? 0 : -1}
        onClick={handleEdit}
        onKeyDown={(e) => {
          if (!canEdit) return
          if (e.key === 'Enter' || e.key === ' ') handleEdit()
        }}
        aria-label="Edit node"
        aria-disabled={!canEdit}
      >
        <span className="context-icon">
          <FaRegEdit size={16} />
        </span>
        <span>Edit</span>
      </div>
      <div
        className="context-item danger"
        role="button"
        tabIndex={0}
        onClick={handleDelete}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') handleDelete()
        }}
        aria-label="Delete node"
      >
        <span className="context-icon">
          <MdDeleteOutline size={17} />
        </span>
        <span>Delete</span>
      </div>
    </div>
  )
}
