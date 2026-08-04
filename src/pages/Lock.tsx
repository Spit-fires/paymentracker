import { useEffect, useState } from 'react'
import { useApp } from '../state/AppContext'
import { verifyPin } from '../lib/pin'
import { getKV, K } from '../lib/db'
import type { Session } from '../types'

function PinDots({ len }: { len: number }) {
  return (
    <div className="flex justify-center gap-4 my-6">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className={`w-3.5 h-3.5 rounded-full transition ${
            i < len ? 'bg-[#12314f] dark:bg-[#7fb3e0]' : 'bg-[#e3ddd0] dark:bg-[#2c4054]'
          }`}
        />
      ))}
    </div>
  )
}

export function Lock() {
  const { setLocked } = useApp()
  const [pin, setPin] = useState('')
  const [err, setErr] = useState(false)

  useEffect(() => {
    if (pin.length < 4) return
    const hash = () => getKV<Session>(K.SESSION)
    hash().then(async (s) => {
      const ok = s?.pinHash ? await verifyPin(pin, s.pinHash) : true
      if (ok) {
        setLocked(false)
        setErr(false)
      } else {
        setErr(true)
        setPin('')
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin])

  const add = (d: string) => {
    if (pin.length >= 4) return
    setErr(false)
    setPin((p) => p + d)
  }
  const del = () => setPin((p) => p.slice(0, -1))

  return (
    <div className="min-h-screen bg-[#12314f] flex flex-col items-center justify-center px-8">
      <div className="text-white/90 text-[30px] font-bold mb-1">৳</div>
      <div className="text-white/70 text-[13px] mb-1">Payment Tracker is locked</div>
      <PinDots len={pin.length} />
      {err && <div className="text-red-300 text-[12.5px] mb-2">Wrong PIN, try again</div>}
      <div className="grid grid-cols-3 gap-3 max-w-[260px] w-full mt-2">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((k, i) =>
          k === '' ? (
            <div key={i} />
          ) : (
            <button
              key={i}
              onClick={() => (k === '⌫' ? del() : add(k))}
              className="h-14 rounded-2xl bg-white/10 hover:bg-white/20 active:scale-95 text-white text-[20px] font-semibold transition"
            >
              {k}
            </button>
          ),
        )}
      </div>
    </div>
  )
}
