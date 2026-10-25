import type { Me, Profile } from '@for-kids/shared'
import type { InjectOptions } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestApp, TEST_PARENT } from '../test-utils.js'

type T = Awaited<ReturnType<typeof createTestApp>>
let t: T
let sid: string

const call = (opts: InjectOptions) => t.app.inject({ ...opts, cookies: sid ? { sid } : {} })

async function login(password = TEST_PARENT.password, remoteAddress = '10.0.0.1') {
  const res = await t.app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: 'PARENT@example.com', password },
    remoteAddress,
  })
  const cookie = res.cookies.find((c) => c.name === 'sid')
  if (cookie) sid = cookie.value
  return res
}

const unlock = (pin = TEST_PARENT.pin) => call({ method: 'POST', url: '/api/parent/unlock', payload: { pin } })

async function addChild(body: Record<string, unknown>) {
  const res = await call({ method: 'POST', url: '/api/parent/children', payload: { avatar: '🦊', grade: 1, ...body } })
  expect(res.statusCode).toBe(201)
  return res.json<Profile>()
}

beforeEach(async () => {
  t = await createTestApp()
  sid = ''
})
afterEach(() => t.close())

describe('đăng nhập', () => {
  it('sai mật khẩu → 401; đúng → cookie httpOnly sống 90 ngày', async () => {
    expect((await login('sai')).statusCode).toBe(401)
    const res = await login()
    expect(res.statusCode).toBe(200)
    const cookie = res.cookies.find((c) => c.name === 'sid')!
    expect(cookie.httpOnly).toBe(true)
    expect(cookie.sameSite).toBe('Lax')
    expect((cookie.expires as Date).getTime() - t.clock.now().getTime()).toBe(90 * 24 * 3600 * 1000)
  })

  it('cookie secure khi vào qua https (ngrok), không secure khi vào bằng http trong LAN', async () => {
    const loginVia = (proto?: string) =>
      t.app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: TEST_PARENT.email, password: TEST_PARENT.password },
        headers: proto ? { 'x-forwarded-proto': proto } : {},
      })
    const viaNgrok = (await loginVia('https')).cookies.find((c) => c.name === 'sid')!
    const viaLan = (await loginVia()).cookies.find((c) => c.name === 'sid')!
    expect(viaNgrok.secure).toBe(true)
    expect(viaLan.secure).toBeFalsy()
  })

  it('chặn sau 5 lần sai trong 5 phút, kể cả khi lần sau nhập đúng', async () => {
    for (let i = 0; i < 5; i++) expect((await login('sai')).statusCode).toBe(401)
    const blocked = await login()
    expect(blocked.statusCode).toBe(429)
    expect(blocked.headers['retry-after']).toBe('300')

    t.clock.advance(5 * 60 * 1000 + 1)
    expect((await login()).statusCode).toBe(200)
  })

  it('người khác thử sai không khoá được phụ huynh ở máy khác', async () => {
    for (let i = 0; i < 5; i++) expect((await login('sai', '203.0.113.9')).statusCode).toBe(401)
    expect((await login('sai', '203.0.113.9')).statusCode).toBe(429)
    expect((await login(TEST_PARENT.password, '10.0.0.1')).statusCode).toBe(200)
  })

  it('không giả IP được bằng X-Forwarded-For tự gửi', async () => {
    const viaProxy = (spoofed: string) =>
      t.app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: TEST_PARENT.email, password: 'sai' },
        remoteAddress: '172.18.0.5', // ngrok
        headers: { 'x-forwarded-for': `${spoofed}, 198.51.100.7` }, // ngrok ghi IP thật ở cuối
      })
    for (let i = 0; i < 5; i++) expect((await viaProxy(`1.1.1.${i}`)).statusCode).toBe(401)
    expect((await viaProxy('1.1.1.99')).statusCode).toBe(429)
  })

  it('gửi song song nhiều lần cũng chỉ được thử 5 lần', async () => {
    const results = await Promise.all(Array.from({ length: 12 }, () => login('sai')))
    const codes = results.map((r) => r.statusCode)
    expect(codes.filter((c) => c === 401)).toHaveLength(5)
    expect(codes.filter((c) => c === 429)).toHaveLength(7)
  })

  it('/me cần đăng nhập; logout xoá phiên', async () => {
    expect((await call({ method: 'GET', url: '/api/auth/me' })).statusCode).toBe(401)
    await login()
    const me = await call({ method: 'GET', url: '/api/auth/me' })
    expect(me.json<Me>()).toMatchObject({ parent: { email: TEST_PARENT.email }, family: { name: 'Nhà test' }, activeChild: null })

    await call({ method: 'POST', url: '/api/auth/logout' })
    expect((await call({ method: 'GET', url: '/api/auth/me' })).statusCode).toBe(401)
  })

  it('phiên hết hạn sau 90 ngày không dùng', async () => {
    await login()
    t.clock.advance(91 * 24 * 3600 * 1000)
    expect((await call({ method: 'GET', url: '/api/auth/me' })).statusCode).toBe(401)
  })

  it('phiên được gia hạn khi còn dưới 30 ngày', async () => {
    await login()
    t.clock.advance(70 * 24 * 3600 * 1000)
    const res = await call({ method: 'GET', url: '/api/auth/me' })
    expect(res.statusCode).toBe(200)
    const renewed = res.cookies.find((c) => c.name === 'sid')!
    expect((renewed.expires as Date).getTime() - t.clock.now().getTime()).toBe(90 * 24 * 3600 * 1000)
    t.clock.advance(60 * 24 * 3600 * 1000)
    expect((await call({ method: 'GET', url: '/api/auth/me' })).statusCode).toBe(200)
  })
})

