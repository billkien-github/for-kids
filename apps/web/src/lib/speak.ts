// Đọc đề bằng giọng có sẵn của trình duyệt (§9). Chỉ gọi khi bé chạm nút 🔊 (iOS bắt buộc).

const FRACTION = /\[\[(\d+)\/(\d+)\]\]/g
const BLANK = /\{\{[^}]+\}\}/g

const BLANK_WORD: Record<string, string> = { vi: 'ô trống', en: 'blank' }

/** Chuyển chữ hiển thị thành chữ để đọc: ô trống, phân số. */
export function toSpeech(text: string, lang: string): string {
  const base = lang.slice(0, 2)
  return text
    .replace(BLANK, ` ${BLANK_WORD[base] ?? BLANK_WORD.en} `)
    .replace(FRACTION, (_, a, b) => (base === 'vi' ? `${a} phần ${b}` : `${a} over ${b}`))
    .replace(/\s+/g, ' ')
    .trim()
}

export function canSpeak(lang: string): boolean {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return false
  const voices = speechSynthesis.getVoices()
  // Một số trình duyệt nạp danh sách giọng muộn: chưa có danh sách thì cứ cho thử.
  return voices.length === 0 || voices.some((v) => v.lang.replace('_', '-').startsWith(lang.slice(0, 2)))
}

function pickVoice(lang: string): SpeechSynthesisVoice | undefined {
  const voices = speechSynthesis.getVoices().filter((v) => v.lang.replace('_', '-').startsWith(lang.slice(0, 2)))
  const exact = voices.filter((v) => v.lang.replace('_', '-') === lang)
  const pool = exact.length ? exact : voices
  // Ưu tiên giọng chất lượng cao trên iOS/macOS.
  return pool.find((v) => /enhanced|premium|natural/i.test(v.name)) ?? pool[0]
}

export function speak(text: string, lang: string) {
  if (!('speechSynthesis' in window)) return
  speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(toSpeech(text, lang))
  u.lang = lang
  const voice = pickVoice(lang)
  if (voice) u.voice = voice
  u.rate = 0.9
  speechSynthesis.speak(u)
}
