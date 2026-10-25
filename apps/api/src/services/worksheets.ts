import {
  WorksheetInput,
  type Catalog,
  type WorksheetDetail,
  type WorksheetPatch,
  type WorksheetStatus,
  type WorksheetSummary,
} from '@for-kids/shared'
import { and, asc, desc, eq, inArray, isNull, or, sql, type SQL } from 'drizzle-orm'
import type { Db } from '../db/client.js'
import { question, questionSkill, skill, subject, topic, worksheet } from '../db/schema.js'
import { HttpError } from '../http.js'

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
type DbOrTx = Db | Tx

const invalid = (path: string, message: string) => new HttpError(400, { error: 'invalid_input', issues: [{ path, message }] })

const visibleSubject = (familyId: string) => or(isNull(subject.familyId), eq(subject.familyId, familyId))

async function findSubject(db: DbOrTx, familyId: string, code: string) {
  const [s] = await db
    .select()
    .from(subject)
    .where(and(visibleSubject(familyId), eq(subject.code, code)))
  return s
}

async function ensureTopic(db: DbOrTx, familyId: string, subjectId: string, name: string, grade: number) {
  const [t] = await db
    .insert(topic)
    .values({ familyId, subjectId, name, gradeMin: grade, gradeMax: grade })
    .onConflictDoUpdate({ target: [topic.familyId, topic.subjectId, topic.name], set: { name } })
    .returning({ id: topic.id })
  return t!.id
}

/** JSON với khoá sắp xếp, để so sánh nội dung câu (jsonb của Postgres đổi thứ tự khoá). */
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`
  if (v && typeof v === 'object') {
    return `{${Object.keys(v)
      .sort()
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`)
      .join(',')}}`
  }
  return JSON.stringify(v)
}

/**
 * Ghi danh sách câu hỏi (đã validate) cho một bài. Khi sửa bài, câu có nội dung không đổi được giữ
 * nguyên id (chỉ cập nhật thứ tự, lời giải, điểm, kỹ năng), để hàng đợi ôn và lịch sử của bé không bị mất;
 * chỉ câu bị bỏ mới bị xoá.
 */
async function writeQuestions(tx: Tx, familyId: string, worksheetId: string, questions: WorksheetInput['questions']) {
  const codes = [...new Set(questions.flatMap((q) => q.skillCodes ?? []))]
  const skillRows = codes.length
    ? await tx
        .select({ id: skill.id, code: skill.code })
        .from(skill)
        .where(and(eq(skill.familyId, familyId), inArray(skill.code, codes)))
    : []
  const skillId = new Map(skillRows.map((s) => [s.code, s.id]))
  for (const [i, q] of questions.entries()) {
    for (const [j, code] of (q.skillCodes ?? []).entries()) {
      if (!skillId.has(code)) throw invalid(`questions.${i}.skillCodes.${j}`, `Chưa có kỹ năng "${code}" (tạo bằng upsert_skill)`)
    }
  }

  const existing = await tx.select({ id: question.id, body: question.body }).from(question).where(eq(question.worksheetId, worksheetId))
  const unmatched = new Map<string, string[]>()
  for (const e of existing) {
    const key = canonical(e.body)
    unmatched.set(key, [...(unmatched.get(key) ?? []), e.id])
  }

  for (const [i, q] of questions.entries()) {
    const fields = {
      sortOrder: i,
      explanation: q.explanation ?? null,
      points: q.body.type === 'info' ? 0 : (q.points ?? 1),
      ttsLang: q.ttsLang ?? null,
    }
    const reuse = unmatched.get(canonical(q.body))?.shift()
    let id: string
    if (reuse) {
      id = reuse
      await tx.update(question).set(fields).where(eq(question.id, id))
      await tx.delete(questionSkill).where(eq(questionSkill.questionId, id))
    } else {
      const [row] = await tx
        .insert(question)
        .values({ worksheetId, type: q.body.type, body: q.body, ...fields })
        .returning({ id: question.id })
      id = row!.id
    }
    const ids = [...new Set(q.skillCodes ?? [])].map((c) => skillId.get(c)!)
    if (ids.length) await tx.insert(questionSkill).values(ids.map((sid) => ({ questionId: id, skillId: sid })))
  }

  const removed = [...unmatched.values()].flat()
  if (removed.length) await tx.delete(question).where(inArray(question.id, removed))
}

export async function createWorksheet(
  db: Db,
  familyId: string,
  input: WorksheetInput,
  source: 'manual' | 'mcp',
  createdByTokenId: string | null = null,
): Promise<string> {
  return db.transaction(async (tx) => {
    const subj = await findSubject(tx, familyId, input.subjectCode)
    if (!subj) throw invalid('subjectCode', `Không có môn "${input.subjectCode}"`)
    const topicId = input.topic ? await ensureTopic(tx, familyId, subj.id, input.topic, input.grade) : null

    const [w] = await tx
      .insert(worksheet)
      .values({
        familyId,
        subjectId: subj.id,
        topicId,
        grade: input.grade,
        title: input.title,
        description: input.description ?? null,
        lang: input.lang ?? null,
        layout: input.layout,
        status: 'draft',
        source,
        sourceNote: input.sourceNote ?? null,
        timeLimitSec: input.timeLimitSec ?? null,
        createdByTokenId,
      })
      .returning({ id: worksheet.id })
    await writeQuestions(tx, familyId, w!.id, input.questions)
    return w!.id
  })
}

