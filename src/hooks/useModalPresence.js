import { useEffect, useState } from 'react'

export default function useModalPresence(open = false, duration = 520) {
  const [render, setRender] = useState(open)
  const [isLeaving, setIsLeaving] = useState(false)

  useEffect(() => {
    let timerId
    if (open) {
      setRender(true)
      setIsLeaving(false)
    } else if (render) {
      setIsLeaving(true)
      timerId = setTimeout(() => {
        setIsLeaving(false)
        setRender(false)
      }, duration)
    }
    return () => {
      if (timerId) clearTimeout(timerId)
    }
  }, [open, duration, render])

  return [render, isLeaving]
}
