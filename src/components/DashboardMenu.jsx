import { IoSave, IoOpen } from 'react-icons/io5'
import { RiDownloadCloud2Fill, RiUploadCloud2Fill, RiResetLeftLine } from 'react-icons/ri'
import { IoMdAddCircleOutline } from 'react-icons/io'
import { LuLayoutDashboard } from 'react-icons/lu'
import { MdOutlineViewTimeline, MdDisplaySettings } from 'react-icons/md'

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
  onOpenSettings,
}) {
  const entries = [
    {
      key: 'save',
      label: 'Save pipeline',
      icon: <IoSave size={16} />,
      action: onSavePipeline,
    },
    {
      key: 'load',
      label: 'Load pipeline',
      icon: <IoOpen size={16} />,
      action: onLoadPipeline,
    },
    {
      key: 'download',
      label: 'Download pipeline',
      icon: <RiDownloadCloud2Fill size={16} />,
      action: onDownloadPipeline,
    },
    {
      key: 'upload',
      label: 'Upload pipeline',
      icon: <RiUploadCloud2Fill size={16} />,
      action: onUploadPipeline,
    },
    { key: 'sep-1', separator: true },
    {
      key: 'add',
      label: 'Add node',
      icon: <IoMdAddCircleOutline size={17} />,
      action: onAddNode,
    },
    {
      key: 'reset',
      label: 'Reset nodes',
      icon: <RiResetLeftLine size={16} />,
      action: onResetNodes,
    },
    {
      key: 'clear',
      label: 'Empty dashboard',
      icon: <LuLayoutDashboard size={16} />,
      action: onClear,
      danger: true,
    },
    {
      key: 'zen',
      label: 'Toggle zen mode',
      icon: <MdOutlineViewTimeline size={16} />,
      action: onToggleCompact,
    },
    { key: 'sep-2', separator: true },
    {
      key: 'settings',
      label: 'Settings',
      icon: <MdDisplaySettings size={17} />,
      action: onOpenSettings,
    },
  ]

  return (
    <div
      className="context-menu"
      style={{ left: x, top: y, position: 'fixed' }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {entries.map((entry) =>
        entry.separator ? (
          <div key={entry.key} className="context-sep" />
        ) : (
          <div
            key={entry.key}
            className={`context-item${entry.danger ? ' danger' : ''}`}
            role="button"
            tabIndex={0}
            onClick={() => {
              if (entry.action) entry.action()
              onClose()
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                if (entry.action) entry.action()
                onClose()
              }
            }}
          >
            <span className="context-icon">{entry.icon}</span>
            <span>{entry.label}</span>
          </div>
        )
      )}
    </div>
  )
}
