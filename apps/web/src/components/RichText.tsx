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

export function SpeakButton({ text, lang, small }: { text: string; lang: string; small?: boolean }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        speak(text, lang)
      }}
      className={`shrink-0 rounded-full bg-sky-100 active:bg-sky-200 ${small ? 'size-9 text-base' : 'size-12 text-xl'}`}
      aria-label="Đọc to"
    >
      🔊
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
        <div className="flex w-full items-start gap-3">
          <div className="flex-1">
            {value.text && (
              <p className="leading-relaxed whitespace-pre-line">
                <InlineText text={value.text} renderBlank={renderBlank} />
              </p>
            )}
            {value.sub && (
              <p className="mt-1 flex items-center gap-2 text-[0.85em] text-slate-500 italic">
                <span className="flex-1">
                  <InlineText text={value.sub.text} />
                </span>
                {lang && <SpeakButton text={value.sub.text} lang={value.sub.lang} small />}
              </p>
            )}
          </div>
          {lang && spoken && <SpeakButton text={spoken} lang={lang} />}
        </div>
      )}
      {value.imageAssetId && (
        <img src={`/api/assets/${value.imageAssetId}`} alt="" className="max-h-72 max-w-full rounded-xl object-contain" loading="lazy" />
      )}
      {value.clock && <Clock hourAngle={angleForTime(value.clock.h, value.clock.m)} minute={value.clock.m} size={clockSize} />}
    </div>
  )
}
