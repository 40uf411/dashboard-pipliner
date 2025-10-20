import { useEffect } from 'react'

export default function Toast({ toasts, onDismiss }) {
  useEffect(() => {
    const timers = toasts.map((t) => setTimeout(() => onDismiss(t.id), t.duration || 5000))
    return () => timers.forEach(clearTimeout)
  }, [toasts, onDismiss])

  if (!toasts.length) return null
  return (
    <div className="toast-stack">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.type || 'info'}`}>{t.message}</div>
      ))}
    </div>
  )
}
