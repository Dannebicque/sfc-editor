import { randomBytes } from 'node:crypto';
import { exportNative, importNative } from '@grafcet/io';
import { z } from 'zod';
import { tx, type Db } from './db';
import { compose, type Mailer } from './mailer';

/**
 * Espaces de classe (ADR 0006) : classes, élèves, sujets, copies et commentaires.
 * Les copies d'élèves sont des projets ordinaires (`projects` / `members`) : tout le reste (rôles, co-édition) est réutilisé.
 */

const DAY = 86_400_000, HOUR = 3_600_000;
const rid = (n = 16): string => randomBytes(n).toString('base64url');
export const ID_RE = /^[A-Za-z0-9_-]{22}$/;
export const ACTIVATION_TTL = 14 * DAY;
export const LIMITS = { classesPerTeacher: 30, studentsPerClass: 200, importRows: 100, assignmentsPerClass: 50 } as const;

const email = z.string().trim().max(254).transform((s) => s.toLowerCase()).pipe(z.string().regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/));
const name = z.string().trim().min(1).max(80).refine((s) => !/[\p{Cc}]/u.test(s));
const title = z.string().trim().min(1).max(120).refine((s) => !/[\p{Cc}]/u.test(s));
const text = (max: number) => z.string().max(max).refine((s) => !/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(s));
const due = z.string().max(40).refine((s) => !Number.isNaN(Date.parse(s))).nullable();
const S = {
  cls: z.object({ name: title }),
  patchCls: z.object({ name: title }),
  students: z.object({ students: z.array(z.object({ name, email })).min(1).max(LIMITS.importRows), locale: z.enum(['fr', 'en']).optional() }),
  assignment: z.object({ title, instructions: text(4000).optional(), dueAt: due.optional(), projectId: z.string().max(40).optional(), document: z.unknown().optional() }),
  patchAssignment: z.object({ title: title.optional(), instructions: text(4000).optional(), dueAt: due.optional() }),
  submit: z.object({ submitted: z.boolean() }),
  access: z.object({ role: z.enum(['viewer', 'editor']) }),
  comment: z.object({ body: z.string().trim().min(1).max(2000).refine((s) => !/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(s)) }),
};

export interface Kit {
  u: { id: string; email: string; name: string; locale: string; emailVerified: boolean };
  method: string;
  /** Segments de chemin après `/api` (ex. `['classes', id, 'students']`). */
  seg: string[];
  ip: string;
  send(status: number, body?: unknown): Response;
  fail(status: number, error: string): Response;
  body(schema: z.ZodType, max?: number): Promise<{ ok: true; data: any } | { ok: false; res: Response }>;
  /** Limitation de débit : vrai si la limite est atteinte. */
  limited(key: string, max: number, windowMs: number): boolean;
}

export interface ClassesDeps {
  db: Db;
  mailer: Mailer;
  base: string;
  now: () => number;
  maxProjectBytes: number;
  /** Créer une classe exige l'offre `teacher` (COLLAB_REQUIRES_PLAN=1). */
  requiresPlan: boolean;
  /** Jeton d'activation (mot de passe à choisir) pour un compte créé par un·e enseignant·e. */
  activationToken(userId: string, ttlMs: number): string;
}

type Row = Record<string, any>;
const iso = (t: number | null | undefined): string | null => (t === null || t === undefined ? null : new Date(t).toISOString());