/**
 * Sửa thông tin chung và/hoặc thay toàn bộ câu hỏi. Bài đã có người làm vẫn sửa được:
 * lịch sử làm bài dùng question_snapshot nên không bị ảnh hưởng.
 */
export async function updateWorksheet(db: Db, familyId: string, id: string, patch: WorksheetPatch) {
  const current = await getWorksheetDetail(db, familyId, id)
  // Gộp rồi validate lại toàn bộ, để các ràng buộc liên trường (vd. bố cục lưới) vẫn được kiểm tra.
  const merged = WorksheetInput.safeParse({
    subjectCode: patch.subjectCode ?? current.subjectCode,
    grade: patch.grade ?? current.grade,
    topic: patch.topic !== undefined ? patch.topic : current.topic,
    title: patch.title ?? current.title,
    description: patch.description !== undefined ? patch.description : current.description,
    lang: patch.lang !== undefined ? patch.lang : current.lang,
    layout: patch.layout ?? current.layout,
    timeLimitSec: patch.timeLimitSec !== undefined ? patch.timeLimitSec : current.timeLimitSec,
    sourceNote: patch.sourceNote !== undefined ? patch.sourceNote : current.sourceNote,
    questions:
      patch.questions ??
      current.questions.map((q) => ({
        body: q.body,
        explanation: q.explanation ?? undefined,
        points: q.points,
        ttsLang: q.ttsLang ?? undefined,
        skillCodes: q.skillCodes,
      })),
  })
  if (!merged.success) {
    throw new HttpError(400, {
      error: 'invalid_input',
      issues: merged.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    })
  }
  const input = merged.data

  await db.transaction(async (tx) => {
    const subj = await findSubject(tx, familyId, input.subjectCode)
    if (!subj) throw invalid('subjectCode', `Không có môn "${input.subjectCode}"`)
    const topicId = input.topic ? await ensureTopic(tx, familyId, subj.id, input.topic, input.grade) : null
    await tx
      .update(worksheet)
      .set({
        subjectId: subj.id,
        topicId,
        grade: input.grade,
        title: input.title,
        description: input.description ?? null,
        lang: input.lang ?? null,
        layout: input.layout,
        timeLimitSec: input.timeLimitSec ?? null,
        sourceNote: input.sourceNote ?? null,
        updatedAt: new Date(),
      })
      .where(eq(worksheet.id, id))
    if (patch.questions) {
      await writeQuestions(tx, familyId, id, input.questions)
    }
  })
}

const questionCount = sql<number>`(select count(*)::int from ${question} where ${question.worksheetId} = ${worksheet.id})`

const summaryColumns = {
  id: worksheet.id,
  title: worksheet.title,
  subjectCode: subject.code,
  subjectName: subject.name,
  subjectTtsLang: subject.ttsLang,
  topic: topic.name,
  grade: worksheet.grade,
  status: worksheet.status,
  layout: worksheet.layout,
  timeLimitSec: worksheet.timeLimitSec,
  questionCount,
  source: worksheet.source,
  updatedAt: worksheet.updatedAt,
  publishedAt: worksheet.publishedAt,
  description: worksheet.description,
  lang: worksheet.lang,
  sourceNote: worksheet.sourceNote,
}

function summaryQuery(db: Db, where: SQL | undefined) {
  return db
    .select(summaryColumns)
    .from(worksheet)
    .innerJoin(subject, eq(subject.id, worksheet.subjectId))
    .leftJoin(topic, eq(topic.id, worksheet.topicId))
    .where(where)
    .$dynamic()
}

type SummaryRow = Awaited<ReturnType<typeof summaryQuery>>[number]

const toSummary = (r: SummaryRow): WorksheetSummary => ({
  id: r.id,
  title: r.title,
  subjectCode: r.subjectCode,
  subjectName: r.subjectName,
  topic: r.topic,
  grade: r.grade,
  status: r.status,
  layout: r.layout,
  timeLimitSec: r.timeLimitSec,
  questionCount: Number(r.questionCount),
  source: r.source,
  updatedAt: r.updatedAt.toISOString(),
  publishedAt: r.publishedAt?.toISOString() ?? null,
})

