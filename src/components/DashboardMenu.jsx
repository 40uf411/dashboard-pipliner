export default function DashboardMenu({
  x,
  y,
  onAddNode,
  onResetNodes,
  onClear,
  onToggleCompact,
  onClose,
  onSavePipeline,
  onLoadPipeline,
  onDownloadPipeline,
  onUploadPipeline,
}) {
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
        onClick={() => { onSavePipeline && onSavePipeline(); onClose(); }}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (onSavePipeline && onSavePipeline(), onClose())}
      >
        Save pipeline
      </div>
      <div
        className="context-item"
        role="button"
        tabIndex={0}
        onClick={() => { onLoadPipeline && onLoadPipeline(); onClose(); }}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (onLoadPipeline && onLoadPipeline(), onClose())}
      >
        Load pipeline
      </div>
      <div
        className="context-item"
        role="button"
        tabIndex={0}
        onClick={() => { onDownloadPipeline && onDownloadPipeline(); onClose(); }}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (onDownloadPipeline && onDownloadPipeline(), onClose())}
      >
        Download pipeline
      </div>
      <div
        className="context-item"
        role="button"
        tabIndex={0}
        onClick={() => { onUploadPipeline && onUploadPipeline(); onClose(); }}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (onUploadPipeline && onUploadPipeline(), onClose())}
      >
        Upload pipeline
      </div>
      <div className="context-sep" />
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
