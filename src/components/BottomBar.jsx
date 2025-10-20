import { useEffect, useMemo, useRef, useState } from 'react'
import { FiGitBranch } from 'react-icons/fi'
import { MdDarkMode } from 'react-icons/md'
import { IoSunnyOutline, IoLockOpenOutline, IoLockClosed } from 'react-icons/io5'
import { PiWarningBold } from 'react-icons/pi'
import { LuMinimize2, LuMaximize2 } from 'react-icons/lu'
import { TbViewportWide, TbTextSize } from 'react-icons/tb'
import { TbScreenshot } from 'react-icons/tb'
import { ImLab } from 'react-icons/im'
import { FaPlay } from 'react-icons/fa'
import { FaStop } from 'react-icons/fa6'

function BottomBar({
  nodesCount,
  isDark,
  onToggleDark,
  zoom,
  onZoomChange,
  onZoomStep,
  interactive,
  onToggleInteractive,
  onFitView,
  checking,
  onToggleCheck,
  issueCount = 0,
  executing = false,
  onRun,
  execResult = null,
  compact = false,
  onScreenshot,
}) {
  // keep slider value within bounds
  const clampedZoom = useMemo(() => Math.min(150, Math.max(50, Math.round(zoom))), [zoom])
  const [showLabels, setShowLabels] = useState(true)
  const [elapsedMs, setElapsedMs] = useState(0)
  const timerStartRef = useRef(null)
  const tickRef = useRef(null)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light')
  }, [isDark])

  // Start/stop the timer based on execution lifecycle
  useEffect(() => {
    // If execution starts and we don't yet have a start time, set it
    if (executing && !timerStartRef.current) {
      timerStartRef.current = Date.now()
      setElapsedMs(0)
    }
    // If executing, run an interval to update the elapsed time
    if (executing) {
      if (!tickRef.current) {
        tickRef.current = setInterval(() => {
          if (timerStartRef.current) setElapsedMs(Date.now() - timerStartRef.current)
        }, 200)
      }
    } else {
      // Execution stopped: freeze timer (keep last value) and clear interval
      if (tickRef.current) {
        clearInterval(tickRef.current)
        tickRef.current = null
      }
    }

    // When both not executing and no execResult (bar animation finished), reset timer
    if (!executing && !execResult) {
      timerStartRef.current = null
      setElapsedMs(0)
    }

    return () => {
      // Cleanup on unmount
      if (tickRef.current) {
        clearInterval(tickRef.current)
        tickRef.current = null
      }
    }
  }, [executing, execResult])

  const showTimer = executing || !!execResult || !!timerStartRef.current

  const onRunClick = () => {
    // Prime timer immediately on click for snappy start
    timerStartRef.current = Date.now()
    setElapsedMs(0)
    if (!tickRef.current) {
      tickRef.current = setInterval(() => {
        if (timerStartRef.current) setElapsedMs(Date.now() - timerStartRef.current)
      }, 200)
    }
    onRun && onRun()
  }

  const fmt = (ms) => {
    const total = Math.max(0, Math.floor(ms / 1000))
    const m = Math.floor(total / 60)
    const s = total % 60
    const mm = String(m).padStart(2, '0')
    const ss = String(s).padStart(2, '0')
    return `${mm}:${ss}`
  }

  const barClasses = [
    'bottom-bar',
    checking ? 'checking' : '',
    executing ? 'executing' : '',
    execResult ? `done-${execResult}` : '',
    compact ? 'compact' : '',
    showLabels ? '' : 'labels-hidden',
  ].filter(Boolean).join(' ')

  return (
    <div className={barClasses}>
      {showTimer && (
        <>
          <div className="bar-item" title="Execution time">
            <span className="bar-timer" style={{ fontWeight: 600 }}>{fmt(elapsedMs)}</span>
          </div>
          <div className="bar-sep" />
        </>
      )}
      <div className="bar-item" title="Total nodes and issues">
        <FiGitBranch /> {nodesCount}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: issueCount > 0 ? '#ef4444' : 'var(--text-color)' }}>
          <PiWarningBold /> {issueCount}
        </span>
      </div>

      

      <div className="bar-sep" />

      <div className="bar-item" title="Run pipeline">
        <div
          className={`bar-btn run${executing ? ' active' : ''}`}
          role="button"
          tabIndex={0}
          onClick={onRunClick}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onRunClick()}
          aria-label="Run pipeline"
        >
          {executing ? <FaStop size={14} /> : <FaPlay size={14} />}
        </div>
        <span style={{ color: executing ? '#60a5fa' : 'var(--muted-text)', fontSize: '0.85rem' }}>
          {executing ? 'Executing…' : 'Run'}
        </span>
      </div>

      <div className="bar-item" title="Check graph">
        <div
          className={`bar-btn check${checking ? ' active' : ''}`}
          role="button"
          tabIndex={0}
          onClick={onToggleCheck}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onToggleCheck()}
          aria-label="Check"
        >
          <ImLab size={18} />
        </div>
        <span style={{ color: checking ? '#ef4444' : 'var(--muted-text)', fontSize: '0.85rem' }}>
          {checking ? 'Checking…' : 'Check'}
        </span>
      </div>

      <div className="bar-sep" />

      <div className="bar-item" title="Interactive mode">
        <div
          className="bar-btn"
          role="button"
          tabIndex={0}
          onClick={onToggleInteractive}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onToggleInteractive()}
          aria-label="Toggle interactive mode"
        >
          {interactive ? <IoLockOpenOutline size={18} /> : <IoLockClosed size={18} />}
        </div>
        <span className="bar-label" style={{ color: 'var(--muted-text)', fontSize: '0.85rem' }}>{interactive ? 'Unlocked' : 'Locked'}</span>
      </div>

      <div className="bar-item" title="Fit view">
        <div
          className="bar-btn"
          role="button"
          tabIndex={0}
          onClick={onFitView}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onFitView()}
          aria-label="Fit view"
        >
          <TbViewportWide size={18} />
        </div>
        <span className="bar-label" style={{ color: 'var(--muted-text)', fontSize: '0.85rem' }}>Fit</span>
      </div>

      <div className="bar-item" title="Display size">
        <div
          className="bar-btn"
          role="button"
          tabIndex={0}
          onClick={() => onZoomStep(-10)}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onZoomStep(-10)}
          aria-label="Zoom out"
        >
          <LuMinimize2 size={18} />
        </div>
        <span className="bar-label" style={{ color: 'var(--muted-text)', fontSize: '0.85rem' }}>Out</span>
        <input
          className="zoom-slider"
          type="range"
          min={50}
          max={150}
          step={5}
          value={clampedZoom}
          onChange={(e) => onZoomChange(Number(e.target.value))}
        />
        <div
          className="bar-btn"
          role="button"
          tabIndex={0}
          onClick={() => onZoomStep(10)}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onZoomStep(10)}
          aria-label="Zoom in"
        >
          <LuMaximize2 size={18} />
        </div>
        <span className="bar-label" style={{ color: 'var(--muted-text)', fontSize: '0.85rem' }}>In</span>
        <span className="bar-label" style={{ width: 36, textAlign: 'right', color: 'var(--muted-text)', fontSize: '0.85rem' }}>{clampedZoom}%</span>
      </div>

      <div className="bar-sep" />


      <div className="bar-item" title="Toggle theme">
        <div
          className="bar-btn"
          role="button"
          tabIndex={0}
          onClick={onToggleDark}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onToggleDark()}
          aria-label="Toggle dark mode"
        >
          {isDark ? <IoSunnyOutline size={18} /> : <MdDarkMode size={18} />}
        </div>
        <span className="bar-label" style={{ color: 'var(--muted-text)', fontSize: '0.85rem' }}>{isDark ? 'Dark' : 'Light'}</span>
      </div>

      <div className="bar-sep" />

      <div className="bar-item" title="Screenshot">
        <div
          className="bar-btn"
          role="button"
          tabIndex={0}
          onClick={() => onScreenshot && onScreenshot()}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onScreenshot && onScreenshot()}
          aria-label="Take screenshot"
        >
          <TbScreenshot size={18} />
        </div>
        <span className="bar-label" style={{ color: 'var(--muted-text)', fontSize: '0.85rem' }}>Shot</span>
      </div>

      <div className="bar-sep" />

      <div className="bar-item" title="Toggle labels">
        <div
          className="bar-btn"
          role="button"
          tabIndex={0}
          onClick={() => setShowLabels((v) => !v)}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setShowLabels((v) => !v)}
          aria-label="Toggle labels"
        >
          <TbTextSize size={18} />
        </div>
        <span className="bar-label" style={{ color: 'var(--muted-text)', fontSize: '0.85rem' }}>Labels</span>
      </div>
    </div>
  )
}

export default BottomBar
