import type { WorksheetDetail } from '@for-kids/shared'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { errorMessage, post } from '../../api'

const TEMPLATE = {
  subjectCode: 'math',
  grade: 1,
  title: 'Make Ten (A)',
  topic: 'Tách–gộp qua 10',
  layout: 'grid',
  questions: [
    { body: { type: 'split_strategy', op: '+', a: 7, b: 6 }, skillCodes: ['math.make10.add'] },
    {
      body: {
        type: 'fill_blank',
        prompt: { text: '97 {{1}} 86' },
        blanks: [{ id: '1', accept: ['>'], input: 'choice', options: ['<', '>', '='] }],
      },
      skillCodes: ['math.compare'],
    },
  ],
}

/**
 * Tạo bài bằng JSON. Trình soạn theo từng loại câu chưa làm; thường agent tạo bài qua MCP.
 */
export function NewWorksheetPage() {
  const navigate = useNavigate()
  const [text, setText] = useState(() => JSON.stringify(TEMPLATE, null, 2))
  const [error, setError] = useState<string | null>(null)

  const create = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    let input: unknown
    try {
      input = JSON.parse(text)
    } catch (err) {
      setError(`JSON lỗi: ${(err as Error).message}`)
      return
    }
    try {
      const w = await post<WorksheetDetail>('/parent/worksheets', input)
      navigate(`/parent/worksheets/${w.id}`)
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="text-2xl font-bold">Tạo bài (JSON)</h1>
      <p className="mt-1 text-sm text-slate-500">
        Bài mới ở trạng thái nháp. Định dạng câu hỏi xem docs/spec.md §4; agent có thể gọi tool get_question_schema để lấy JSON Schema và ví dụ.
      </p>
      <form onSubmit={create} className="mt-4 flex flex-col gap-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          className="h-[60vh] rounded-xl border border-slate-300 p-3 font-mono text-sm"
        />
        {error && <p className="whitespace-pre-line text-red-600">{error}</p>}
        <button className="min-h-touch self-end rounded-xl bg-slate-800 px-6 text-white">Tạo bài nháp</button>
      </form>
    </main>
  )
}
