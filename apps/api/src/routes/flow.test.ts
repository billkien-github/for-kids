import type { AttemptView, KidHome, Profile, WorksheetDetail } from '@for-kids/shared'
import { eq } from 'drizzle-orm'
import type { InjectOptions } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mcpAudit } from '../db/schema.js'
import { createTestApp, TEST_PARENT } from '../test-utils.js'

let t: Awaited<ReturnType<typeof createTestApp>>
let sid = ''
const call = (opts: InjectOptions) => t.app.inject({ ...opts, cookies: sid ? { sid } : {} })
const ok = async <T>(opts: InjectOptions, status = 200): Promise<T> => {
  const res = await call(opts)
  expect(res.statusCode, res.body).toBe(status)
  return res.json<T>()
}

let rpcId = 0
async function mcp(token: string, method: string, params: unknown = {}) {
  const res = await t.app.inject({
    method: 'POST',
    url: '/mcp',
    headers: { authorization: `Bearer ${token}`, accept: 'application/json, text/event-stream', 'content-type': 'application/json' },
    payload: { jsonrpc: '2.0', id: ++rpcId, method, params },
  })
  return { status: res.statusCode, body: res.body ? res.json() : null }
}
const callTool = async (token: string, name: string, args: unknown) => {
  const r = await mcp(token, 'tools/call', { name, arguments: args })
  const result = r.body.result as { isError?: boolean; content: { text: string }[] }
  return { isError: !!result.isError, text: result.content[0]!.text, data: result.isError ? null : JSON.parse(result.content[0]!.text) }
}

const WORKSHEET = {
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
      explanation: '97 lớn hơn 86',
    },
    { body: { type: 'single_choice', prompt: { text: '3 + 6 = ?' }, choices: [{ id: 'a', content: { text: '9' } }, { id: 'b', content: { text: '8' } }], answer: 'a' } },
    { body: { type: 'true_false', prompt: { text: '10 − 4 = 5' }, answer: false } },
  ],
}

let token: string
let kid: Profile

beforeEach(async () => {
  t = await createTestApp()
  const login = await t.app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: TEST_PARENT.email, password: TEST_PARENT.password } })
  sid = login.cookies.find((c) => c.name === 'sid')!.value
  await ok({ method: 'POST', url: '/api/parent/unlock', payload: { pin: TEST_PARENT.pin } })
  kid = await ok<Profile>({ method: 'POST', url: '/api/parent/children', payload: { name: 'An', avatar: '🦊', grade: 1 } }, 201)
  token = (await ok<{ token: string }>({ method: 'POST', url: '/api/parent/tokens', payload: { name: 'Claude' } }, 201)).token
})
afterEach(() => t.close())

/** Agent tạo bài, phụ huynh xuất bản và giao cho bé, rồi chọn bé. */
async function publishedAndAssigned(extra: Record<string, unknown> = {}) {
  const created = await callTool(token, 'create_worksheet', { ...WORKSHEET, ...extra })
  expect(created.isError, created.text).toBe(false)
  const worksheetId = created.data.id as string
  await ok({ method: 'POST', url: `/api/parent/worksheets/${worksheetId}/publish` })
  await ok({ method: 'POST', url: '/api/parent/assignments', payload: { worksheetId, childIds: [kid.id] } }, 201)
  await ok({ method: 'POST', url: `/api/profiles/${kid.id}/select`, payload: {} })
  return worksheetId
}

const answersFor = (view: AttemptView, correct: boolean) =>
  view.items.map((item) => {
    switch (item.body.type) {
      case 'split_strategy':
        return { itemId: item.id, response: { cells: correct ? ['7', '3', '3', '13'] : ['7', '3', '3', '12'] } }
      case 'fill_blank':
        return { itemId: item.id, response: { blanks: { '1': correct ? '>' : '<' } } }
      case 'single_choice':
        return { itemId: item.id, response: { choice: correct ? 'a' : 'b' } }
      default:
        return { itemId: item.id, response: { value: !correct } }
    }
  })