export async function listWorksheets(
  db: Db,
  familyId: string,
  filter: { status?: WorksheetStatus; subjectCode?: string; grade?: number } = {},
): Promise<WorksheetSummary[]> {
  const conds: SQL[] = [eq(worksheet.familyId, familyId)]
  if (filter.status) conds.push(eq(worksheet.status, filter.status))
  if (filter.subjectCode) conds.push(eq(subject.code, filter.subjectCode))
  if (filter.grade !== undefined) conds.push(eq(worksheet.grade, filter.grade))
  const rows = await summaryQuery(db, and(...conds)).orderBy(desc(worksheet.updatedAt))
  return rows.map(toSummary)
}

export async function getWorksheetDetail(db: Db, familyId: string, id: string): Promise<WorksheetDetail> {
  const [w] = await summaryQuery(db, and(eq(worksheet.familyId, familyId), eq(worksheet.id, id)))
  if (!w) throw new HttpError(404, { error: 'not_found' })

  const qs = await db.select().from(question).where(eq(question.worksheetId, id)).orderBy(asc(question.sortOrder))
  const skills = qs.length
    ? await db
        .select({ questionId: questionSkill.questionId, code: skill.code })
        .from(questionSkill)
        .innerJoin(skill, eq(skill.id, questionSkill.skillId))
        .where(
          inArray(
            questionSkill.questionId,
            qs.map((q) => q.id),
          ),
        )
    : []

  return {
    ...toSummary(w),
    description: w.description,
    lang: w.lang,
    sourceNote: w.sourceNote,
    ttsLang: w.lang ?? w.subjectTtsLang,
    questions: qs.map((q) => ({
      id: q.id,
      body: q.body,
      explanation: q.explanation,
      points: q.points,
      ttsLang: q.ttsLang,
      skillCodes: skills.filter((s) => s.questionId === q.id).map((s) => s.code),
    })),
  }
}

export async function setWorksheetStatus(db: Db, familyId: string, id: string, status: WorksheetStatus) {
  const [w] = await db
    .update(worksheet)
    .set({
      status,
      updatedAt: new Date(),
      ...(status === 'published' ? { publishedAt: new Date() } : {}),
    })
    .where(and(eq(worksheet.familyId, familyId), eq(worksheet.id, id)))
    .returning({ id: worksheet.id })
  if (!w) throw new HttpError(404, { error: 'not_found' })
}

// ---------- Catalog: môn, chủ đề, kỹ năng ----------

export async function getCatalog(db: Db, familyId: string): Promise<Catalog> {
  const subjects = await db
    .select({ id: subject.id, code: subject.code, name: subject.name, ttsLang: subject.ttsLang })
    .from(subject)
    .where(visibleSubject(familyId))
  const code = new Map(subjects.map((s) => [s.id, s.code]))
  const topics = await db.select().from(topic).where(eq(topic.familyId, familyId)).orderBy(asc(topic.sortOrder))
  const topicName = new Map(topics.map((t) => [t.id, t.name]))
  const skills = await db.select().from(skill).where(eq(skill.familyId, familyId)).orderBy(asc(skill.code))
  return {
    subjects: subjects.map(({ id: _id, ...s }) => s),
    topics: topics.map((t) => ({ subjectCode: code.get(t.subjectId)!, name: t.name, gradeMin: t.gradeMin, gradeMax: t.gradeMax })),
    skills: skills.map((s) => ({
      subjectCode: code.get(s.subjectId)!,
      code: s.code,
      name: s.name,
      topic: s.topicId ? (topicName.get(s.topicId) ?? null) : null,
    })),
  }
}

export async function upsertTopic(
  db: Db,
  familyId: string,
  input: { subjectCode: string; name: string; gradeMin: number; gradeMax: number },
) {
  const subj = await findSubject(db, familyId, input.subjectCode)
  if (!subj) throw invalid('subjectCode', `Không có môn "${input.subjectCode}"`)
  await db
    .insert(topic)
    .values({ familyId, subjectId: subj.id, name: input.name, gradeMin: input.gradeMin, gradeMax: input.gradeMax })
    .onConflictDoUpdate({
      target: [topic.familyId, topic.subjectId, topic.name],
      set: { gradeMin: input.gradeMin, gradeMax: input.gradeMax },
    })
}

export async function upsertSkill(
  db: Db,
  familyId: string,
  input: { subjectCode: string; code: string; name: string; topic?: string | null },
) {
  const subj = await findSubject(db, familyId, input.subjectCode)
  if (!subj) throw invalid('subjectCode', `Không có môn "${input.subjectCode}"`)
  let topicId: string | null = null
  if (input.topic) {
    const [t] = await db
      .select({ id: topic.id })
      .from(topic)
      .where(and(eq(topic.familyId, familyId), eq(topic.subjectId, subj.id), eq(topic.name, input.topic)))
    if (!t) throw invalid('topic', `Chưa có chủ đề "${input.topic}" (tạo bằng upsert_topic)`)
    topicId = t.id
  }
  await db
    .insert(skill)
    .values({ familyId, subjectId: subj.id, topicId, code: input.code, name: input.name })
    .onConflictDoUpdate({ target: [skill.familyId, skill.code], set: { name: input.name, topicId, subjectId: subj.id } })
}
