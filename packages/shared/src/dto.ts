import { z } from 'zod'
import type { QuestionResponse } from './grading.js'
import type { QuestionBody } from './question.js'
import type { KidQuestionBody } from './sanitize.js'

// Dữ liệu trả về của REST API cho bài tập, giao bài, làm bài. Thời điểm là chuỗi ISO.

export type WorksheetStatus = 'draft' | 'published' | 'archived'
export type WorksheetLayout = 'one_per_screen' | 'grid'

export type WorksheetSummary = {
  id: string
  title: string
  subjectCode: string
  subjectName: string
  topic: string | null
  grade: number
  status: WorksheetStatus
  layout: WorksheetLayout
  timeLimitSec: number | null
  questionCount: number
  source: 'manual' | 'mcp'
  updatedAt: string
  publishedAt: string | null
}

export type WorksheetQuestion = {
  id: string
  body: QuestionBody
  explanation: string | null
  points: number
  ttsLang: string | null
  skillCodes: string[]
}

export type WorksheetDetail = WorksheetSummary & {
  description: string | null
  lang: string | null
  sourceNote: string | null
  ttsLang: string
  questions: WorksheetQuestion[]
}

export type Catalog = {
  subjects: { code: string; name: string; ttsLang: string }[]
  topics: { subjectCode: string; name: string; gradeMin: number; gradeMax: number }[]
  skills: { subjectCode: string; code: string; name: string; topic: string | null }[]
}

export type AssignmentView = {
  id: string
  worksheet: { id: string; title: string; subjectCode: string; subjectName: string; questionCount: number; timeLimitSec: number | null }
  child: { id: string; name: string; avatar: string }
  dueAt: string | null
  createdAt: string
  overdue: boolean
  /** Lần nộp đầu tiên sau khi được giao (null nếu chưa làm). */
  completedAt: string | null
  scorePct: number | null
  stars: number | null
}

export const AssignInput = z.object({
  worksheetId: z.uuid(),
  childIds: z.array(z.uuid()).min(1),
  dueAt: z.iso.datetime({ offset: true }).nullish(),
})
export type AssignInput = z.infer<typeof AssignInput>

export type LibraryItem = {
  id: string
  title: string
  subjectCode: string
  subjectName: string
  topic: string | null
  grade: number
  questionCount: number
  timeLimitSec: number | null
  bestScorePct: number | null
  bestStars: number | null
  attempts: number
}

export type KidHome = {
  child: { id: string; name: string; avatar: string; grade: number }
  stars: number
  today: AssignmentView[]
  library: LibraryItem[]
}

// ---------- Làm bài ----------

export type AttemptItem = {
  /** id của attempt_answer: dùng làm khoá khi lưu câu trả lời. */
  id: string
  body: KidQuestionBody
  points: number
  ttsLang: string
  response: unknown
}

export type AttemptItemResult = {
  id: string
  /** Đề đầy đủ kèm đáp án, chỉ có sau khi nộp. */
  body: QuestionBody
  score: number | null
  isCorrect: boolean | null
  explanation: string | null
}

export type AttemptView = {
  id: string
  kind: 'normal' | 'review'
  attemptNo: number
  worksheet: { id: string; title: string; layout: WorksheetLayout; subjectCode: string } | null
  startedAt: string
  deadlineAt: string | null
  /** Giờ server lúc trả lời, để FE tính đếm ngược không phụ thuộc đồng hồ của iPad. */
  serverNow: string
  submittedAt: string | null
  autoSubmitted: boolean
  items: AttemptItem[]
  result: {
    scorePct: number
    stars: number
    starsGained: number
    earnedPoints: number
    totalPoints: number
    items: AttemptItemResult[]
  } | null
}

export const StartAttemptInput = z.object({ worksheetId: z.uuid(), assignmentId: z.uuid().nullish() })
export const SaveAnswersInput = z.object({
  answers: z
    .array(z.object({ itemId: z.uuid(), response: z.unknown(), timeMs: z.number().int().min(0).nullish() }))
    .max(200),
})
export type SaveAnswersInput = z.infer<typeof SaveAnswersInput>

export type AttemptSummary = {
  id: string
  worksheetId: string | null
  worksheetTitle: string | null
  subjectCode: string | null
  attemptNo: number
  kind: 'normal' | 'review'
  startedAt: string
  submittedAt: string | null
  durationSec: number | null
  scorePct: number | null
  stars: number | null
  autoSubmitted: boolean
}

// ---------- Token MCP ----------

export const MCP_SCOPES = ['content:write', 'publish', 'assign', 'results:read'] as const
export type McpScope = (typeof MCP_SCOPES)[number]

export const CreateTokenInput = z.object({
  name: z.string().trim().min(1).max(60),
  scopes: z.array(z.enum(MCP_SCOPES)).min(1).default([...MCP_SCOPES]),
})

export type TokenInfo = {
  id: string
  name: string
  scopes: McpScope[]
  createdAt: string
  lastUsedAt: string | null
  revokedAt: string | null
}

export type { QuestionResponse }
