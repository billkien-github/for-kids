import type { Achievements, AttemptView, ChildReport, KidHome, Mistake, Profile, RewardView } from '@for-kids/shared'
import type { InjectOptions } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestApp, TEST_PARENT } from '../test-utils.js'

let t: Awaited<ReturnType<typeof createTestApp>>
let sid = ''
const call = (opts: InjectOptions) => t.app.inject({ ...opts, cookies: sid ? { sid } : {} })
const ok = async <T>(opts: InjectOptions, status = 200): Promise<T> => {
  const res = await call(opts)
  expect(res.statusCode, res.body).toBe(status)
  return res.json<T>()
}
const DAY = 24 * 3600 * 1000

// 4 câu, mỗi câu gắn một kỹ năng.
const WORKSHEET = {
  subjectCode: 'math',
  grade: 1,
  title: 'Ôn cộng trừ',
  questions: [
    { body: { type: 'split_strategy', op: '+', a: 7, b: 6 }, skillCodes: ['math.make10.add'] },
    { body: { type: 'true_false', prompt: { text: '10 − 4 = 5' }, answer: false }, skillCodes: ['math.sub.within10'] },
    { body: { type: 'number_input', prompt: { text: '3 + 6 = ?' }, answer: 9 }, skillCodes: ['math.add.within10'] },
    { body: { type: 'number_input', prompt: { text: '8 − 5 = ?' }, answer: 3 }, skillCodes: ['math.sub.within10'] },
  ],
}

let kid: Profile
let worksheetId: string

const unlock = () => ok({ method: 'POST', url: '/api/parent/unlock', payload: { pin: TEST_PARENT.pin } })
const selectKid = () => ok({ method: 'POST', url: `/api/profiles/${kid.id}/select`, payload: {} })

beforeEach(async () => {
  t = await createTestApp()
  const login = await t.app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: TEST_PARENT.email, password: TEST_PARENT.password } })
  sid = login.cookies.find((c) => c.name === 'sid')!.value
  await unlock()
  kid = await ok<Profile>({ method: 'POST', url: '/api/parent/children', payload: { name: 'An', avatar: '🦊', grade: 1 } }, 201)
  worksheetId = (await ok<{ id: string }>({ method: 'POST', url: '/api/parent/worksheets', payload: WORKSHEET }, 201)).id
  await ok({ method: 'POST', url: `/api/parent/worksheets/${worksheetId}/publish` })
  await selectKid()
})
afterEach(() => t.close())

/** Làm bài; `wrong` là chỉ số các câu trả lời sai. */
async function doWorksheet(wrong: number[]) {
  const view = await ok<AttemptView>({ method: 'POST', url: '/api/kid/attempts', payload: { worksheetId } })
  await submitWith(view, wrong)
  return view
}

async function submitWith(view: AttemptView, wrong: number[]) {
  const answers = view.items.map((item, i) => {
    const bad = wrong.includes(i)
    switch (item.body.type) {
      case 'split_strategy':
        return { itemId: item.id, response: { cells: bad ? ['7', '3', '3', '12'] : ['7', '3', '3', '13'] } }
      case 'true_false':
        return { itemId: item.id, response: { value: bad } }
      default: {
        const prompt = (item.body as { prompt: { text: string } }).prompt.text
        const right = prompt.startsWith('3 + 6') ? '9' : '3'
        return { itemId: item.id, response: { value: bad ? '0' : right } }
      }
    }
  })
  await ok({ method: 'PUT', url: `/api/kid/attempts/${view.id}/answers`, payload: { answers } })
  return ok<AttemptView>({ method: 'POST', url: `/api/kid/attempts/${view.id}/submit` })
}