describe('MCP', () => {
  it('/agent là bản sao của /mcp', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/agent',
      headers: { authorization: `Bearer ${token}`, accept: 'application/json, text/event-stream', 'content-type': 'application/json' },
      payload: { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().result.tools.length).toBeGreaterThan(5)
  })

  it('từ chối khi thiếu token, thiếu quyền; ghi nhật ký mọi lần gọi tool', async () => {
    expect((await mcp('fk_sai', 'tools/list')).status).toBe(401)

    const tools = await mcp(token, 'tools/list')
    expect(tools.body.result.tools.map((x: { name: string }) => x.name)).toEqual(
      expect.arrayContaining(['create_worksheet', 'publish_worksheet', 'assign_worksheet', 'upload_asset', 'get_question_schema']),
    )

    const readOnly = (await ok<{ token: string }>({ method: 'POST', url: '/api/parent/tokens', payload: { name: 'Chỉ đọc', scopes: ['results:read'] } }, 201)).token
    const denied = await callTool(readOnly, 'create_worksheet', WORKSHEET)
    expect(denied.isError).toBe(true)
    expect(denied.text).toContain('content:write')

    const audit = await t.db.select().from(mcpAudit).where(eq(mcpAudit.tool, 'create_worksheet'))
    expect(audit).toHaveLength(1)
    expect(audit[0]!.ok).toBe(false)
  })

  it('create_worksheet báo lỗi kèm đường dẫn trường sai', async () => {
    const bad = structuredClone(WORKSHEET)
    ;(bad.questions[1]!.body as { blanks: { accept: string[] }[] }).blanks[0]!.accept = []
    const r = await callTool(token, 'create_worksheet', bad)
    expect(r.isError).toBe(true)
    expect(r.text).toContain('questions[1].body.blanks[0].accept')

    const unknownSkill = await callTool(token, 'create_worksheet', {
      ...WORKSHEET,
      questions: [{ ...WORKSHEET.questions[0], skillCodes: ['math.khong-co'] }],
    })
    expect(unknownSkill.text).toContain('questions[0].skillCodes[0]')
  })

  it('tạo bài là nháp, get_worksheet trả đủ đáp án; upload_asset nhận ảnh thật', async () => {
    const created = await callTool(token, 'create_worksheet', WORKSHEET)
    const w = (await callTool(token, 'get_worksheet', { id: created.data.id })).data as WorksheetDetail
    expect(w.status).toBe('draft')
    expect(w.topic).toBe('Tách–gộp qua 10')
    expect(w.questions[0]!.skillCodes).toEqual(['math.make10.add'])

    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')
    const up = await callTool(token, 'upload_asset', { filename: 'a.png', mime: 'image/png', base64: png.toString('base64') })
    expect(up.data.mime).toBe('image/png')
    const again = await callTool(token, 'upload_asset', { filename: 'b.png', mime: 'image/png', base64: png.toString('base64') })
    expect(again.data.assetId).toBe(up.data.assetId) // khử trùng lặp theo sha256
    expect((await callTool(token, 'upload_asset', { filename: 'x.svg', mime: 'image/svg+xml', base64: Buffer.from('<svg/>').toString('base64') })).isError).toBe(true)

    const img = await call({ method: 'GET', url: `/api/assets/${up.data.assetId}` })
    expect(img.statusCode).toBe(200)
    expect(img.headers['content-type']).toBe('image/png')
  })
})