describe('khu phụ huynh', () => {
  beforeEach(() => login())

  it('bị khoá khi chưa nhập PIN; mở khoá 15 phút, mỗi lần gọi được gia hạn', async () => {
    expect((await call({ method: 'GET', url: '/api/parent/children' })).statusCode).toBe(403)
    expect((await unlock('0000')).statusCode).toBe(401)
    expect((await unlock()).statusCode).toBe(200)

    t.clock.advance(14 * 60 * 1000)
    expect((await call({ method: 'GET', url: '/api/parent/children' })).statusCode).toBe(200)
    t.clock.advance(14 * 60 * 1000) // vẫn còn hạn nhờ được gia hạn ở lần gọi trước
    expect((await call({ method: 'GET', url: '/api/parent/children' })).statusCode).toBe(200)
    t.clock.advance(16 * 60 * 1000)
    expect((await call({ method: 'GET', url: '/api/parent/children' })).statusCode).toBe(403)
  })

  it('nút khoá', async () => {
    await unlock()
    await call({ method: 'POST', url: '/api/parent/lock' })
    expect((await call({ method: 'GET', url: '/api/parent/children' })).statusCode).toBe(403)
  })

  it('PIN phụ huynh sai 5 lần thì bị chặn', async () => {
    for (let i = 0; i < 5; i++) expect((await unlock('0000')).statusCode).toBe(401)
    expect((await unlock()).statusCode).toBe(429)
  })

  it('đoán PIN song song cũng chỉ được 5 lần', async () => {
    const pins = Array.from({ length: 20 }, (_, i) => String(i).padStart(4, '0'))
    const codes = (await Promise.all(pins.map((p) => unlock(p)))).map((r) => r.statusCode)
    expect(codes.filter((c) => c === 401)).toHaveLength(5)
    expect(codes.filter((c) => c === 429)).toHaveLength(15)
  })

  it('thêm, sửa, đặt/bỏ PIN, lưu trữ hồ sơ bé', async () => {
    await unlock()
    const an = await addChild({ name: 'An', grade: 0 })
    const binh = await addChild({ name: 'Bình', pin: '2468' })
    expect(an).toMatchObject({ name: 'An', grade: 0, hasPin: false })
    expect(binh.hasPin).toBe(true)

    const bad = await call({ method: 'POST', url: '/api/parent/children', payload: { name: '', avatar: '👽', grade: 99 } })
    expect(bad.statusCode).toBe(400)
    expect(bad.json().issues.map((i: { path: string }) => i.path).sort()).toEqual(['avatar', 'grade', 'name'])

    // Không gửi pin → giữ nguyên; pin: null → bỏ PIN.
    const kept = await call({ method: 'PUT', url: `/api/parent/children/${binh.id}`, payload: { name: 'Bình', avatar: '🐼', grade: 2 } })
    expect(kept.json()).toMatchObject({ avatar: '🐼', grade: 2, hasPin: true })
    const cleared = await call({ method: 'PUT', url: `/api/parent/children/${binh.id}`, payload: { name: 'Bình', avatar: '🐼', grade: 2, pin: null } })
    expect(cleared.json().hasPin).toBe(false)

    expect((await call({ method: 'DELETE', url: `/api/parent/children/${an.id}` })).statusCode).toBe(200)
    const list = await call({ method: 'GET', url: '/api/profiles' })
    expect(list.json<Profile[]>().map((p) => p.name)).toEqual(['Bình'])
    expect((await call({ method: 'PUT', url: '/api/parent/children/khong-phai-uuid', payload: {} })).statusCode).toBe(404)
  })
})

