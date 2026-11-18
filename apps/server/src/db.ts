import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export type Db = DatabaseSync;

/** Migrations numérotées : la version appliquée est dans `PRAGMA user_version`. Ne jamais modifier une migration publiée. */
const MIGRATIONS: string[] = [
  `
  CREATE TABLE users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    pw_hash TEXT NOT NULL,
    locale TEXT NOT NULL DEFAULT 'fr',
    email_verified_at INTEGER,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE sessions (
    id_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX sessions_user ON sessions(user_id);
  CREATE TABLE tokens (
    hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('verify','reset')),
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL REFERENCES users(id),
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    snapshot TEXT NOT NULL,
    state BLOB
  );
  CREATE INDEX projects_owner ON projects(owner_id);
  CREATE TABLE members (
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('owner','editor','viewer')),
    created_at INTEGER NOT NULL,
    PRIMARY KEY (project_id, user_id)
  );
  CREATE INDEX members_user ON members(user_id);
  CREATE TABLE invites (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('editor','viewer')),
    invited_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    UNIQUE (project_id, email)
  );
  CREATE INDEX invites_email ON invites(email);
  `,
  // 2 : dernière activité (purge des comptes inactifs, ADR 0005) et date d'avertissement.
  `
  ALTER TABLE users ADD COLUMN last_seen_at INTEGER;
  ALTER TABLE users ADD COLUMN purge_warned_at INTEGER;
  UPDATE users SET last_seen_at = created_at;
  `,
  // 3 : liste d'attente des formules à venir (email + type de besoin, purgée après 24 mois) et compteurs d'usage agrégés par jour.
  // Les compteurs ne contiennent ni identifiant, ni adresse IP, ni email : seulement « tel événement, tel jour, n fois ».
  `
  CREATE TABLE waitlist (
    email TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('teacher','school','other')),
    locale TEXT NOT NULL DEFAULT 'fr',
    created_at INTEGER NOT NULL
  );
  CREATE TABLE usage_daily (
    day TEXT NOT NULL,
    event TEXT NOT NULL,
    n INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (day, event)
  );
  `,
  // 4 : offre de la personne (`free`, `teacher`). La co-édition (invitations) est réservée à `teacher` quand COLLAB_REQUIRES_PLAN=1.
  `
  ALTER TABLE users ADD COLUMN plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free','teacher'));
  `,
  // 5 : espaces de classe (ADR 0006). Les copies d'élèves sont des `projects` ordinaires ; `submissions.project_id` les relie au sujet.
  `
  CREATE TABLE classes (
    id TEXT PRIMARY KEY,
    teacher_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX classes_teacher ON classes(teacher_id);
  CREATE TABLE class_students (
    class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at INTEGER NOT NULL,
    PRIMARY KEY (class_id, user_id)
  );
  CREATE INDEX class_students_user ON class_students(user_id);
  CREATE TABLE class_invites (
    id TEXT PRIMARY KEY,
    class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    invited_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    UNIQUE (class_id, email)
  );
  CREATE INDEX class_invites_email ON class_invites(email);
  CREATE TABLE assignments (
    id TEXT PRIMARY KEY,
    class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    instructions TEXT NOT NULL DEFAULT '',
    template TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    due_at INTEGER
  );
  CREATE INDEX assignments_class ON assignments(class_id);
  CREATE TABLE submissions (
    assignment_id TEXT NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
    student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','submitted')),
    submitted_at INTEGER,
    PRIMARY KEY (assignment_id, student_id)
  );
  CREATE UNIQUE INDEX submissions_project ON submissions(project_id);
  CREATE INDEX submissions_student ON submissions(student_id);
  CREATE TABLE submission_comments (
    id TEXT PRIMARY KEY,
    assignment_id TEXT NOT NULL,
    student_id TEXT NOT NULL,
    author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (assignment_id, student_id) REFERENCES submissions(assignment_id, student_id) ON DELETE CASCADE
  );
  CREATE INDEX comments_sub ON submission_comments(assignment_id, student_id);
  `,
];

export function migrate(db: Db): void {
  const row = db.prepare('PRAGMA user_version').get() as { user_version: number };
  for (let v = row.user_version; v < MIGRATIONS.length; v++) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[v]!);
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  }
}

/** Ouvre (et crée au besoin) la base. `:memory:` pour les tests. */
export function openDb(path: string): Db {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL');
  migrate(db);
  return db;
}

/** Exécute `fn` dans une transaction (annulée si `fn` lève). */
export function tx<T>(db: Db, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
}