describe('ôn câu sai (Leitner)', () => {
  it('câu sai vào hộp 1, hôm sau mới đến hạn; ôn đúng thì lên hộp và được +1 sao', async () => {
    await doWorksheet([1, 3]) // sai 2 câu
    let home = await ok<KidHome>({ method: 'GET', url: '/api/kid/home' })
    expect(home.reviewDue).toBe(0) // hạn là ngày mai
    expect((await call({ method: 'POST', url: '/api/kid/review' })).statusCode).toBe(409)

    t.clock.advance(DAY)
    home = await ok<KidHome>({ method: 'GET', url: '/api/kid/home' })
    expect(home.reviewDue).toBe(2)

    const review = await ok<AttemptView>({ method: 'POST', url: '/api/kid/review' })
    expect(review.kind).toBe('review')
    expect(review.items).toHaveLength(2)
    expect(review.deadlineAt).toBeNull()
    // Mở lại thì vẫn là phiên đó.
    expect((await ok<AttemptView>({ method: 'POST', url: '/api/kid/review' })).id).toBe(review.id)

    const before = (await ok<KidHome>({ method: 'GET', url: '/api/kid/home' })).stars
    // Trả lời đúng cả hai câu.
    const answers = review.items.map((item) =>
      item.body.type === 'true_false' ? { itemId: item.id, response: { value: false } } : { itemId: item.id, response: { value: '3' } },
    )
    await ok({ method: 'PUT', url: `/api/kid/attempts/${review.id}/answers`, payload: { answers } })
    const done = await ok<AttemptView>({ method: 'POST', url: `/api/kid/attempts/${review.id}/submit` })
    expect(done.result!.scorePct).toBe(100)
    expect(done.result!.starsGained).toBeGreaterThanOrEqual(1)
    home = await ok<KidHome>({ method: 'GET', url: '/api/kid/home' })
    expect(home.stars - before).toBe(done.result!.starsGained)
    expect(home.reviewDue).toBe(0) // hộp 2: ôn lại sau 1 ngày

    t.clock.advance(DAY)
    expect((await ok<KidHome>({ method: 'GET', url: '/api/kid/home' })).reviewDue).toBe(2)
  })

  it('sửa bài không làm mất hàng đợi ôn của câu không đổi', async () => {
    await doWorksheet([1, 3])
    t.clock.advance(DAY)
    expect((await ok<KidHome>({ method: 'GET', url: '/api/kid/home' })).reviewDue).toBe(2)

    await unlock()
    // Đổi tiêu đề, đảo thứ tự câu, thay câu 3 (không sai) bằng câu mới: 2 câu sai vẫn còn trong hàng đợi.
    const [q0, q1, , q3] = WORKSHEET.questions
    const newQ = { body: { type: 'true_false', prompt: { text: '2 + 2 = 4' }, answer: true } }
    await ok({ method: 'PUT', url: `/api/parent/worksheets/${worksheetId}`, payload: { title: 'Đã sửa', questions: [q3, q1, q0, newQ] } })
    await selectKid()
    expect((await ok<KidHome>({ method: 'GET', url: '/api/kid/home' })).reviewDue).toBe(2)

    // Bỏ hẳn một câu sai thì câu đó ra khỏi hàng đợi.
    await unlock()
    await ok({ method: 'PUT', url: `/api/parent/worksheets/${worksheetId}`, payload: { questions: [q0, q1, newQ] } })
    await selectKid()
    expect((await ok<KidHome>({ method: 'GET', url: '/api/kid/home' })).reviewDue).toBe(1)
  })

  it('bấm "Ôn tập" hai lần cùng lúc chỉ tạo một phiên', async () => {
    await doWorksheet([1, 3])
    t.clock.advance(DAY)
    const [a, b] = await Promise.all([
      ok<AttemptView>({ method: 'POST', url: '/api/kid/review' }),
      ok<AttemptView>({ method: 'POST', url: '/api/kid/review' }),
    ])
    expect(a.id).toBe(b.id)
  })

  it('làm lại bài mà vẫn sai thì câu đó về hộp 1', async () => {
    await doWorksheet([0])
    t.clock.advance(DAY)
    await doWorksheet([0])
    expect((await ok<KidHome>({ method: 'GET', url: '/api/kid/home' })).reviewDue).toBe(0)
    t.clock.advance(DAY)
    expect((await ok<KidHome>({ method: 'GET', url: '/api/kid/home' })).reviewDue).toBe(1)
  })
})

