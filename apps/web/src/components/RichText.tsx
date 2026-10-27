import type { RichText as RichTextData } from '@for-kids/shared'
import { Fragment, type ReactNode } from 'react'
import { speak } from '../lib/speak'
import { angleForTime, Clock } from './Clock'

const TOKEN = /(\[\[\d+\/\d+\]\]|\{\{[^}]+\}\})/g

/** Chữ có phân số [[a/b]]; `renderBlank` vẽ ô trống {{id}} (chỉ dùng ở fill_blank). */
export function InlineText({ text, renderBlank }: { text: string; renderBlank?: (id: string) => ReactNode }) {
  return (
    <>
      {text.split(TOKEN).map((part, i) => {
        const frac = part.match(/^\[\[(\d+)\/(\d+)\]\]$/)
        if (frac) {
          return (
            <span key={i} className="mx-1 inline-flex flex-col items-center align-middle text-[0.85em] leading-none">
              <span className="px-1">{frac[1]}</span>
              <span className="w-full border-t-2 border-current" />
              <span className="px-1">{frac[2]}</span>
            </span>
          )
        }
        const blank = part.match(/^\{\{([^}]+)\}\}$/)
        if (blank) return <Fragment key={i}>{renderBlank ? renderBlank(blank[1]!) : '____'}</Fragment>
        return <Fragment key={i}>{part}</Fragment>
      })}
    </>
  )
}

export function SpeakButton({ text, lang }: { text: string; lang: string }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        speak(text, lang)
      }}
      className="grid size-11 shrink-0 place-items-center rounded-full bg-sky-500 text-white shadow-md ring-2 shadow-sky-300/60 ring-white transition active:scale-95 active:bg-sky-600"
      aria-label="Đọc to"
    >
      <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M11 5 6 9H3v6h3l5 4z" fill="currentColor" />
        <path d="M15.5 8.5a5 5 0 0 1 0 7" />
        <path d="M18.5 5.5a9 9 0 0 1 0 13" />
      </svg>
    </button>
  )
}

type Props = {
  value: RichTextData
  /** Ngôn ngữ đọc; có thì hiện nút 🔊. */
  lang?: string
  renderBlank?: (id: string) => ReactNode
  clockSize?: number
  className?: string
}

/** Hiển thị RichText (§4): chữ + phân số, dòng dịch, ảnh, đồng hồ. */
export function RichText({ value, lang, renderBlank, clockSize = 160, className }: Props) {
  const spoken = value.ttsText ?? value.text
  return (
    <div className={`flex flex-col items-center gap-3 ${className ?? ''}`}>
      {(value.text || value.sub) && (
        // Lưới 2 cột: nút đọc của dòng chính và dòng dịch cùng cỡ, thẳng một cột bên phải.
        <div className={`grid w-full items-center gap-x-3 gap-y-2 ${lang ? 'grid-cols-[1fr_auto]' : 'grid-cols-1'}`}>
          {/* Đề không có chữ nhưng có câu đọc riêng (ttsText) vẫn cần nút đọc. */}
          {(value.text || (lang && spoken)) && (
            <>
              <p className="leading-relaxed whitespace-pre-line">
                <InlineText text={value.text ?? ''} renderBlank={renderBlank} />
              </p>
              {lang && (spoken ? <SpeakButton text={spoken} lang={lang} /> : <span />)}
            </>
          )}
          {value.sub && (
            <>
              <p className="text-[0.85em] text-slate-500 italic">
                <InlineText text={value.sub.text} />
              </p>
              {lang && <SpeakButton text={value.sub.text} lang={value.sub.lang} />}
            </>
          )}
        </div>
      )}
      {value.imageAssetId && (
        <img src={`/api/assets/${value.imageAssetId}`} alt="" className="max-h-72 max-w-full rounded-xl object-contain" loading="lazy" />
      )}
      {value.clock && <Clock hourAngle={angleForTime(value.clock.h, value.clock.m)} minute={value.clock.m} size={clockSize} />}
    </div>
  )
}
