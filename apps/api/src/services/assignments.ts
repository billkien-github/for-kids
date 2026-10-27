import type { AssignInput, AssignmentView } from '@for-kids/shared'
import { and, asc, eq, inArray, isNotNull, isNull, sql, type SQL } from 'drizzle-orm'
import type { Db } from '../db/client.js'
import { assignment, attempt, child, subject, worksheet } from '../db/schema.js'
import { HttpError } from '../http.js'
import { questionCount } from './worksheets.js'

/** `now` lấy từ đồng hồ của app (deps.clock), cùng nguồn với giờ nộp bài khi so "đã làm sau khi giao chưa". */
export async function assignWorksheet(db: Db, familyId: string, input: AssignInput, by: 'parent' | 'token', now: Date) {
  const [w] = await db
    .select({ status: worksheet.status })
    .from(worksheet)
    .where(and(eq(worksheet.familyId, familyId), eq(worksheet.id, input.worksheetId)))
  if (!w) throw new HttpError(404, { error: 'not_found', message: 'Không có bài này' })
  if (w.status !== 'published') throw new HttpError(409, { error: 'not_published', message: 'Bài này chưa mở cho con. Bấm "Mở cho con làm" trước rồi giao nhé' })

  const childIds = [...new Set(input.childIds)]
  const kids = await db
    .select({ id: child.id })
    .from(child)
    .where(and(eq(child.familyId, familyId), isNull(child.archivedAt), inArray(child.id, childIds)))
  if (kids.length !== childIds.length) throw new HttpError(404, { error: 'not_found', message: 'Có bé không thuộc gia đình' })

  const rows = await db
    .insert(assignment)
    .values(
      childIds.map((childId) => ({
        worksheetId: input.worksheetId,
        childId,
        assignedBy: by,
        dueAt: input.dueAt ? new Date(input.dueAt) : null,
        createdAt: now,
      })),
    )
    .returning({ id: assignment.id })
  return rows.map((r) => r.id)
}

export async function cancelAssignment(db: Db, familyId: string, id: string) {
  const [a] = await db
    .select({ id: assignment.id })
    .from(assignment)
    .innerJoin(child, eq(child.id, assignment.childId))
    .where(and(eq(assignment.id, id), eq(child.familyId, familyId)))
  if (!a) throw new HttpError(404, { error: 'not_found' })
  await db.update(assignment).set({ cancelledAt: new Date() }).where(eq(assignment.id, id))
}

/**
 * Danh sách bài được giao (chưa huỷ). Bài coi là đã làm khi bé nộp bộ bài đó
 * (kể cả mở từ thư viện) sau thời điểm được giao.
 */
export async function listAssignments(
  db: Db,
  familyId: string,
  opts: { childId?: string; pendingOnly?: boolean; now: Date },
): Promise<AssignmentView[]> {
  const conds: SQL[] = [eq(child.familyId, familyId), isNull(assignment.cancelledAt), isNull(child.archivedAt)]
  if (opts.childId) conds.push(eq(assignment.childId, opts.childId))
  if (opts.pendingOnly) conds.push(eq(worksheet.status, 'published'))

  const rows = await db
    .select({
      id: assignment.id,
      dueAt: assignment.dueAt,
      createdAt: assignment.createdAt,
      childId: child.id,
      childName: child.name,
      childAvatar: child.avatar,
      worksheetId: worksheet.id,
      title: worksheet.title,
      timeLimitSec: worksheet.timeLimitSec,
      subjectCode: subject.code,
      subjectName: subject.name,
      questionCount,
    })
    .from(assignment)
    .innerJoin(child, eq(child.id, assignment.childId))
    .innerJoin(worksheet, eq(worksheet.id, assignment.worksheetId))
    .innerJoin(subject, eq(subject.id, worksheet.subjectId))
    .where(and(...conds))
    .orderBy(sql`${assignment.dueAt} asc nulls last`, asc(assignment.createdAt))
  if (rows.length === 0) return []

  const submitted = await db
    .select({
      childId: attempt.childId,
      worksheetId: attempt.worksheetId,
      submittedAt: attempt.submittedAt,
      scorePct: attempt.scorePct,
      stars: attempt.stars,
    })
    .from(attempt)
    .where(
      and(
        isNotNull(attempt.submittedAt),
        eq(attempt.kind, 'normal'),
        inArray(attempt.childId, [...new Set(rows.map((r) => r.childId))]),
        inArray(attempt.worksheetId, [...new Set(rows.map((r) => r.worksheetId))]),
      ),
    )
    .orderBy(asc(attempt.submittedAt))

  const views = rows.map((r): AssignmentView => {
    const done = submitted.find((s) => s.childId === r.childId && s.worksheetId === r.worksheetId && s.submittedAt! >= r.createdAt)
    return {
      id: r.id,
      worksheet: {
        id: r.worksheetId,
        title: r.title,
        subjectCode: r.subjectCode,
        subjectName: r.subjectName,
        questionCount: Number(r.questionCount),
        timeLimitSec: r.timeLimitSec,
      },
      child: { id: r.childId, name: r.childName, avatar: r.childAvatar },
      dueAt: r.dueAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      overdue: !done && r.dueAt !== null && r.dueAt < opts.now,
      completedAt: done?.submittedAt?.toISOString() ?? null,
      scorePct: done?.scorePct ?? null,
      stars: done?.stars ?? null,
    }
  })
  return opts.pendingOnly ? views.filter((v) => v.completedAt === null) : views
}