describe('làm bài', () => {
  it('bài nháp không giao được; bé không thấy bài nháp', async () => {
    const created = await callTool(token, 'create_worksheet', WORKSHEET)
    const res = await call({ method: 'POST', url: '/api/parent/assignments', payload: { worksheetId: created.data.id, childIds: [kid.id] } })
    expect(res.statusCode).toBe(409)
    await ok({ method: 'POST', url: `/api/profiles/${kid.id}/select`, payload: {} })
    expect((await call({ method: 'POST', url: '/api/kid/attempts', payload: { worksheetId: created.data.id } })).statusCode).toBe(404)
  })

  it('giao → làm → nộp → chấm, cộng sao, làm lại chỉ cộng phần chênh lệch', async () => {
    const worksheetId = await publishedAndAssigned()

    let home = await ok<KidHome>({ method: 'GET', url: '/api/kid/home' })
    expect(home.today.map((a) => a.worksheet.id)).toEqual([worksheetId])
    expect(home.stars).toBe(0)

    const view = await ok<AttemptView>({ method: 'POST', url: '/api/kid/attempts', payload: { worksheetId } })
    expect(view.attemptNo).toBe(1)
    expect(JSON.stringify(view.items)).not.toContain('"answer"')
    expect(JSON.stringify(view.items)).not.toContain('"accept"')

    // Lần đầu: sai 2 câu đầu → (0.75 + 0 + 1 + 1) / 4 = 68.8% → 1 sao.
    const answers = answersFor(view, true)
    answers[0] = answersFor(view, false)[0]!
    answers[1] = answersFor(view, false)[1]!
    await ok({ method: 'PUT', url: `/api/kid/attempts/${view.id}/answers`, payload: { answers } })
    // Mở lại giữa chừng vẫn là lần làm đó, câu trả lời đã lưu.
    const resumed = await ok<AttemptView>({ method: 'POST', url: '/api/kid/attempts', payload: { worksheetId } })
    expect(resumed.id).toBe(view.id)
    expect(resumed.items[2]!.response).toEqual({ choice: 'a' })

    const first = await ok<AttemptView>({ method: 'POST', url: `/api/kid/attempts/${view.id}/submit` })
    expect(first.result).toMatchObject({ scorePct: 68.8, stars: 1, starsGained: 1 })
    expect(first.result!.items[1]).toMatchObject({ isCorrect: false, explanation: '97 lớn hơn 86' })
    // Nộp lại lần nữa không chấm/cộng sao lần hai.
    expect((await ok<AttemptView>({ method: 'POST', url: `/api/kid/attempts/${view.id}/submit` })).result!.starsGained).toBe(1)
    expect((await call({ method: 'PUT', url: `/api/kid/attempts/${view.id}/answers`, payload: { answers } })).statusCode).toBe(409)

    home = await ok<KidHome>({ method: 'GET', url: '/api/kid/home' })
    expect(home.today).toHaveLength(0)
    expect(home.stars).toBe(1)
    expect(home.library[0]).toMatchObject({ bestStars: 1, attempts: 1 })

    // Làm lại đúng hết: 3 sao, chỉ cộng thêm 2.
    const retry = await ok<AttemptView>({ method: 'POST', url: '/api/kid/attempts', payload: { worksheetId } })
    expect(retry.attemptNo).toBe(2)
    await ok({ method: 'PUT', url: `/api/kid/attempts/${retry.id}/answers`, payload: { answers: answersFor(retry, true) } })
    const second = await ok<AttemptView>({ method: 'POST', url: `/api/kid/attempts/${retry.id}/submit` })
    expect(second.result).toMatchObject({ scorePct: 100, stars: 3, starsGained: 2 })
    expect((await ok<KidHome>({ method: 'GET', url: '/api/kid/home' })).stars).toBe(3)

    // Lần ba lại sai: không cộng, không trừ.
    const third = await ok<AttemptView>({ method: 'POST', url: '/api/kid/attempts', payload: { worksheetId } })
    expect((await ok<AttemptView>({ method: 'POST', url: `/api/kid/attempts/${third.id}/submit` })).result!.starsGained).toBe(0)
    expect((await ok<KidHome>({ method: 'GET', url: '/api/kid/home' })).stars).toBe(3)
  })

  it('hết giờ: không lưu được nữa, server tự nộp với câu đã lưu trước hạn', async () => {
    const worksheetId = await publishedAndAssigned({ timeLimitSec: 60 })
    const view = await ok<AttemptView>({ method: 'POST', url: '/api/kid/attempts', payload: { worksheetId } })
    expect(new Date(view.deadlineAt!).getTime() - new Date(view.startedAt).getTime()).toBe(60_000)

    await ok({ method: 'PUT', url: `/api/kid/attempts/${view.id}/answers`, payload: { answers: answersFor(view, true).slice(0, 2) } })
    t.clock.advance(64_000) // còn trong 5 giây bù trễ
    await ok({ method: 'PUT', url: `/api/kid/attempts/${view.id}/answers`, payload: { answers: answersFor(view, true).slice(2, 3) } })
    t.clock.advance(2_000)
    const late = await call({ method: 'PUT', url: `/api/kid/attempts/${view.id}/answers`, payload: { answers: answersFor(view, true).slice(3) } })
    expect(late.statusCode).toBe(409)
    expect(late.json().error).toBe('time_up')

    const done = await ok<AttemptView>({ method: 'GET', url: `/api/kid/attempts/${view.id}` })
    expect(done.autoSubmitted).toBe(true)
    expect(done.submittedAt).toBe(view.deadlineAt)
    expect(done.result!.scorePct).toBe(75) // 3/4 câu kịp lưu
  })

  it('sửa bài sau khi bé đã làm: lịch sử giữ nguyên theo bản chụp', async () => {
    const worksheetId = await publishedAndAssigned()
    const view = await ok<AttemptView>({ method: 'POST', url: '/api/kid/attempts', payload: { worksheetId } })
    await ok({ method: 'PUT', url: `/api/kid/attempts/${view.id}/answers`, payload: { answers: answersFor(view, true) } })
    await ok({ method: 'POST', url: `/api/kid/attempts/${view.id}/submit` })

    await ok({ method: 'POST', url: '/api/parent/unlock', payload: { pin: TEST_PARENT.pin } })
    const edited = await callTool(token, 'update_worksheet', {
      id: worksheetId,
      title: 'Make Ten (A) – sửa',
      questions: [{ body: { type: 'true_false', prompt: { text: '1 + 1 = 2' }, answer: true } }],
    })
    expect(edited.isError, edited.text).toBe(false)

    const history = await ok<AttemptView>({ method: 'GET', url: `/api/parent/attempts/${view.id}` })
    expect(history.result!.items).toHaveLength(4)
    expect(history.result!.scorePct).toBe(100)
    const w = await ok<WorksheetDetail>({ method: 'GET', url: `/api/parent/worksheets/${worksheetId}` })
    expect(w.questions).toHaveLength(1)
  })

  it('bố cục lưới không nhận câu kéo thả khi sửa bài', async () => {
    const created = await callTool(token, 'create_worksheet', WORKSHEET)
    const r = await callTool(token, 'update_worksheet', {
      id: created.data.id,
      questions: [{ body: { type: 'clock_set', prompt: { text: 'Quay kim' }, answer: { h: 3, m: 0 }, hands: 'hour' } }],
    })
    expect(r.isError).toBe(true)
    expect(r.text).toContain('questions[0].body.type')
  })
})