describe('chọn profile', () => {
  let an: Profile
  let binh: Profile

  beforeEach(async () => {
    await login()
    await unlock()
    an = await addChild({ name: 'An' })
    binh = await addChild({ name: 'Bình', pin: '2468' })
  })

  const select = (id: string, pin?: string) =>
    call({ method: 'POST', url: `/api/profiles/${id}/select`, payload: pin ? { pin } : {} })

  it('sắp xếp thứ tự các bé, áp dụng cho mọi danh sách; bé mới đứng cuối', async () => {
    const names = async (url: string) => (await call({ method: 'GET', url })).json<Profile[]>().map((p) => p.name)
    const order = (ids: string[]) => call({ method: 'PUT', url: '/api/parent/children/order', payload: { ids } })

    expect((await order([binh.id, an.id])).statusCode).toBe(200)
    expect(await names('/api/parent/children')).toEqual(['Bình', 'An'])
    expect(await names('/api/profiles')).toEqual(['Bình', 'An'])

    await addChild({ name: 'Chi' })
    expect(await names('/api/profiles')).toEqual(['Bình', 'An', 'Chi'])

    // Thiếu bé, trùng bé → 409, thứ tự giữ nguyên.
    expect((await order([an.id, binh.id])).statusCode).toBe(409)
    expect((await order([an.id, an.id, binh.id])).statusCode).toBe(409)
    expect(await names('/api/profiles')).toEqual(['Bình', 'An', 'Chi'])
  })

  it('bé không có PIN chọn được ngay; chọn bé thì khu phụ huynh bị khoá', async () => {
    expect((await select(an.id)).statusCode).toBe(200)
    const me = (await call({ method: 'GET', url: '/api/auth/me' })).json<Me>()
    expect(me.activeChild?.name).toBe('An')
    expect(me.parentUnlockedUntil).toBeNull()
    expect((await call({ method: 'GET', url: '/api/parent/children' })).statusCode).toBe(403)
  })

  it('bé có PIN: thiếu/sai PIN → 401, sai 5 lần → 429 riêng cho bé đó', async () => {
    expect((await select(binh.id)).statusCode).toBe(401)
    for (let i = 0; i < 4; i++) expect((await select(binh.id, '1111')).statusCode).toBe(401)
    expect((await select(binh.id, '2468')).statusCode).toBe(429)
    expect((await select(an.id)).statusCode).toBe(200)

    t.clock.advance(5 * 60 * 1000 + 1)
    expect((await select(binh.id, '2468')).statusCode).toBe(200)
  })

  it('không chọn được bé của gia đình khác hoặc id lạ', async () => {
    expect((await select('00000000-0000-0000-0000-000000000000')).statusCode).toBe(404)
    expect((await select('abc')).statusCode).toBe(404)
  })

  it('bé bị lưu trữ thì không còn là bé đang chọn', async () => {
    await select(an.id)
    await unlock()
    await call({ method: 'DELETE', url: `/api/parent/children/${an.id}` })
    const me = (await call({ method: 'GET', url: '/api/auth/me' })).json<Me>()
    expect(me.activeChild).toBeNull()
  })
})