describe('mức thành thạo, streak, báo cáo', () => {
  it('mức thành thạo chỉ tính lần chính thức; báo cáo có kỹ năng yếu và câu sai', async () => {
    await doWorksheet([1, 3]) // sai cả 2 câu của math.sub.within10
    await doWorksheet([]) // làm lại đúng hết: không tính vào mức thành thạo

    await unlock()
    const report = await ok<ChildReport>({ method: 'GET', url: `/api/parent/children/${kid.id}/report` })
    const sub = report.skills.find((s) => s.code === 'math.sub.within10')!
    expect(sub).toMatchObject({ answered: 2, correct: 0, level: 'unrated' })
    expect(sub.mastery).toBeCloseTo(0.5 * 0.7 * 0.7, 2)
    expect(report.subjects).toEqual([{ subjectCode: 'math', subjectName: 'Toán', avgScorePct: 50, worksheets: 1 }])
    expect(report.recent).toHaveLength(2)

    const mistakes = await ok<Mistake[]>({ method: 'GET', url: `/api/parent/children/${kid.id}/mistakes` })
    expect(mistakes).toHaveLength(2)
    expect(mistakes[0]!.skillCodes).toEqual(['math.sub.within10'])
  })

  it('kỹ năng sai ≥ 5 lần thành "cần luyện"', async () => {
    // Mỗi phiên ôn trả lời sai cả 2 câu math.sub.within10.
    await doWorksheet([1, 3])
    for (let day = 0; day < 2; day++) {
      t.clock.advance(DAY)
      const review = await ok<AttemptView>({ method: 'POST', url: '/api/kid/review' })
      await submitWith(review, [0, 1])
    }
    await unlock()
    const report = await ok<ChildReport>({ method: 'GET', url: `/api/parent/children/${kid.id}/report` })
    expect(report.weakSkills.map((s) => s.code)).toEqual(['math.sub.within10'])
  })

  it('streak đếm ngày học liên tiếp tới hôm nay hoặc hôm qua', async () => {
    await doWorksheet([])
    t.clock.advance(DAY)
    await doWorksheet([])
    t.clock.advance(DAY)
    await doWorksheet([])
    expect((await ok<KidHome>({ method: 'GET', url: '/api/kid/home' })).streak).toBe(3)
    t.clock.advance(DAY)
    expect((await ok<KidHome>({ method: 'GET', url: '/api/kid/home' })).streak).toBe(3)
    t.clock.advance(DAY)
    expect((await ok<KidHome>({ method: 'GET', url: '/api/kid/home' })).streak).toBe(0)
  })
})

