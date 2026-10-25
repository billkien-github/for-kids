import { SaveAnswersInput, StartAttemptInput, type KidHome, type LibraryItem } from '@for-kids/shared'
import { and, desc, eq, sql } from 'drizzle-orm'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { requireKid, requireSession } from '../auth/session.js'
import { findActiveChild } from '../db/children.js'
import { question, starLedger, subject, topic, worksheet } from '../db/schema.js'
import type { Deps } from '../deps.js'
import { idParam, parse } from '../http.js'
import { listAssignments } from '../services/assignments.js'
import { bestByWorksheet, getAttemptView, saveAnswers, startAttempt, submitAttempt } from '../services/attempts.js'

/** API của bé (§7): mọi thứ giới hạn trong bé đang được chọn. */
export function kidRoutes(app: FastifyInstance, deps: Deps) {
  const { db } = deps
  const preHandler = requireKid(deps)
  const kid = (req: FastifyRequest) => {
    const auth = requireSession(req)
    return { familyId: auth.familyId, childId: auth.activeChildId! }
  }

  app.get('/api/kid/home', { preHandler }, async (req): Promise<KidHome> => {
    const { familyId, childId } = kid(req)
    const c = (await findActiveChild(db, familyId, childId))!

    const [balance] = await db
      .select({ stars: sql<number>`coalesce(sum(${starLedger.delta}), 0)::int` })
      .from(starLedger)
      .where(eq(starLedger.childId, childId))

    const published = await db
      .select({
        id: worksheet.id,
        title: worksheet.title,
        subjectCode: subject.code,
        subjectName: subject.name,
        topic: topic.name,
        grade: worksheet.grade,
        timeLimitSec: worksheet.timeLimitSec,
        questionCount: sql<number>`(select count(*)::int from ${question} where ${question.worksheetId} = ${worksheet.id})`,
      })
      .from(worksheet)
      .innerJoin(subject, eq(subject.id, worksheet.subjectId))
      .leftJoin(topic, eq(topic.id, worksheet.topicId))
      .where(and(eq(worksheet.familyId, familyId), eq(worksheet.status, 'published')))
      .orderBy(desc(worksheet.publishedAt))
    const best = await bestByWorksheet(
      deps,
      childId,
      published.map((w) => w.id),
    )

    return {
      child: { id: c.id, name: c.name, avatar: c.avatar, grade: c.grade },
      stars: Number(balance?.stars ?? 0),
      today: await listAssignments(db, familyId, { childId, pendingOnly: true, now: deps.clock() }),
      library: published.map(
        (w): LibraryItem => ({
          ...w,
          questionCount: Number(w.questionCount),
          bestScorePct: best.get(w.id)?.bestScorePct ?? null,
          bestStars: best.get(w.id)?.bestStars ?? null,
          attempts: best.get(w.id)?.attempts ?? 0,
        }),
      ),
    }
  })

  app.post('/api/kid/attempts', { preHandler }, async (req) => {
    const { familyId, childId } = kid(req)
    return startAttempt(deps, familyId, childId, parse(StartAttemptInput, req.body))
  })

  app.get<{ Params: { id: string } }>('/api/kid/attempts/:id', { preHandler }, async (req) => {
    return getAttemptView(deps, kid(req).childId, idParam(req.params.id))
  })

  app.put<{ Params: { id: string } }>('/api/kid/attempts/:id/answers', { preHandler }, async (req) => {
    await saveAnswers(deps, kid(req).childId, idParam(req.params.id), parse(SaveAnswersInput, req.body))
    return { ok: true }
  })

  app.post<{ Params: { id: string } }>('/api/kid/attempts/:id/submit', { preHandler }, async (req) => {
    return submitAttempt(deps, kid(req).childId, idParam(req.params.id))
  })
}
