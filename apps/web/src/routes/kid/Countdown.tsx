import { useEffect, useRef, useState } from 'react'

type Props = {
  deadlineAt: string
  /** Giờ server lúc tải bài, để không phụ thuộc đồng hồ của iPad. */
  serverNow: string
  totalSec: number
  onExpire: () => void
}

const fmt = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`

/** Đồng hồ đếm ngược (§6): đổi màu khi còn 10% thời gian, hết giờ thì gọi onExpire một lần. */
export function Countdown({ deadlineAt, serverNow, totalSec, onExpire }: Props) {
  const offset = useRef(new Date(serverNow).getTime() - Date.now())
  const remaining = () => Math.max(0, Math.ceil((new Date(deadlineAt).getTime() - (Date.now() + offset.current)) / 1000))
  const [left, setLeft] = useState(remaining)
  const fired = useRef(false)

  useEffect(() => {
    const t = setInterval(() => {
      const l = remaining()
      setLeft(l)
      if (l === 0 && !fired.current) {
        fired.current = true
        onExpire()
      }
    }, 250)
    return () => clearInterval(t)
  })

  const low = left <= Math.max(5, totalSec * 0.1)
  return (
    <span className={`rounded-full px-3 py-1 font-mono text-xl font-bold ${low ? 'animate-pulse bg-red-100 text-red-700' : 'bg-slate-100'}`}>
      ⏱ {fmt(left)}
    </span>
  )
}
