export default function DashboardMenu({ x, y, onAddNode, onResetNodes, onClear, onToggleCompact, onClose }) {
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
        onClick={() => { onAddNode(); onClose(); }}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (onAddNode(), onClose())}
      >
        Add node
      </div>
      <div
        className="context-item"
        role="button"
        tabIndex={0}
        onClick={() => { onResetNodes(); onClose(); }}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (onResetNodes(), onClose())}
      >
        Reset nodes
      </div>
      <div
        className="context-item danger"
        role="button"
        tabIndex={0}
        onClick={() => { onClear(); onClose(); }}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (onClear(), onClose())}
      >
        Clear dashboard
      </div>
      <div
        className="context-item"
        role="button"
        tabIndex={0}
        onClick={() => { onToggleCompact(); onClose(); }}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (onToggleCompact(), onClose())}
      >
        Toggle compact mode
      </div>
    </div>
  )
}