describe('quà và huy hiệu', () => {
  it('đổi quà: không vượt số sao (tính cả yêu cầu chờ duyệt); duyệt thì trừ sao, từ chối thì không', async () => {
    await unlock()
    const reward = await ok<RewardView>({ method: 'POST', url: '/api/parent/rewards', payload: { name: 'Kem', icon: '🍦', costStars: 3 } }, 201)
    await selectKid()

    await doWorksheet([]) // 3 sao + huy hiệu bài đầu tiên (+1) + điểm tuyệt đối (+1) = 5
    let ach = await ok<Achievements>({ method: 'GET', url: '/api/kid/achievements' })
    expect(ach.stars).toBe(5)
    expect(ach.badges.filter((b) => b.earnedAt).map((b) => b.code).sort()).toEqual(['first_worksheet', 'perfect_1'])
    expect(ach.history.map((h) => h.note)).toEqual(expect.arrayContaining(['Ôn cộng trừ', '🎉 Bài đầu tiên']))

    const first = await ok<{ id: string }>({ method: 'POST', url: `/api/kid/rewards/${reward.id}/redeem` }, 201)
    const second = await call({ method: 'POST', url: `/api/kid/rewards/${reward.id}/redeem` })
    expect(second.statusCode).toBe(409) // 5 − 3 đang chờ = 2 < 3
    ach = await ok<Achievements>({ method: 'GET', url: '/api/kid/achievements' })
    expect(ach).toMatchObject({ stars: 5, available: 2 })

    await unlock()
    await ok({ method: 'POST', url: `/api/parent/redemptions/${first.id}/approve` })
    expect((await call({ method: 'POST', url: `/api/parent/redemptions/${first.id}/reject` })).statusCode).toBe(409)
    await selectKid()
    ach = await ok<Achievements>({ method: 'GET', url: '/api/kid/achievements' })
    expect(ach).toMatchObject({ stars: 2, available: 2 })
    expect(ach.redemptions[0]!.status).toBe('approved')
  })

  it('bài chỉ có thẻ bài học: không có sao, không tính điểm tuyệt đối', async () => {
    await unlock()
    const info = (
      await ok<{ id: string }>(
        { method: 'POST', url: '/api/parent/worksheets', payload: { subjectCode: 'math', grade: 1, title: 'Số 2', questions: [{ body: { type: 'info', prompt: { text: 'Two' } } }] } },
        201,
      )
    ).id
    await ok({ method: 'POST', url: `/api/parent/worksheets/${info}/publish` })
    await selectKid()
    const view = await ok<AttemptView>({ method: 'POST', url: '/api/kid/attempts', payload: { worksheetId: info } })
    const done = await ok<AttemptView>({ method: 'POST', url: `/api/kid/attempts/${view.id}/submit` })
    expect(done.result!.stars).toBe(0)
    expect(done.result!.newBadges.map((b) => b.code)).toEqual(['first_worksheet'])
  })

  it('mở cùng một bài hai lần cùng lúc chỉ tạo một lần làm', async () => {
    const [a, b] = await Promise.all([
      ok<AttemptView>({ method: 'POST', url: '/api/kid/attempts', payload: { worksheetId } }),
      ok<AttemptView>({ method: 'POST', url: '/api/kid/attempts', payload: { worksheetId } }),
    ])
    expect(a.id).toBe(b.id)
  })

  it('đổi quà song song không vượt số dư', async () => {
    await unlock()
    const reward = await ok<RewardView>({ method: 'POST', url: '/api/parent/rewards', payload: { name: 'Sticker', icon: '⭐', costStars: 2 } }, 201)
    await selectKid()
    await doWorksheet([]) // 5 sao
    const results = await Promise.all(Array.from({ length: 5 }, () => call({ method: 'POST', url: `/api/kid/rewards/${reward.id}/redeem` })))
    expect(results.filter((r) => r.statusCode === 201)).toHaveLength(2)
  })
})

describe('cài đặt', () => {
  it('ngưỡng sao phải tăng dần và được dùng khi chấm', async () => {
    await unlock()
    expect((await call({ method: 'PUT', url: '/api/parent/settings/star-thresholds', payload: { thresholds: [80, 70, 90] } })).statusCode).toBe(400)
    await ok({ method: 'PUT', url: '/api/parent/settings/star-thresholds', payload: { thresholds: [40, 60, 75] } })
    await selectKid()
    const view = await doWorksheet([3]) // 3/4 = 75% → 3 sao theo ngưỡng mới
    const result = await ok<AttemptView>({ method: 'GET', url: `/api/kid/attempts/${view.id}` })
    expect(result.result!.stars).toBe(3)
  })

  it('đổi PIN và mật khẩu cần đúng giá trị hiện tại', async () => {
    await unlock()
    expect((await call({ method: 'PUT', url: '/api/parent/settings/pin', payload: { currentPin: '0000', newPin: '5678' } })).statusCode).toBe(401)
    await ok({ method: 'PUT', url: '/api/parent/settings/pin', payload: { currentPin: TEST_PARENT.pin, newPin: '5678' } })
    expect((await call({ method: 'POST', url: '/api/parent/unlock', payload: { pin: '5678' } })).statusCode).toBe(200)

    await ok({ method: 'PUT', url: '/api/parent/settings/password', payload: { currentPassword: TEST_PARENT.password, newPassword: 'mat-khau-moi' } })
    const relogin = await t.app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: TEST_PARENT.email, password: 'mat-khau-moi' } })
    expect(relogin.statusCode).toBe(200)
  })
})