export function createClasses(d: ClassesDeps): (kit: Kit) => Promise<Response | null> {
  const { db, mailer, base, now } = d;
  const get = (sql: string, ...p: any[]): Row | undefined => db.prepare(sql).get(...p) as Row | undefined;
  const all = (sql: string, ...p: any[]): Row[] => db.prepare(sql).all(...p) as Row[];
  const run = (sql: string, ...p: any[]): void => { db.prepare(sql).run(...p); };

  /** Copie du sujet pour un·e élève (projet ordinaire dont l'élève est propriétaire). */
  function makeCopy(a: Row, studentId: string): void {
    if (get('SELECT 1 AS x FROM submissions WHERE assignment_id = ? AND student_id = ?', a.id, studentId)) return;
    const pid = rid(), t = now();
    run('INSERT INTO projects (id,owner_id,name,created_at,updated_at,snapshot) VALUES (?,?,?,?,?,?)', pid, studentId, a.title, t, t, a.template);
    run("INSERT INTO members (project_id,user_id,role,created_at) VALUES (?,?,'owner',?)", pid, studentId, t);
    run("INSERT INTO submissions (assignment_id,student_id,project_id,status) VALUES (?,?,?,'todo')", a.id, studentId, pid);
  }
  /** Inscrit un compte dans la classe et lui crée une copie de chaque sujet déjà publié. */
  function enrol(classId: string, userId: string): void {
    run('INSERT OR IGNORE INTO class_students (class_id,user_id,joined_at) VALUES (?,?,?)', classId, userId, now());
    for (const a of all('SELECT * FROM assignments WHERE class_id = ?', classId)) makeCopy(a, userId);
  }
  /** Retire à l'enseignant·e l'accès aux copies visées (les copies restent aux élèves) puis supprime les lignes de rendu. */
  function release(classId: string, studentId?: string): void {
    const teacher = get('SELECT teacher_id FROM classes WHERE id = ?', classId)?.teacher_id;
    const where = `assignment_id IN (SELECT id FROM assignments WHERE class_id = ?)${studentId ? ' AND student_id = ?' : ''}`;
    const args = studentId ? [classId, studentId] : [classId];
    run(`DELETE FROM members WHERE user_id = ? AND role <> 'owner' AND project_id IN (SELECT project_id FROM submissions WHERE ${where})`, teacher, ...args);
    if (studentId) run(`DELETE FROM submissions WHERE ${where}`, ...args);
  }

  return async (k) => {
    const { u, method, seg, send, fail } = k;

    // ───────────── invitations de classe reçues (comptes déjà existants) ─────────────
    if (seg[0] === 'class-invitations' && seg[1] && !seg[2]) {
      const inv = get('SELECT * FROM class_invites WHERE id = ?', seg[1]);
      if (!inv || inv.email !== u.email || inv.expires_at <= now()) return fail(404, 'not_found');
      if (method === 'DELETE') { run('DELETE FROM class_invites WHERE id = ?', inv.id); return send(204); }
      if (method !== 'POST') return fail(405, 'method');
      if (!u.emailVerified) return fail(403, 'email_not_verified');
      tx(db, () => { enrol(inv.class_id, u.id); run('DELETE FROM class_invites WHERE id = ?', inv.id); });
      return send(200, { classId: inv.class_id });
    }
    if (seg[0] !== 'classes') return null;

    const teacherPlanOk = (): boolean => !d.requiresPlan || get('SELECT plan FROM users WHERE id = ?', u.id)?.plan === 'teacher';

    // ───────────── liste et création ─────────────
    if (!seg[1]) {
      if (method === 'GET') {
        const teaching = all('SELECT id, name, created_at FROM classes WHERE teacher_id = ? ORDER BY created_at DESC', u.id).map((c) => ({
          id: c.id, name: c.name,
          students: get('SELECT COUNT(*) AS n FROM class_students WHERE class_id = ?', c.id)!.n,
          assignments: get('SELECT COUNT(*) AS n FROM assignments WHERE class_id = ?', c.id)!.n,
        }));
        const enrolled = all('SELECT c.id, c.name, t.name AS teacher FROM class_students s JOIN classes c ON c.id = s.class_id JOIN users t ON t.id = c.teacher_id WHERE s.user_id = ? ORDER BY c.name', u.id)
          .map((c) => ({ id: c.id, name: c.name, teacher: c.teacher }));
        return send(200, { teaching, enrolled, canTeach: teacherPlanOk() });
      }
      if (method !== 'POST') return fail(405, 'method');
      if (!teacherPlanOk()) return fail(403, 'plan_required');
      if (!u.emailVerified) return fail(403, 'email_not_verified');
      const b = await k.body(S.cls); if (!b.ok) return b.res;
      if (get('SELECT COUNT(*) AS n FROM classes WHERE teacher_id = ?', u.id)!.n >= LIMITS.classesPerTeacher) return fail(403, 'too_many_classes');
      const id = rid();
      run('INSERT INTO classes (id,teacher_id,name,created_at) VALUES (?,?,?,?)', id, u.id, b.data.name, now());
      return send(201, { id, name: b.data.name });
    }

    const cid = seg[1];
    if (!ID_RE.test(cid)) return fail(404, 'not_found');
    const cls = get('SELECT * FROM classes WHERE id = ?', cid);
    const teacher = !!cls && cls.teacher_id === u.id;
    const student = !!cls && !!get('SELECT 1 AS x FROM class_students WHERE class_id = ? AND user_id = ?', cid, u.id);
    if (!cls || (!teacher && !student)) return fail(404, 'not_found'); // ne révèle pas l'existence d'une classe
    const mustTeach = (): Response | null => (teacher ? null : fail(403, 'forbidden'));

    const assignmentCounts = (a: Row): Row => ({
      students: get('SELECT COUNT(*) AS n FROM submissions WHERE assignment_id = ?', a.id)!.n,
      submitted: get("SELECT COUNT(*) AS n FROM submissions WHERE assignment_id = ? AND status = 'submitted'", a.id)!.n,
    });
    const assignmentOut = (a: Row): Row => ({ id: a.id, title: a.title, instructions: a.instructions, dueAt: iso(a.due_at), createdAt: iso(a.created_at) });

    // ───────────── la classe ─────────────
    if (!seg[2]) {
      if (method === 'GET') {
        const assignments = all('SELECT * FROM assignments WHERE class_id = ? ORDER BY created_at DESC', cid);
        if (teacher) {
          const students = all(`SELECT u.id, u.name, u.email, u.email_verified_at FROM class_students s JOIN users u ON u.id = s.user_id WHERE s.class_id = ? ORDER BY u.name`, cid)
            .map((s) => ({ userId: s.id, name: s.name, email: s.email, activated: s.email_verified_at !== null }));
          const invites = all('SELECT id, email, expires_at FROM class_invites WHERE class_id = ? AND expires_at > ? ORDER BY created_at', cid, now())
            .map((i) => ({ id: i.id, email: i.email, expiresAt: iso(i.expires_at) }));
          return send(200, { role: 'teacher', id: cid, name: cls.name, students, invites, assignments: assignments.map((a) => ({ ...assignmentOut(a), ...assignmentCounts(a) })) });
        }
        const mine = assignments.map((a) => {
          const s = get('SELECT project_id, status, submitted_at FROM submissions WHERE assignment_id = ? AND student_id = ?', a.id, u.id);
          return { ...assignmentOut(a), submission: s ? { projectId: s.project_id, status: s.status, submittedAt: iso(s.submitted_at), comments: get('SELECT COUNT(*) AS n FROM submission_comments WHERE assignment_id = ? AND student_id = ?', a.id, u.id)!.n } : null };
        });
        return send(200, { role: 'student', id: cid, name: cls.name, teacher: get('SELECT name FROM users WHERE id = ?', cls.teacher_id)!.name, assignments: mine });
      }
      if (method === 'PATCH') {
        const no = mustTeach(); if (no) return no;
        const b = await k.body(S.patchCls); if (!b.ok) return b.res;
        run('UPDATE classes SET name = ? WHERE id = ?', b.data.name, cid);
        return send(204);
      }
      if (method === 'DELETE') {
        const no = mustTeach(); if (no) return no;
        tx(db, () => { release(cid); run('DELETE FROM classes WHERE id = ?', cid); });
        return send(204);
      }
      return fail(405, 'method');
    }

    // ───────────── élèves ─────────────
    if (seg[2] === 'students') {
      if (!seg[3]) {
        if (method !== 'POST') return fail(405, 'method');
        const no = mustTeach(); if (no) return no;
        if (!teacherPlanOk()) return fail(403, 'plan_required');
        if (!u.emailVerified) return fail(403, 'email_not_verified');
        const b = await k.body(S.students, 40_000); if (!b.ok) return b.res;
        if (k.limited('classimport:' + u.id, 20, HOUR)) return fail(429, 'rate_limit');
        const rows = b.data.students as Array<{ name: string; email: string }>;
        const loc: string = b.data.locale ?? u.locale;
        let size = get('SELECT COUNT(*) AS n FROM class_students WHERE class_id = ?', cid)!.n + get('SELECT COUNT(*) AS n FROM class_invites WHERE class_id = ? AND expires_at > ?', cid, now())!.n;
        const seen = new Set<string>();
        const results: Array<{ email: string; status: string }> = [];
        for (const r of rows) {
          const st = (status: string): void => { results.push({ email: r.email, status }); };
          if (seen.has(r.email)) { st('duplicate'); continue; }
          seen.add(r.email);
          if (r.email === u.email) { st('skipped'); continue; }
          const existing = get('SELECT * FROM users WHERE email = ?', r.email);
          if (existing && get('SELECT 1 AS x FROM class_students WHERE class_id = ? AND user_id = ?', cid, existing.id)) { st('already'); continue; }
          const hasInvite = !!existing && !!get('SELECT 1 AS x FROM class_invites WHERE class_id = ? AND email = ?', cid, r.email);
          if (!hasInvite && size >= LIMITS.studentsPerClass) { st('class_full'); continue; }
          try {
            if (existing) {
              // Compte déjà là : on n'inscrit pas de force, la personne accepte (adresse vérifiée).
              run(`INSERT INTO class_invites (id,class_id,email,invited_by,created_at,expires_at) VALUES (?,?,?,?,?,?)
                ON CONFLICT(class_id,email) DO UPDATE SET invited_by = excluded.invited_by, created_at = excluded.created_at, expires_at = excluded.expires_at`, rid(), cid, r.email, u.id, now(), now() + 14 * DAY);
              if (!hasInvite) size++;
              st('invited');
              await mailer.send(compose('classInvite', existing.locale, r.email, { who: u.name, class: cls.name, url: `${base}/#/invitations` }));
            } else {
              // Compte nouveau : mot de passe inutilisable jusqu'à l'activation par l'élève.
              const id = rid();
              const hash = 'unusable$' + rid(24);
              tx(db, () => {
                run('INSERT INTO users (id,email,name,pw_hash,locale,created_at,last_seen_at) VALUES (?,?,?,?,?,?,?)', id, r.email, r.name, hash, loc, now(), now());
                enrol(cid, id);
              });
              size++;
              st('created');
              await mailer.send(compose('classWelcome', loc, r.email, { name: r.name, who: u.name, class: cls.name, url: `${base}/#/reset/${d.activationToken(id, ACTIVATION_TTL)}` }));
            }
          } catch {
            const last = results[results.length - 1];
            if (last && last.email === r.email) last.status = 'mail_failed'; else st('mail_failed');
          }
        }
        return send(200, { results });
      }
      const sid = seg[3];
      if (!ID_RE.test(sid)) return fail(404, 'not_found');
      if (!get('SELECT 1 AS x FROM class_students WHERE class_id = ? AND user_id = ?', cid, sid)) return fail(404, 'not_found');
      if (seg[4] === 'resend' && method === 'POST') {
        const no = mustTeach(); if (no) return no;
        const s = get('SELECT * FROM users WHERE id = ?', sid)!;
        if (s.email_verified_at !== null) return fail(409, 'already_active');
        if (k.limited('classresend:' + u.id, 60, HOUR)) return fail(429, 'rate_limit');
        await mailer.send(compose('classWelcome', s.locale, s.email, { name: s.name, who: u.name, class: cls.name, url: `${base}/#/reset/${d.activationToken(sid, ACTIVATION_TTL)}` }));
        return send(204);
      }
      if (!seg[4] && method === 'DELETE') {
        if (!teacher && sid !== u.id) return fail(403, 'forbidden');
        tx(db, () => { release(cid, sid); run('DELETE FROM class_students WHERE class_id = ? AND user_id = ?', cid, sid); });
        return send(204);
      }
      return fail(405, 'method');
    }

    if (seg[2] === 'invites' && seg[3] && method === 'DELETE') {
      const no = mustTeach(); if (no) return no;
      run('DELETE FROM class_invites WHERE id = ? AND class_id = ?', seg[3], cid);
      return send(204);
    }

    // ───────────── sujets ─────────────
    if (seg[2] === 'assignments') {
      if (!seg[3]) {
        if (method !== 'POST') return fail(405, 'method');
        const no = mustTeach(); if (no) return no;
        if (!teacherPlanOk()) return fail(403, 'plan_required');
        const b = await k.body(S.assignment, d.maxProjectBytes + 10_000); if (!b.ok) return b.res;
        if (get('SELECT COUNT(*) AS n FROM assignments WHERE class_id = ?', cid)!.n >= LIMITS.assignmentsPerClass) return fail(403, 'too_many_assignments');
        let source: string;
        if (b.data.projectId !== undefined) {
          // Le sujet vient d'un projet dont on est propriétaire (pas d'une copie d'élève).
          const p = ID_RE.test(b.data.projectId) ? get("SELECT p.snapshot FROM projects p JOIN members m ON m.project_id = p.id WHERE p.id = ? AND m.user_id = ? AND m.role = 'owner'", b.data.projectId, u.id) : undefined;
          if (!p) return fail(404, 'not_found');
          source = p.snapshot;
        } else if (b.data.document !== undefined) source = JSON.stringify(b.data.document);
        else return fail(400, 'invalid_body');
        let template: string;
        try { template = exportNative({ ...importNative(source).model, name: b.data.title }).output; } catch { return fail(400, 'invalid_document'); }
        if (Buffer.byteLength(template) > d.maxProjectBytes) return fail(413, 'too_large');
        const id = rid(), t = now();
        const dueAt = b.data.dueAt ? Date.parse(b.data.dueAt) : null;
        tx(db, () => {
          run('INSERT INTO assignments (id,class_id,title,instructions,template,created_at,due_at) VALUES (?,?,?,?,?,?,?)', id, cid, b.data.title, b.data.instructions ?? '', template, t, dueAt);
          const a = get('SELECT * FROM assignments WHERE id = ?', id)!;
          for (const s of all('SELECT user_id FROM class_students WHERE class_id = ?', cid)) makeCopy(a, s.user_id);
        });
        return send(201, { id });
      }
      const aid = seg[3];
      const a = ID_RE.test(aid) ? get('SELECT * FROM assignments WHERE id = ? AND class_id = ?', aid, cid) : undefined;
      if (!a) return fail(404, 'not_found');

      if (!seg[4]) {
        if (method === 'GET') {
          if (teacher) {
            const subs = all(`SELECT s.student_id, s.project_id, s.status, s.submitted_at, u.name, p.updated_at,
                (SELECT role FROM members m WHERE m.project_id = s.project_id AND m.user_id = ?) AS access,
                (SELECT COUNT(*) FROM submission_comments c WHERE c.assignment_id = s.assignment_id AND c.student_id = s.student_id) AS comments
              FROM submissions s JOIN users u ON u.id = s.student_id JOIN projects p ON p.id = s.project_id WHERE s.assignment_id = ? ORDER BY u.name`, u.id, aid);
            return send(200, { assignment: { ...assignmentOut(a), ...assignmentCounts(a) }, submissions: subs.map((s) => ({
              userId: s.student_id, name: s.name, projectId: s.project_id, status: s.status, submittedAt: iso(s.submitted_at), updatedAt: iso(s.updated_at), access: s.access, comments: s.comments,
            })) });
          }
          const s = get('SELECT project_id, status, submitted_at FROM submissions WHERE assignment_id = ? AND student_id = ?', aid, u.id);
          const comments = all('SELECT c.id, c.body, c.created_at, w.name AS author FROM submission_comments c JOIN users w ON w.id = c.author_id WHERE c.assignment_id = ? AND c.student_id = ? ORDER BY c.created_at', aid, u.id)
            .map((c) => ({ id: c.id, body: c.body, author: c.author, createdAt: iso(c.created_at) }));
          return send(200, { assignment: assignmentOut(a), submission: s ? { projectId: s.project_id, status: s.status, submittedAt: iso(s.submitted_at) } : null, comments });
        }
        if (method === 'PATCH') {
          const no = mustTeach(); if (no) return no;
          const b = await k.body(S.patchAssignment); if (!b.ok) return b.res;
          run('UPDATE assignments SET title = COALESCE(?, title), instructions = COALESCE(?, instructions) WHERE id = ?', b.data.title ?? null, b.data.instructions ?? null, aid);
          if (b.data.dueAt !== undefined) run('UPDATE assignments SET due_at = ? WHERE id = ?', b.data.dueAt ? Date.parse(b.data.dueAt) : null, aid);
          return send(204);
        }
        if (method === 'DELETE') {
          const no = mustTeach(); if (no) return no;
          tx(db, () => {
            run("DELETE FROM members WHERE user_id = ? AND role <> 'owner' AND project_id IN (SELECT project_id FROM submissions WHERE assignment_id = ?)", u.id, aid);
            run('DELETE FROM assignments WHERE id = ?', aid);
          });
          return send(204);
        }
        return fail(405, 'method');
      }

      if (seg[4] === 'submit' && method === 'POST') {
        if (!student) return fail(403, 'forbidden');
        const b = await k.body(S.submit); if (!b.ok) return b.res;
        const r = db.prepare('UPDATE submissions SET status = ?, submitted_at = ? WHERE assignment_id = ? AND student_id = ?')
          .run(b.data.submitted ? 'submitted' : 'todo', b.data.submitted ? now() : null, aid, u.id);
        return Number(r.changes) ? send(204) : fail(404, 'not_found');
      }

      if (seg[4] === 'submissions' && seg[5] && ID_RE.test(seg[5])) {
        const sid = seg[5];
        const sub = get('SELECT * FROM submissions WHERE assignment_id = ? AND student_id = ?', aid, sid);
        if (!sub || (!teacher && sid !== u.id)) return fail(404, 'not_found');

        if (seg[6] === 'access') {
          const no = mustTeach(); if (no) return no;
          if (method === 'PUT') {
            const b = await k.body(S.access); if (!b.ok) return b.res;
            run('INSERT INTO members (project_id,user_id,role,created_at) VALUES (?,?,?,?) ON CONFLICT(project_id,user_id) DO UPDATE SET role = excluded.role', sub.project_id, u.id, b.data.role, now());
            return send(200, { projectId: sub.project_id, role: b.data.role });
          }
          if (method === 'DELETE') { run("DELETE FROM members WHERE project_id = ? AND user_id = ? AND role <> 'owner'", sub.project_id, u.id); return send(204); }
          return fail(405, 'method');
        }

        if (seg[6] === 'comments') {
          if (!seg[7]) {
            if (method === 'GET') {
              const comments = all('SELECT c.id, c.body, c.created_at, w.name AS author FROM submission_comments c JOIN users w ON w.id = c.author_id WHERE c.assignment_id = ? AND c.student_id = ? ORDER BY c.created_at', aid, sid)
                .map((c) => ({ id: c.id, body: c.body, author: c.author, createdAt: iso(c.created_at) }));
              return send(200, { comments });
            }
            if (method === 'POST') {
              const no = mustTeach(); if (no) return no;
              const b = await k.body(S.comment); if (!b.ok) return b.res;
              if (k.limited('classcomment:' + u.id, 200, HOUR)) return fail(429, 'rate_limit');
              const id = rid();
              run('INSERT INTO submission_comments (id,assignment_id,student_id,author_id,body,created_at) VALUES (?,?,?,?,?,?)', id, aid, sid, u.id, b.data.body, now());
              return send(201, { id });
            }
            return fail(405, 'method');
          }
          if (method === 'DELETE') {
            const no = mustTeach(); if (no) return no;
            run('DELETE FROM submission_comments WHERE id = ? AND assignment_id = ? AND student_id = ? AND author_id = ?', seg[7], aid, sid, u.id);
            return send(204);
          }
          return fail(405, 'method');
        }
      }
      return fail(404, 'not_found');
    }
    return fail(404, 'not_found');
  };
}
