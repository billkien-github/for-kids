import { AssignInput, QuestionInput, WorksheetInput, WorksheetPatch, type McpScope } from '@for-kids/shared'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { listActiveChildren } from '../db/children.js'
import { mcpAudit } from '../db/schema.js'
import type { Deps } from '../deps.js'
import { HttpError } from '../http.js'
import { assignWorksheet } from '../services/assignments.js'
import { saveImage } from '../services/assets.js'
import type { TokenAuth } from '../services/tokens.js'
import {
  createWorksheet,
  getCatalog,
  getWorksheetDetail,
  listWorksheets,
  setWorksheetStatus,
  updateWorksheet,
  upsertSkill,
  upsertTopic,
} from '../services/worksheets.js'
import { childMistakes, childReport } from '../services/report.js'
import { generatePracticePrompt, IMPORT_WORKSHEET_PROMPT, QUESTION_EXAMPLES } from './examples.js'

// Tham số của create/update_worksheet. Kiểu câu hỏi để lỏng ở đây; WorksheetInput kiểm tra chi tiết
// để báo lỗi kèm đường dẫn chính xác.
const worksheetShape = {
  subjectCode: z.string().describe('math | vi | en'),
  grade: z.number().int().describe('0 = mầm non, 1–12'),
  title: z.string(),
  topic: z.string().optional().describe('Tên chủ đề; chưa có thì tự tạo'),
  description: z.string().optional(),
  lang: z.string().optional().describe('Ngôn ngữ đọc đề, vd. en-US cho bài Toán tiếng Anh'),
  layout: z.enum(['one_per_screen', 'grid']).optional(),
  timeLimitSec: z.number().int().optional(),
  sourceNote: z.string().optional().describe('Nguồn: tên file, trang…'),
  questions: z.array(z.record(z.string(), z.unknown())).describe('Mỗi phần tử: { body, explanation?, points?, ttsLang?, skillCodes? }'),
}

/** "questions.3.blanks.0.accept" → "questions[3].blanks[0].accept" (§8). */
const formatPath = (path: PropertyKey[] | string) =>
  (typeof path === 'string' ? path.split('.') : path.map(String))
    .map((seg, i) => (/^\d+$/.test(seg) ? `[${seg}]` : i === 0 ? seg : `.${seg}`))
    .join('')

const json = (data: unknown): CallToolResult => ({ content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] })

function errorResult(err: unknown): CallToolResult {
  if (err instanceof HttpError) {
    const issues = err.body.issues?.map((i) => `- ${formatPath(i.path)}: ${i.message}`).join('\n')
    return { isError: true, content: [{ type: 'text', text: [err.body.message ?? err.body.error, issues].filter(Boolean).join('\n') }] }
  }
  if (err instanceof z.ZodError) {
    const issues = err.issues.map((i) => `- ${formatPath(i.path)}: ${i.message}`).join('\n')
    return { isError: true, content: [{ type: 'text', text: `Dữ liệu không hợp lệ:\n${issues}` }] }
  }
  throw err
}

/** Tóm tắt tham số để ghi nhật ký: bỏ nội dung lớn (base64, danh sách câu hỏi). */
function summarizeArgs(args: Record<string, unknown>) {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(args)) {
    if (typeof v === 'string') out[k] = v.length > 200 ? `<${v.length} ký tự>` : v
    else if (Array.isArray(v)) out[k] = `<${v.length} phần tử>`
    else if (v && typeof v === 'object') out[k] = '<object>'
    else out[k] = v
  }
  return out
}

