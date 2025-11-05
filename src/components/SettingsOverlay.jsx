import { IoClose, IoSave } from 'react-icons/io5'
import { RiDownloadCloud2Fill, RiUploadCloud2Fill } from 'react-icons/ri'
import { MdDeleteOutline, MdDisplaySettings } from 'react-icons/md'
import { LuLayoutDashboard } from 'react-icons/lu'
import { CgDebug } from 'react-icons/cg'
import { GrConnect } from 'react-icons/gr'
import { TbPlugConnectedX } from 'react-icons/tb'

const HOTKEYS = [
  { combo: 'Ctrl / Cmd + S', description: 'Save the current pipeline' },
  { combo: 'Ctrl / Cmd + L', description: 'Open the pipelines panel' },
  { combo: 'Ctrl / Cmd + D', description: 'Download pipeline as .board' },
  { combo: 'Shift + Drag', description: 'Pan the canvas while locked' },
  { combo: 'Space', description: 'Toggle interaction mode' },
]

export default function SettingsOverlay({
  open,
  onClose,
  pipelineName,
  onPipelineNameChange,
  onSavePipeline,
  onDownloadPipeline,
  onUploadPipeline,
  onClearDashboard,
  serverHost,
  onServerHostChange,
  serverUser,
  onServerUserChange,
  serverPassword,
  onServerPasswordChange,
  onTestConnection,
  testingConnection = false,
  onConnectToggle,
  connecting = false,
  connected = false,
}) {
  if (!open) return null

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <button
          className="icon-button settings-close"
          type="button"
          onClick={onClose}
          aria-label="Close settings"
        >
          <IoClose size={19} />
        </button>

        <div className="settings-content">
          <section className="settings-pane welcome-pane">
            <div className="welcome-header">
              <span className="glass-eyebrow">Visual Pipeline Dashboard</span>
              <h2>Welcome back</h2>
              <p className="muted-text">
                Tune your workspace, master the shortcuts, and keep your pipelines ready for the next
                run. Your changes are stored locally and travel with every export.
              </p>
            </div>
            <ul className="hotkeys-list">
              {HOTKEYS.map((hotkey) => (
                <li key={hotkey.combo}>
                  <span className="hotkey-chip">{hotkey.combo}</span>
                  <span>{hotkey.description}</span>
                </li>
              ))}
            </ul>
            <a
              className="docs-link"
              href="https://github.com/40uf411/dash"
              target="_blank"
              rel="noreferrer"
            >
              Read the documentation {'>'}
            </a>
          </section>

          <section className="settings-pane card-pane">
            <div className="glass-card settings-card">
              <div className="glass-header">
                <div>
                  <p className="glass-eyebrow">Dashboard &amp; pipeline</p>
                  <h3 className="glass-title">Workspace settings</h3>
                </div>
                <MdDisplaySettings size={22} className="settings-badge" />
              </div>

              <div className="glass-body settings-body">
                <div className="workspace-sections">
                  <div className="workspace-section">
                    <h4 className="workspace-section-title">Pipeline settings</h4>
                    <p className="muted-text" style={{ margin: 0 }}>
                      Manage the active pipeline name and keep quick actions at hand.
                    </p>
                    <label className="field">
                      <span className="field-label">Pipeline name</span>
                      <input
                        className="field-input"
                        value={pipelineName}
                        onChange={(e) => onPipelineNameChange && onPipelineNameChange(e.target.value)}
                        placeholder="Untitled pipeline"
                      />
                    </label>

                    <div className="settings-actions">
                      <button
                        className="btn-primary"
                        type="button"
                        onClick={() => onSavePipeline && onSavePipeline(pipelineName)}
                      >
                        <IoSave size={16} />
                        Save
                      </button>
                      <button
                        className="btn-danger"
                        type="button"
                        onClick={() => {
                          onClearDashboard && onClearDashboard()
                          onClose && onClose()
                        }}
                      >
                        <MdDeleteOutline size={20} />
                        Clear
                      </button>
                      <button
                        className="btn-secondary"
                        type="button"
                        onClick={() => onDownloadPipeline && onDownloadPipeline()}
                      >
                        <RiDownloadCloud2Fill size={16} />
                        Download
                      </button>
                      <button
                        className="btn-secondary"
                        type="button"
                        onClick={() => onUploadPipeline && onUploadPipeline()}
                      >
                        <RiUploadCloud2Fill size={16} />
                        Upload
                      </button>
                    </div>
                  </div>

                  <div className="workspace-section">
                    <h4 className="workspace-section-title">Server settings</h4>
                    <p className="muted-text" style={{ margin: 0 }}>
                      Configure your deployment endpoint and keep the connection status in sync.
                    </p>
                    <div className="settings-grid">
                      <label className="field">
                        <span className="field-label">Hostname</span>
                        <input
                          className="field-input"
                          value={serverHost}
                          onChange={(e) => onServerHostChange && onServerHostChange(e.target.value)}
                          placeholder="e.g. pipelines.internal"
                        />
                      </label>
                      <label className="field">
                        <span className="field-label">Username</span>
                        <input
                          className="field-input"
                          value={serverUser}
                          onChange={(e) => onServerUserChange && onServerUserChange(e.target.value)}
                          placeholder="deploy"
                        />
                      </label>
                      <label className="field">
                        <span className="field-label">Password</span>
                        <input
                          className="field-input"
                          type="password"
                          value={serverPassword}
                          onChange={(e) =>
                            onServerPasswordChange && onServerPasswordChange(e.target.value)
                          }
                          placeholder="********"
                        />
                      </label>
                    </div>

                    <div className="server-actions">
                      <button
                        className="btn-primary subtle"
                        type="button"
                        onClick={() => onTestConnection && onTestConnection()}
                        disabled={testingConnection}
                      >
                        {testingConnection ? (
                          'Testing connection...'
                        ) : (
                          <>
                            <CgDebug size={18} />
                            Test connection
                          </>
                        )}
                      </button>
                      <button
                        className={`btn-connect${connected ? ' connected' : ''}`}
                        type="button"
                        onClick={() => onConnectToggle && onConnectToggle()}
                        disabled={connecting}
                      >
                        {connecting ? (
                          'Connecting...'
                        ) : connected ? (
                          <>
                            <TbPlugConnectedX size={18} />
                            Disconnect
                          </>
                        ) : (
                          <>
                            <GrConnect size={18} />
                            Connect
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