export function buildMcpServer(deps: Deps, auth: TokenAuth) {
  const { db } = deps
  const { familyId } = auth
  const server = new McpServer({ name: 'for-kids', version: '0.1.0' }, { instructions: IMPORT_WORKSHEET_PROMPT })

  const tool = <S extends z.ZodRawShape>(
    name: string,
    scope: McpScope,
    description: string,
    inputSchema: S,
    run: (args: z.infer<z.ZodObject<S>>) => Promise<unknown>,
  ) =>
    server.registerTool(name, { description, inputSchema }, (async (args: z.infer<z.ZodObject<S>>) => {
      let ok = false
      try {
        if (!auth.scopes.includes(scope)) throw new HttpError(403, { error: 'forbidden', message: `Token thiếu quyền "${scope}"` })
        const result = await run(args)
        ok = true
        return json(result)
      } catch (err) {
        return errorResult(err)
      } finally {
        await db.insert(mcpAudit).values({ tokenId: auth.tokenId, tool: name, argsSummary: summarizeArgs(args), ok })
      }
    }) as never)

  tool('list_children', 'results:read', 'Danh sách các bé: id, tên, lớp (0 = mầm non).', {}, async () =>
    (await listActiveChildren(db, familyId)).map((c) => ({ id: c.id, name: c.name, grade: c.grade })),
  )

  tool('list_catalog', 'content:write', 'Môn, chủ đề, kỹ năng hiện có, để gắn subjectCode/topic/skillCodes đúng.', {}, () =>
    getCatalog(db, familyId),
  )

  tool(
    'get_question_schema',
    'content:write',
    'JSON Schema của bài tập (create_worksheet) và một ví dụ cho mỗi loại câu hỏi. Gọi trước khi soạn bài.',
    {},
    // Schema bài đã chứa schema câu hỏi (trường questions), không gửi lặp.
    async () => ({ worksheet: z.toJSONSchema(WorksheetInput, { io: 'input', unrepresentable: 'any' }), examples: QUESTION_EXAMPLES }),
  )

  tool(
    'upsert_topic',
    'content:write',
    'Tạo chủ đề nếu chưa có (cập nhật khoảng lớp nếu đã có).',
    { subjectCode: z.string(), name: z.string().min(1), gradeMin: z.number().int().min(0), gradeMax: z.number().int().min(0) },
    async (a) => {
      await upsertTopic(db, familyId, a)
      return { ok: true }
    },
  )

  tool(
    'upsert_skill',
    'content:write',
    'Tạo kỹ năng nếu chưa có (cập nhật tên/chủ đề nếu đã có). code dạng "math.add.carry".',
    { subjectCode: z.string(), code: z.string().regex(/^[a-z0-9_.-]+$/), name: z.string().min(1), topic: z.string().optional() },
    async (a) => {
      await upsertSkill(db, familyId, a)
      return { ok: true }
    },
  )

  tool(
    'upload_asset',
    'content:write',
    'Tải ảnh minh hoạ (PNG/JPEG/GIF/WebP, tối đa 10MB) → assetId để dùng trong imageAssetId.',
    { filename: z.string(), mime: z.string(), base64: z.string().min(1) },
    async (a) => {
      const saved = await saveImage(db, deps.storage, familyId, Buffer.from(a.base64, 'base64'))
      return { assetId: saved.id, mime: saved.mime, bytes: saved.bytes }
    },
  )

  tool(
    'create_worksheet',
    'content:write',
    'Tạo bài tập ở trạng thái nháp. Định dạng câu hỏi xem get_question_schema. Lỗi trả về đường dẫn trường sai, ví dụ questions[3].body.blanks[0].accept.',
    worksheetShape,
    async (a) => {
      const input = WorksheetInput.parse(a)
      const id = await createWorksheet(db, familyId, input, 'mcp', auth.tokenId)
      return { id, status: 'draft', questionCount: input.questions.length }
    },
  )

  tool(
    'list_worksheets',
    'content:write',
    'Danh sách bài tập, lọc theo trạng thái / môn / lớp.',
    {
      status: z.enum(['draft', 'published', 'archived']).optional(),
      subjectCode: z.string().optional(),
      grade: z.number().int().optional(),
    },
    (a) => listWorksheets(db, familyId, a),
  )

  tool('get_worksheet', 'content:write', 'Bài tập đầy đủ, kèm đáp án.', { id: z.uuid() }, (a) =>
    getWorksheetDetail(db, familyId, a.id),
  )

  tool(
    'update_worksheet',
    'content:write',
    'Sửa thông tin chung và/hoặc thay toàn bộ danh sách câu hỏi (gửi questions). Chỉ gửi trường cần đổi. Bài đã có người làm vẫn sửa được.',
    { id: z.uuid(), ...z.object(worksheetShape).partial().shape },
    async ({ id, ...patch }) => {
      await updateWorksheet(db, familyId, id, WorksheetPatch.parse(patch))
      return { ok: true }
    },
  )

  tool('publish_worksheet', 'publish', 'Xuất bản bài (bé mới thấy được). Chỉ làm khi phụ huynh yêu cầu.', { id: z.uuid() }, async (a) => {
    await setWorksheetStatus(db, familyId, a.id, 'published')
    return { ok: true }
  })

  tool('unpublish_worksheet', 'publish', 'Đưa bài về nháp.', { id: z.uuid() }, async (a) => {
    await setWorksheetStatus(db, familyId, a.id, 'draft')
    return { ok: true }
  })

  tool(
    'assign_worksheet',
    'assign',
    'Giao bài đã xuất bản cho các bé, có thể kèm hạn nộp (ISO 8601 có múi giờ, vd. 2026-11-01T20:00:00+07:00).',
    { worksheetId: z.uuid(), childIds: z.array(z.uuid()).min(1), dueAt: z.string().optional() },
    async (a) => ({ ids: await assignWorksheet(db, familyId, AssignInput.parse(a), 'token') }),
  )

  tool(
    'get_child_report',
    'results:read',
    'Báo cáo của một bé: điểm trung bình lần chính thức theo môn/tuần, mức thành thạo từng kỹ năng (kỹ năng yếu), streak, bài quá hạn, số câu đến hạn ôn.',
    { childId: z.uuid(), from: z.string().optional().describe('ISO 8601, mặc định 8 tuần trước'), to: z.string().optional() },
    (a) => childReport(deps, familyId, a.childId, { from: a.from ? new Date(a.from) : undefined, to: a.to ? new Date(a.to) : undefined }),
  )

  tool(
    'get_child_mistakes',
    'results:read',
    'Các câu bé làm sai gần đây (đề đầy đủ kèm đáp án, câu trả lời của bé, kỹ năng), để soạn bài luyện đúng chỗ yếu.',
    { childId: z.uuid(), limit: z.number().int().min(1).max(100).optional() },
    (a) => childMistakes(deps, familyId, a.childId, a.limit),
  )

  server.registerPrompt(
    'generate_practice',
    { description: 'Soạn bài luyện tập theo chỗ yếu của một bé rồi giao cho bé', argsSchema: { childName: z.string().optional() } },
    (a) => ({ messages: [{ role: 'user', content: { type: 'text', text: generatePracticePrompt(a.childName) } }] }),
  )

  server.registerResource(
    'question-schema',
    'forkids://schema/questions',
    { description: 'JSON Schema câu hỏi kèm ví dụ cho mỗi loại', mimeType: 'application/json' },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify({ schema: z.toJSONSchema(QuestionInput, { io: 'input', unrepresentable: 'any' }), examples: QUESTION_EXAMPLES }),
        },
      ],
    }),
  )

  server.registerPrompt('import_worksheet', { description: 'Hướng dẫn nhập bài tập từ file nguồn' }, () => ({
    messages: [{ role: 'user', content: { type: 'text', text: IMPORT_WORKSHEET_PROMPT } }],
  }))

  return server
}
