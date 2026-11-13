import 'dotenv/config';
import { Pool, neon, neonConfig } from '@neondatabase/serverless';
import fs from 'node:fs';
import path from 'node:path';
import ws from 'ws';
import { resolveDataRoot } from './src/server/dataRoot.ts';

// Configure Neon serverless WebSocket connection for optimal serverless/Vercel performance
neonConfig.webSocketConstructor = ws;

function normalizeNeonConnectionString(raw: string): string {
  const trimmed = (raw || '').trim();
  if (!trimmed) return '';
  // Handle Chrome auto-translate artifact ("channel_binding=requerido" -> "channel_binding=require")
  return trimmed.replace(/channel_binding=requerido/gi, 'channel_binding=require');
}

const rawConnectionString = (process.env.DATABASE_URL || process.env.POSTGRES_URL || '').trim();
if (!rawConnectionString && !process.env.RODOVAR_DATA_ROOT) {
  throw new Error(
    'Configuração ausente: A variável de ambiente DATABASE_URL (ou POSTGRES_URL) é obrigatória para conexão com o Neon PostgreSQL.'
  );
}

const connectionString = normalizeNeonConnectionString(rawConnectionString);

export const isNeonConfigured = Boolean(
  connectionString &&
    !connectionString.includes('dummy') &&
    !connectionString.includes('****************')
);

export function isIsolatedTestEnv(): boolean {
  if (process.env.VERCEL || process.env.VERCEL_ENV) return false;
  return Boolean(
    process.env.RODOVAR_DATA_ROOT ||
      process.env.NODE_TEST_CONTEXT ||
      process.execArgv.includes('--test') ||
      process.argv.includes('--test')
  );
}

export const pool = new Pool({
  connectionString: connectionString || undefined,
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 5000,
  max: 5,
});

export const sql = isNeonConfigured ? neon(connectionString) : null;

const NEON_SCHEMA_VERSION = '2027.06.v1';
let neonSchemaInitialized = false;
let neonSchemaInitPromise: Promise<void> | null = null;

export async function testNeonConnection(): Promise<boolean> {
  if (!isNeonConfigured || !sql) {
    return false;
  }
  try {
    await sql`SELECT 1 AS ok`;
    return true;
  } catch (error) {
    try {
      const client = await pool.connect();
      try {
        await client.query('SELECT 1');
        return true;
      } finally {
        client.release();
      }
    } catch (poolErr) {
      console.warn('Neon Postgres connection failed:', (poolErr as Error).message || (error as Error).message);
      return false;
    }
  }
}

export const NEON_AUTH_URL =
  process.env.NEON_AUTH_URL ||
  'https://ep-raspy-river-b6yady4i.neonauth.c-2.sa-east-1.aws.neon.tech/neondb/auth';

export const NEON_JWKS_URL =
  process.env.NEON_JWKS_URL ||
  'https://ep-raspy-river-b6yady4i.neonauth.c-2.sa-east-1.aws.neon.tech/neondb/auth/.well-known/jwks.json';

export interface NeonHealthStats {
  connected: boolean;
  databaseUrlConfigured: boolean;
  host: string | null;
  database: string | null;
  branch: string;
  services: string[];
  authUrl: string;
  jwksUrl: string;
  counts: {
    users: number;
    fretes: number;
    requests: number;
    payments: number;
    snapshots: number;
    announcements?: number;
    agenda?: number;
    auditLogs?: number;
  } | null;
  timestamp: string;
}

export async function getNeonHealthStats(): Promise<NeonHealthStats> {
  let host: string | null = null;
  let database: string | null = null;
  if (isNeonConfigured) {
    try {
      const parsed = new URL(connectionString);
      host = parsed.hostname;
      database = parsed.pathname.replace(/^\//, '') || 'neondb';
    } catch {
      // ignore URL parse error
    }
  }

  const connected = await testNeonConnection();
  let counts: NeonHealthStats['counts'] = null;
  if (connected && sql) {
    try {
      const rows = await sql`
        SELECT
          (SELECT COUNT(*)::int FROM rodovar_users) AS users,
          (SELECT COUNT(*)::int FROM rodovar_fretes) AS fretes,
          (SELECT COUNT(*)::int FROM rodovar_requests) AS requests,
          (SELECT COUNT(*)::int FROM rodovar_payments) AS payments,
          (SELECT COUNT(*)::int FROM rodovar_state_store) AS snapshots,
          (SELECT COUNT(*)::int FROM rodovar_announcements) AS announcements,
          (SELECT COUNT(*)::int FROM rodovar_agenda) AS agenda,
          (SELECT COUNT(*)::int FROM rodovar_audit_logs) AS audit_logs
      `;
      if (rows[0]) {
        counts = {
          users: Number(rows[0].users || 0),
          fretes: Number(rows[0].fretes || 0),
          requests: Number(rows[0].requests || 0),
          payments: Number(rows[0].payments || 0),
          snapshots: Number(rows[0].snapshots || 0),
          announcements: Number(rows[0].announcements || 0),
          agenda: Number(rows[0].agenda || 0),
          auditLogs: Number(rows[0].audit_logs || 0),
        };
      }
    } catch {
      // tables might still be initializing fallback
      try {
        const rows = await sql`
          SELECT
            (SELECT COUNT(*)::int FROM rodovar_users) AS users,
            (SELECT COUNT(*)::int FROM rodovar_fretes) AS fretes,
            (SELECT COUNT(*)::int FROM rodovar_requests) AS requests,
            (SELECT COUNT(*)::int FROM rodovar_payments) AS payments,
            (SELECT COUNT(*)::int FROM rodovar_state_store) AS snapshots
        `;
        if (rows[0]) {
          counts = {
            users: Number(rows[0].users || 0),
            fretes: Number(rows[0].fretes || 0),
            requests: Number(rows[0].requests || 0),
            payments: Number(rows[0].payments || 0),
            snapshots: Number(rows[0].snapshots || 0),
          };
        }
      } catch {}
    }
  }

  return {
    connected,
    databaseUrlConfigured: isNeonConfigured,
    host,
    database,
    branch: 'production',
    services: ['postgres', 'auth'],
    authUrl: NEON_AUTH_URL,
    jwksUrl: NEON_JWKS_URL,
    counts,
    timestamp: new Date().toISOString(),
  };
}

export async function initializeNeonSchema(): Promise<void> {
  if (!isNeonConfigured || isIsolatedTestEnv()) {
    return;
  }
  if (neonSchemaInitialized) {
    return;
  }
  if (neonSchemaInitPromise) {
    return neonSchemaInitPromise;
  }

  neonSchemaInitPromise = (async () => {
    try {
      // Fast-path check via stateless HTTP query so Vercel cold starts skip 30 DDLs & seed loops
      if (sql) {
        try {
          const check = await sql`
            SELECT payload FROM rodovar_state_store WHERE key = 'rodovar-schema-version' LIMIT 1
          `;
          if (check[0]?.payload?.version === NEON_SCHEMA_VERSION) {
            neonSchemaInitialized = true;
            return;
          }
        } catch {
          // Table may not exist yet — proceed to DDL initialization
        }
      }

      const client = await pool.connect();
      try {
        await client.query(`
      CREATE TABLE IF NOT EXISTS rodovar_users (
        id VARCHAR(64) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        login VARCHAR(255),
        department VARCHAR(100) NOT NULL,
        role VARCHAR(100) NOT NULL,
        role_title VARCHAR(150),
        access_level VARCHAR(50) NOT NULL,
        access_profile VARCHAR(50),
        password_hash VARCHAR(255) NOT NULL,
        password_salt VARCHAR(255) DEFAULT '',
        must_change_password BOOLEAN DEFAULT TRUE,
        avatar TEXT DEFAULT '',
        has_custom_avatar BOOLEAN DEFAULT FALSE,
        approval_status VARCHAR(50) DEFAULT 'APROVADO',
        requested_at VARCHAR(64),
        approved_by VARCHAR(255),
        approved_at VARCHAR(64),
        status_reason TEXT,
        migrated_from_google BOOLEAN DEFAULT FALSE,
        phone_ext VARCHAR(64) DEFAULT '',
        phone VARCHAR(64) DEFAULT '',
        location VARCHAR(120) DEFAULT 'BA - Salvador',
        joined_at VARCHAR(64) DEFAULT '',
        active BOOLEAN DEFAULT TRUE,
        permissoes_paginas JSONB DEFAULT '[]'::jsonb,
        roster_activation_version INT DEFAULT 1,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      ALTER TABLE rodovar_users ADD COLUMN IF NOT EXISTS login VARCHAR(255);
      ALTER TABLE rodovar_users ADD COLUMN IF NOT EXISTS role_title VARCHAR(150);
      ALTER TABLE rodovar_users ADD COLUMN IF NOT EXISTS access_profile VARCHAR(50);
      ALTER TABLE rodovar_users ADD COLUMN IF NOT EXISTS password_salt VARCHAR(255) DEFAULT '';
      ALTER TABLE rodovar_users ADD COLUMN IF NOT EXISTS avatar TEXT DEFAULT '';
      ALTER TABLE rodovar_users ADD COLUMN IF NOT EXISTS has_custom_avatar BOOLEAN DEFAULT FALSE;
      ALTER TABLE rodovar_users ADD COLUMN IF NOT EXISTS approval_status VARCHAR(50) DEFAULT 'APROVADO';
      ALTER TABLE rodovar_users ADD COLUMN IF NOT EXISTS requested_at VARCHAR(64);
      ALTER TABLE rodovar_users ADD COLUMN IF NOT EXISTS approved_by VARCHAR(255);
      ALTER TABLE rodovar_users ADD COLUMN IF NOT EXISTS approved_at VARCHAR(64);
      ALTER TABLE rodovar_users ADD COLUMN IF NOT EXISTS status_reason TEXT;
      ALTER TABLE rodovar_users ADD COLUMN IF NOT EXISTS migrated_from_google BOOLEAN DEFAULT FALSE;
      ALTER TABLE rodovar_users ADD COLUMN IF NOT EXISTS phone_ext VARCHAR(64) DEFAULT '';
      ALTER TABLE rodovar_users ADD COLUMN IF NOT EXISTS phone VARCHAR(64) DEFAULT '';
      ALTER TABLE rodovar_users ADD COLUMN IF NOT EXISTS location VARCHAR(120) DEFAULT 'BA - Salvador';
      ALTER TABLE rodovar_users ADD COLUMN IF NOT EXISTS joined_at VARCHAR(64) DEFAULT '';
      ALTER TABLE rodovar_users ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE;
      ALTER TABLE rodovar_users ADD COLUMN IF NOT EXISTS permissoes_paginas JSONB DEFAULT '[]'::jsonb;
      ALTER TABLE rodovar_users ADD COLUMN IF NOT EXISTS roster_activation_version INT DEFAULT 1;
      ALTER TABLE rodovar_users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

      CREATE INDEX IF NOT EXISTS idx_rodovar_users_login ON rodovar_users(LOWER(login));
      CREATE INDEX IF NOT EXISTS idx_rodovar_users_email ON rodovar_users(LOWER(email));

      CREATE TABLE IF NOT EXISTS rodovar_login_locks (
        identifier VARCHAR(255) PRIMARY KEY,
        consecutive_failures INT NOT NULL DEFAULT 0,
        blocked_until BIGINT,
        last_failure_at BIGINT NOT NULL DEFAULT 0,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS rodovar_password_reset_tokens (
        token_hash VARCHAR(128) PRIMARY KEY,
        user_id VARCHAR(64) NOT NULL,
        created_at BIGINT NOT NULL,
        expires_at BIGINT NOT NULL,
        used BOOLEAN NOT NULL DEFAULT FALSE,
        onboarding BOOLEAN NOT NULL DEFAULT FALSE
      );
      CREATE INDEX IF NOT EXISTS idx_rodovar_pw_reset_user ON rodovar_password_reset_tokens(user_id);

      CREATE TABLE IF NOT EXISTS rodovar_access_decisions (
        id VARCHAR(64) PRIMARY KEY,
        target_user_id VARCHAR(64) NOT NULL,
        target_name VARCHAR(255) NOT NULL,
        target_login VARCHAR(255) NOT NULL,
        admin_id VARCHAR(64) NOT NULL,
        admin_name VARCHAR(255) NOT NULL,
        action VARCHAR(64) NOT NULL,
        new_status VARCHAR(64) NOT NULL,
        access_level VARCHAR(64) NOT NULL,
        permissoes_paginas JSONB DEFAULT '[]'::jsonb,
        reason TEXT,
        timestamp_iso VARCHAR(64) NOT NULL,
        timestamp_formatted VARCHAR(64) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS rodovar_archived_users (
        user_id VARCHAR(64) PRIMARY KEY,
        user_snapshot JSONB NOT NULL,
        deleted_at_iso VARCHAR(64) NOT NULL,
        deleted_by_id VARCHAR(64) NOT NULL,
        reason TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS rodovar_access_policy (
        id VARCHAR(32) PRIMARY KEY,
        protected_admin_uid VARCHAR(64) NOT NULL,
        authorized_uids JSONB NOT NULL DEFAULT '[]'::jsonb,
        version INT NOT NULL DEFAULT 1,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS rodovar_revoked_sessions (
        session_id VARCHAR(512) PRIMARY KEY,
        user_id VARCHAR(64),
        revoked_at BIGINT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS rodovar_user_revocations (
        user_id VARCHAR(64) PRIMARY KEY,
        revoked_after_ms BIGINT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS rodovar_fretes (
        id VARCHAR(64) PRIMARY KEY,
        sequential_id VARCHAR(32) UNIQUE NOT NULL,
        client_name VARCHAR(255) NOT NULL,
        client_cnpj VARCHAR(32),
        origin VARCHAR(255) NOT NULL,
        destination_city VARCHAR(255) NOT NULL,
        destination_state VARCHAR(8) NOT NULL,
        destination_address TEXT,
        cargo_description TEXT,
        agreed_value NUMERIC(12,2) NOT NULL,
        driver_name VARCHAR(255),
        driver_cpf VARCHAR(32),
        driver_phone VARCHAR(64),
        truck_plate VARCHAR(32),
        status VARCHAR(64) NOT NULL,
        situacao_comercial VARCHAR(64),
        situacao_operacional VARCHAR(64),
        situacao_monitoramento VARCHAR(64),
        comercial_responsavel_id VARCHAR(64),
        expedicao_responsavel_id VARCHAR(64),
        monitoramento_responsavel_id VARCHAR(64),
        data_coleta_iso VARCHAR(32),
        data_entrega_prevista_iso VARCHAR(32),
        entrega_comprovada_em VARCHAR(64),
        payload JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      ALTER TABLE rodovar_fretes ADD COLUMN IF NOT EXISTS situacao_comercial VARCHAR(64);
      ALTER TABLE rodovar_fretes ADD COLUMN IF NOT EXISTS situacao_operacional VARCHAR(64);
      ALTER TABLE rodovar_fretes ADD COLUMN IF NOT EXISTS situacao_monitoramento VARCHAR(64);
      ALTER TABLE rodovar_fretes ADD COLUMN IF NOT EXISTS comercial_responsavel_id VARCHAR(64);
      ALTER TABLE rodovar_fretes ADD COLUMN IF NOT EXISTS expedicao_responsavel_id VARCHAR(64);
      ALTER TABLE rodovar_fretes ADD COLUMN IF NOT EXISTS monitoramento_responsavel_id VARCHAR(64);
      ALTER TABLE rodovar_fretes ADD COLUMN IF NOT EXISTS data_coleta_iso VARCHAR(32);
      ALTER TABLE rodovar_fretes ADD COLUMN IF NOT EXISTS data_entrega_prevista_iso VARCHAR(32);
      ALTER TABLE rodovar_fretes ADD COLUMN IF NOT EXISTS entrega_comprovada_em VARCHAR(64);
      ALTER TABLE rodovar_fretes ADD COLUMN IF NOT EXISTS payload JSONB;
      CREATE INDEX IF NOT EXISTS idx_rodovar_fretes_mon_status_upd ON rodovar_fretes(situacao_monitoramento, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_rodovar_fretes_mon_resp_status ON rodovar_fretes(monitoramento_responsavel_id, situacao_monitoramento, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_rodovar_fretes_protocol ON rodovar_fretes(sequential_id);
      CREATE INDEX IF NOT EXISTS idx_rodovar_fretes_dates ON rodovar_fretes(data_coleta_iso, data_entrega_prevista_iso);

      CREATE TABLE IF NOT EXISTS rodovar_requests (
        id VARCHAR(64) PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        department VARCHAR(100) NOT NULL,
        requester_name VARCHAR(255) NOT NULL,
        status VARCHAR(64) NOT NULL,
        details TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS rodovar_payments (
        id VARCHAR(64) PRIMARY KEY,
        frete_id VARCHAR(64),
        type VARCHAR(64) NOT NULL,
        amount NUMERIC(12,2) NOT NULL,
        status VARCHAR(64) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS rodovar_state_store (
        key VARCHAR(128) PRIMARY KEY,
        payload JSONB NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS rodovar_announcements (
        id VARCHAR(64) PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        author_name VARCHAR(255) NOT NULL,
        target_audience VARCHAR(100) NOT NULL,
        priority VARCHAR(50) NOT NULL,
        content TEXT NOT NULL,
        data JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS rodovar_agenda (
        id VARCHAR(64) PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        date_iso VARCHAR(32) NOT NULL,
        start_time VARCHAR(16),
        end_time VARCHAR(16),
        category VARCHAR(100),
        data JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS rodovar_audit_logs (
        id VARCHAR(64) PRIMARY KEY,
        actor_id VARCHAR(64),
        actor_name VARCHAR(255),
        actor_role VARCHAR(64),
        action VARCHAR(100) NOT NULL,
        details TEXT,
        ip_address VARCHAR(64),
        timestamp_iso VARCHAR(64),
        timestamp_formatted VARCHAR(64),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      ALTER TABLE rodovar_audit_logs ADD COLUMN IF NOT EXISTS actor_role VARCHAR(64);
      ALTER TABLE rodovar_audit_logs ADD COLUMN IF NOT EXISTS timestamp_iso VARCHAR(64);
      ALTER TABLE rodovar_audit_logs ADD COLUMN IF NOT EXISTS timestamp_formatted VARCHAR(64);

      CREATE TABLE IF NOT EXISTS rodovar_social_profiles (
        user_id VARCHAR(64) PRIMARY KEY,
        cover_url TEXT,
        bio TEXT,
        custom_display_name VARCHAR(150),
        phone VARCHAR(50),
        location VARCHAR(100),
        social_links JSONB DEFAULT '{}'::jsonb,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS rodovar_social_posts (
        id VARCHAR(64) PRIMARY KEY,
        author_id VARCHAR(64) NOT NULL,
        author_name VARCHAR(255) NOT NULL,
        author_avatar TEXT,
        author_role VARCHAR(100),
        author_department VARCHAR(100),
        content TEXT NOT NULL,
        images JSONB DEFAULT '[]'::jsonb,
        likes JSONB DEFAULT '[]'::jsonb,
        audience VARCHAR(50) DEFAULT 'Público',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS rodovar_social_comments (
        id VARCHAR(64) PRIMARY KEY,
        post_id VARCHAR(64) NOT NULL,
        author_id VARCHAR(64) NOT NULL,
        author_name VARCHAR(255) NOT NULL,
        author_avatar TEXT,
        author_role VARCHAR(100),
        content TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS rodovar_system_assets (
        id VARCHAR(128) PRIMARY KEY,
        slot VARCHAR(64) NOT NULL,
        mime_type VARCHAR(64) NOT NULL,
        data_base64 TEXT NOT NULL,
        width INT,
        height INT,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS rodovar_notifications (
        id VARCHAR(128) PRIMARY KEY,
        recipient_id VARCHAR(64) NOT NULL,
        type VARCHAR(64) NOT NULL,
        dot_color VARCHAR(32) DEFAULT 'blue',
        title VARCHAR(255) NOT NULL,
        subtitle TEXT,
        time_label VARCHAR(64),
        read BOOLEAN DEFAULT FALSE,
        target_section VARCHAR(64) NOT NULL,
        target_id VARCHAR(64) NOT NULL,
        dedupe_key VARCHAR(128),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_rodovar_notif_recipient ON rodovar_notifications(recipient_id);
      CREATE INDEX IF NOT EXISTS idx_rodovar_notif_dedupe ON rodovar_notifications(dedupe_key);
    `);

    await syncLocalDataToNeon(client);
    await client.query(
      `INSERT INTO rodovar_state_store (key, payload, updated_at)
       VALUES ('rodovar-schema-version', $1::jsonb, CURRENT_TIMESTAMP)
       ON CONFLICT (key) DO UPDATE SET payload = EXCLUDED.payload, updated_at = CURRENT_TIMESTAMP`,
      [JSON.stringify({ version: NEON_SCHEMA_VERSION, updatedAt: new Date().toISOString() })]
    );
        neonSchemaInitialized = true;
        console.log('Neon Postgres schema & data synchronized successfully.');
      } finally {
        client.release();
      }
    } catch (error) {
      console.warn('Neon schema/data synchronization failed:', (error as Error).message);
    }
  })().finally(() => {
    neonSchemaInitPromise = null;
  });

  return neonSchemaInitPromise;
}

export const ensureNeonReady = initializeNeonSchema;

async function upsertUserRowWithClient(client: any, u: any, overwriteExisting = false): Promise<void> {
  if (!u || !u.id || (!u.email && !u.login)) return;
  const email = String(u.email || (String(u.login).includes('@') ? u.login : `${u.login}@rodovar.com.br`));
  const login = String(u.login || email);
  const role = String(u.accessProfile || u.roleTitle || 'COLABORADOR').slice(0, 100);
  const roleTitle = String(u.roleTitle || u.accessProfile || 'Colaborador').slice(0, 150);
  const accessProfile = u.accessProfile ? String(u.accessProfile).slice(0, 50) : null;
  const permissoes = Array.isArray(u.permissoesPaginas) ? u.permissoesPaginas : [];

  const conflictClause = overwriteExisting
    ? `ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        email = EXCLUDED.email,
        login = EXCLUDED.login,
        department = EXCLUDED.department,
        role = EXCLUDED.role,
        role_title = EXCLUDED.role_title,
        access_level = EXCLUDED.access_level,
        access_profile = EXCLUDED.access_profile,
        password_hash = EXCLUDED.password_hash,
        password_salt = EXCLUDED.password_salt,
        must_change_password = EXCLUDED.must_change_password,
        avatar = EXCLUDED.avatar,
        has_custom_avatar = EXCLUDED.has_custom_avatar,
        approval_status = EXCLUDED.approval_status,
        requested_at = EXCLUDED.requested_at,
        approved_by = EXCLUDED.approved_by,
        approved_at = EXCLUDED.approved_at,
        status_reason = EXCLUDED.status_reason,
        migrated_from_google = EXCLUDED.migrated_from_google,
        phone_ext = EXCLUDED.phone_ext,
        phone = EXCLUDED.phone,
        location = EXCLUDED.location,
        joined_at = EXCLUDED.joined_at,
        active = EXCLUDED.active,
        permissoes_paginas = EXCLUDED.permissoes_paginas,
        roster_activation_version = EXCLUDED.roster_activation_version,
        updated_at = CURRENT_TIMESTAMP`
    : `ON CONFLICT (id) DO UPDATE SET
        login = COALESCE(NULLIF(rodovar_users.login, ''), EXCLUDED.login),
        role_title = COALESCE(NULLIF(rodovar_users.role_title, ''), EXCLUDED.role_title),
        access_profile = COALESCE(rodovar_users.access_profile, EXCLUDED.access_profile),
        password_salt = CASE WHEN rodovar_users.password_salt IS NULL OR rodovar_users.password_salt = '' THEN EXCLUDED.password_salt ELSE rodovar_users.password_salt END,
        avatar = CASE WHEN rodovar_users.avatar IS NULL OR rodovar_users.avatar = '' THEN EXCLUDED.avatar ELSE rodovar_users.avatar END,
        has_custom_avatar = COALESCE(rodovar_users.has_custom_avatar, EXCLUDED.has_custom_avatar),
        approval_status = COALESCE(NULLIF(rodovar_users.approval_status, ''), EXCLUDED.approval_status),
        requested_at = COALESCE(rodovar_users.requested_at, EXCLUDED.requested_at),
        approved_by = COALESCE(rodovar_users.approved_by, EXCLUDED.approved_by),
        approved_at = COALESCE(rodovar_users.approved_at, EXCLUDED.approved_at),
        status_reason = COALESCE(rodovar_users.status_reason, EXCLUDED.status_reason),
        phone_ext = CASE WHEN rodovar_users.phone_ext IS NULL OR rodovar_users.phone_ext = '' THEN EXCLUDED.phone_ext ELSE rodovar_users.phone_ext END,
        phone = CASE WHEN rodovar_users.phone IS NULL OR rodovar_users.phone = '' THEN EXCLUDED.phone ELSE rodovar_users.phone END,
        location = CASE WHEN rodovar_users.location IS NULL OR rodovar_users.location = '' THEN EXCLUDED.location ELSE rodovar_users.location END,
        joined_at = CASE WHEN rodovar_users.joined_at IS NULL OR rodovar_users.joined_at = '' THEN EXCLUDED.joined_at ELSE rodovar_users.joined_at END,
        permissoes_paginas = CASE WHEN rodovar_users.permissoes_paginas IS NULL OR jsonb_array_length(rodovar_users.permissoes_paginas) = 0 THEN EXCLUDED.permissoes_paginas ELSE rodovar_users.permissoes_paginas END`;

  await client.query(
    `INSERT INTO rodovar_users (
      id, name, email, login, department, role, role_title, access_level, access_profile,
      password_hash, password_salt, must_change_password, avatar, has_custom_avatar,
      approval_status, requested_at, approved_by, approved_at, status_reason,
      migrated_from_google, phone_ext, phone, location, joined_at, active,
      permissoes_paginas, roster_activation_version, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9,
      $10, $11, $12, $13, $14,
      $15, $16, $17, $18, $19,
      $20, $21, $22, $23, $24, $25,
      $26::jsonb, $27, CURRENT_TIMESTAMP
    )
    ${conflictClause}`,
    [
      String(u.id),
      String(u.name || login),
      email,
      login,
      String(u.department || 'Administrativo'),
      role,
      roleTitle,
      String(u.accessLevel || 'FUNCIONARIO').slice(0, 50),
      accessProfile,
      String(u.passwordHash || 'managed'),
      String(u.passwordSalt || ''),
      Boolean(u.mustChangePassword),
      String(u.avatar || ''),
      Boolean(u.hasCustomAvatar),
      String(u.approvalStatus || 'APROVADO'),
      u.requestedAt ? String(u.requestedAt) : new Date().toISOString(),
      u.approvedBy ? String(u.approvedBy) : null,
      u.approvedAt ? String(u.approvedAt) : null,
      u.statusReason ? String(u.statusReason) : null,
      Boolean(u.migratedFromGoogle),
      String(u.phoneExt || '71 9 9920-2476'),
      String(u.phone || u.phoneExt || '71 9 9920-2476'),
      String(u.location || 'BA - Salvador'),
      String(u.joinedAt || '28/10/2026'),
      u.active !== undefined ? Boolean(u.active) : true,
      JSON.stringify(permissoes),
      Number(u.rosterActivationVersion || 1),
    ]
  );
}

async function syncLocalDataToNeon(client: any): Promise<void> {
  const dataDir = path.join(resolveDataRoot(), 'data');

  // 1. Seed Users, AccessPolicy, Decisions, ArchivedUsers & AuditLogs from rodovar-server-db.json
  const dbPath = path.join(dataDir, 'rodovar-server-db.json');
  if (fs.existsSync(dbPath)) {
    const dbRaw = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    const users = Array.isArray(dbRaw.users) ? dbRaw.users : [];
    for (const u of users) {
      await upsertUserRowWithClient(client, u, false).catch(() => {});
    }

    if (dbRaw.accessPolicy) {
      await client.query(
        `INSERT INTO rodovar_access_policy (id, protected_admin_uid, authorized_uids, version, updated_at)
         VALUES ('default', $1, $2::jsonb, $3, CURRENT_TIMESTAMP)
         ON CONFLICT (id) DO UPDATE SET
           protected_admin_uid = CASE WHEN rodovar_access_policy.protected_admin_uid = 'admin' THEN EXCLUDED.protected_admin_uid ELSE rodovar_access_policy.protected_admin_uid END,
           authorized_uids = CASE WHEN rodovar_access_policy.protected_admin_uid = 'admin' OR jsonb_array_length(rodovar_access_policy.authorized_uids) = 0 THEN EXCLUDED.authorized_uids ELSE rodovar_access_policy.authorized_uids END`,
        [
          String(dbRaw.accessPolicy.protectedAdminUid || 'emp-admin-master'),
          JSON.stringify(Array.isArray(dbRaw.accessPolicy.authorizedUids) ? dbRaw.accessPolicy.authorizedUids : users.map((u: any) => u.id)),
          Number(dbRaw.accessPolicy.version || 1),
        ]
      ).catch(() => {});
    }

    const decisions = Array.isArray(dbRaw.accessDecisions) ? dbRaw.accessDecisions : [];
    for (const d of decisions) {
      if (!d || !d.id) continue;
      await client.query(
        `INSERT INTO rodovar_access_decisions (
          id, target_user_id, target_name, target_login, admin_id, admin_name,
          action, new_status, access_level, permissoes_paginas, reason, timestamp_iso, timestamp_formatted
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13)
        ON CONFLICT (id) DO NOTHING`,
        [
          String(d.id),
          String(d.targetUserId || ''),
          String(d.targetName || ''),
          String(d.targetLogin || ''),
          String(d.adminId || ''),
          String(d.adminName || ''),
          String(d.action || 'APROVAR'),
          String(d.newStatus || 'APROVADO'),
          String(d.accessLevel || 'FUNCIONARIO'),
          JSON.stringify(Array.isArray(d.permissoesPaginas) ? d.permissoesPaginas : []),
          d.reason ? String(d.reason) : null,
          String(d.timestampIso || new Date().toISOString()),
          String(d.timestampFormatted || ''),
        ]
      ).catch(() => {});
    }

    const archived = Array.isArray(dbRaw.archivedUsers) ? dbRaw.archivedUsers : [];
    for (const a of archived) {
      if (!a || !a.user || !a.user.id) continue;
      await client.query(
        `INSERT INTO rodovar_archived_users (user_id, user_snapshot, deleted_at_iso, deleted_by_id, reason)
         VALUES ($1, $2::jsonb, $3, $4, $5)
         ON CONFLICT (user_id) DO NOTHING`,
        [
          String(a.user.id),
          JSON.stringify(a.user),
          String(a.deletedAtIso || new Date().toISOString()),
          String(a.deletedById || 'emp-admin-master'),
          String(a.reason || ''),
        ]
      ).catch(() => {});
    }

    await client.query(
      `INSERT INTO rodovar_state_store (key, payload, updated_at)
       VALUES ($1, $2::jsonb, CURRENT_TIMESTAMP)
       ON CONFLICT (key) DO NOTHING`,
      [
        'rodovar-server-db',
        JSON.stringify({
          systemConfig: dbRaw.systemConfig,
          accessPolicy: dbRaw.accessPolicy,
          userCount: users.length,
        }),
      ]
    );
  }

  // 2. Seed Unified Freights from data/freights-store/*.json + payment-store/freights.json
  const freightsDir = path.join(dataDir, 'freights-store');
  if (fs.existsSync(freightsDir)) {
    const files = fs
      .readdirSync(freightsDir)
      .filter((f) => f.startsWith('frete-') && f.endsWith('.json') && !f.endsWith('.sub.json'));
    for (const file of files) {
      const f = JSON.parse(fs.readFileSync(path.join(freightsDir, file), 'utf8'));
      if (!f || !f.id || !f.protocol) continue;
      const destParts = String(f.destinoCidadeUf || '').split('/');
      const destCity = (destParts[0] || f.destinoCidadeUf || 'Destino').trim();
      const destState = (destParts[1] || 'BR').trim().slice(0, 8);
      const agreedReais = Number(((f.valorCobradoClienteCentavos || f.valorContratadoCentavos || 0) / 100).toFixed(2));
      await client.query(
        `INSERT INTO rodovar_fretes (
           id, sequential_id, client_name, client_cnpj, origin,
           destination_city, destination_state, destination_address, cargo_description,
           agreed_value, driver_name, driver_cpf, driver_phone, truck_plate, status,
           situacao_comercial, situacao_operacional, situacao_monitoramento,
           comercial_responsavel_id, expedicao_responsavel_id, monitoramento_responsavel_id,
           data_coleta_iso, data_entrega_prevista_iso, entrega_comprovada_em, payload, updated_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25::jsonb,COALESCE($26::timestamptz, CURRENT_TIMESTAMP))
         ON CONFLICT (id) DO UPDATE SET
           situacao_comercial = COALESCE(rodovar_fretes.situacao_comercial, EXCLUDED.situacao_comercial),
           situacao_operacional = COALESCE(rodovar_fretes.situacao_operacional, EXCLUDED.situacao_operacional),
           situacao_monitoramento = COALESCE(rodovar_fretes.situacao_monitoramento, EXCLUDED.situacao_monitoramento),
           comercial_responsavel_id = COALESCE(rodovar_fretes.comercial_responsavel_id, EXCLUDED.comercial_responsavel_id),
           expedicao_responsavel_id = COALESCE(rodovar_fretes.expedicao_responsavel_id, EXCLUDED.expedicao_responsavel_id),
           monitoramento_responsavel_id = COALESCE(rodovar_fretes.monitoramento_responsavel_id, EXCLUDED.monitoramento_responsavel_id),
           data_coleta_iso = COALESCE(rodovar_fretes.data_coleta_iso, EXCLUDED.data_coleta_iso),
           data_entrega_prevista_iso = COALESCE(rodovar_fretes.data_entrega_prevista_iso, EXCLUDED.data_entrega_prevista_iso),
           entrega_comprovada_em = COALESCE(rodovar_fretes.entrega_comprovada_em, EXCLUDED.entrega_comprovada_em),
           payload = COALESCE(rodovar_fretes.payload, EXCLUDED.payload)`,
        [
          String(f.id),
          String(f.protocol),
          String(f.cliente || 'Cliente'),
          f.clienteCnpj ? String(f.clienteCnpj).slice(0, 32) : null,
          String(f.origemCidadeUf || 'Origem'),
          destCity,
          destState || 'BR',
          f.enderecoEntrega ? String(f.enderecoEntrega) : null,
          f.tipoCarga ? String(f.tipoCarga) : null,
          agreedReais,
          f.motoristaNome ? String(f.motoristaNome) : null,
          f.motoristaCpf ? String(f.motoristaCpf).slice(0, 32) : null,
          f.motoristaTelefone ? String(f.motoristaTelefone).slice(0, 64) : null,
          f.placaVeiculo ? String(f.placaVeiculo).slice(0, 32) : null,
          String(f.situacaoMonitoramento !== 'NAO_LIBERADO' ? f.situacaoMonitoramento : f.situacaoOperacional !== 'NAO_ENVIADO' ? f.situacaoOperacional : f.situacaoComercial || 'EM_NEGOCIACAO').slice(0, 64),
          f.situacaoComercial ? String(f.situacaoComercial).slice(0, 64) : null,
          f.situacaoOperacional ? String(f.situacaoOperacional).slice(0, 64) : null,
          f.situacaoMonitoramento ? String(f.situacaoMonitoramento).slice(0, 64) : null,
          f.comercialResponsavelId ? String(f.comercialResponsavelId).slice(0, 64) : null,
          f.expedicaoResponsavelId ? String(f.expedicaoResponsavelId).slice(0, 64) : null,
          f.monitoramentoResponsavelId ? String(f.monitoramentoResponsavelId).slice(0, 64) : null,
          f.dataColetaIso ? String(f.dataColetaIso).slice(0, 32) : null,
          f.dataEntregaPrevistaIso ? String(f.dataEntregaPrevistaIso).slice(0, 32) : null,
          f.entregaComprovadaEm ? String(f.entregaComprovadaEm).slice(0, 64) : null,
          JSON.stringify(f),
          f.updatedAtIso ? String(f.updatedAtIso) : null,
        ]
      ).catch(() => {});
    }
  }

  const paymentFreightsPath = path.join(dataDir, 'payment-store', 'freights.json');
  if (fs.existsSync(paymentFreightsPath)) {
    const pfList = JSON.parse(fs.readFileSync(paymentFreightsPath, 'utf8'));
    if (Array.isArray(pfList)) {
      for (const pf of pfList) {
        if (!pf || !pf.id || !pf.code) continue;
        await client.query(
          `INSERT INTO rodovar_fretes (
             id, sequential_id, client_name, client_cnpj, origin,
             destination_city, destination_state, destination_address, cargo_description,
             agreed_value, driver_name, driver_cpf, driver_phone, truck_plate, status
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
           ON CONFLICT (id) DO NOTHING`,
          [
            String(pf.id),
            String(pf.code),
            String(pf.cliente || 'Cliente'),
            null,
            String(pf.origem || 'Origem'),
            String(pf.destino || 'Destino').slice(0, 255),
            'BA',
            String(pf.destino || ''),
            'Frete Financeiro',
            Number(pf.valorTotal || pf.valorFreteMotorista || 0),
            pf.motoristaNome ? String(pf.motoristaNome) : null,
            null,
            pf.motoristaTelefone ? String(pf.motoristaTelefone).slice(0, 64) : null,
            null,
            String(pf.status || 'Pendente').slice(0, 64),
          ]
        ).catch(() => {});
      }
    }
  }

  // 3. Seed Internal Requests from data/requests-server.json
  const reqPath = path.join(dataDir, 'requests-server.json');
  if (fs.existsSync(reqPath)) {
    const reqState = JSON.parse(fs.readFileSync(reqPath, 'utf8'));
    const requests = Array.isArray(reqState.requests) ? reqState.requests : [];
    for (const r of requests) {
      if (!r || !r.id) continue;
      await client.query(
        `INSERT INTO rodovar_requests (id, title, department, requester_name, status, details)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO NOTHING`,
        [
          String(r.id),
          String(r.subject || r.protocol || 'Solicitação').slice(0, 255),
          String(r.targetDepartment || 'Administrativo').slice(0, 100),
          String(r.requesterName || 'Colaborador').slice(0, 255),
          String(r.status || 'Aberta').slice(0, 64),
          String(r.description || ''),
        ]
      ).catch(() => {});
    }
  }

  // 4. Seed Payments from data/payment-store/receipts.json
  const receiptsPath = path.join(dataDir, 'payment-store', 'receipts.json');
  if (fs.existsSync(receiptsPath)) {
    const receipts = JSON.parse(fs.readFileSync(receiptsPath, 'utf8'));
    if (Array.isArray(receipts)) {
      for (const rec of receipts) {
        if (!rec || !rec.id || !rec.freightId) continue;
        await client.query(
          `INSERT INTO rodovar_payments (id, frete_id, type, amount, status)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (id) DO NOTHING`,
          [
            String(rec.id),
            String(rec.freightId),
            String(rec.installmentType || 'ADIANTAMENTO').slice(0, 64),
            Number(rec.expectedAmountBRL || (rec.expectedAmountCentavos || 0) / 100),
            String(rec.verificationStatus || rec.uploadStatus || 'SALVO_NO_SERVIDOR').slice(0, 64),
          ]
        ).catch(() => {});
      }
    }
  }

  // 5. Seed Announcements (Mural) from rodovar-server-db.json
  if (fs.existsSync(dbPath)) {
    try {
      const dbRaw = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
      const announcements = dbRaw.mural?.announcements || [];
      for (const a of announcements) {
        if (!a || !a.id || !a.title) continue;
        await client.query(
          `INSERT INTO rodovar_announcements (id, title, author_name, target_audience, priority, content, data)
           VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
           ON CONFLICT (id) DO NOTHING`,
          [
            String(a.id),
            String(a.title).slice(0, 255),
            String(a.authorName || 'Diretoria').slice(0, 255),
            String(a.targetAudience || 'Todos').slice(0, 100),
            String(a.priority || 'Normal').slice(0, 50),
            String(a.content || a.summary || ''),
            JSON.stringify(a),
          ]
        ).catch(() => {});
      }
      if (announcements.length > 0) {
        await client.query(
          `INSERT INTO rodovar_state_store (key, payload, updated_at)
           VALUES ('rodovar-mural', $1::jsonb, CURRENT_TIMESTAMP)
           ON CONFLICT (key) DO NOTHING`,
          [JSON.stringify(dbRaw.mural)]
        );
      }
    } catch (e) {
      console.warn('Neon announcements sync notice:', (e as Error).message);
    }
  }

  // 6. Seed Corporate Agenda from data/agenda-local.json
  const agendaPath = path.join(dataDir, 'agenda-local.json');
  if (fs.existsSync(agendaPath)) {
    try {
      const agendaRaw = JSON.parse(fs.readFileSync(agendaPath, 'utf8'));
      const events = Array.isArray(agendaRaw.events) ? agendaRaw.events : [];
      for (const e of events) {
        if (!e || !e.id || !e.title) continue;
        await client.query(
          `INSERT INTO rodovar_agenda (id, title, date_iso, start_time, end_time, category, data)
           VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
           ON CONFLICT (id) DO NOTHING`,
          [
            String(e.id),
            String(e.title).slice(0, 255),
            String(e.dateIso || new Date().toISOString().slice(0, 10)).slice(0, 32),
            String(e.start || '08:00').slice(0, 16),
            String(e.end || '09:00').slice(0, 16),
            String(e.category || 'Geral').slice(0, 100),
            JSON.stringify(e),
          ]
        ).catch(() => {});
      }
      await client.query(
        `INSERT INTO rodovar_state_store (key, payload, updated_at)
         VALUES ('rodovar-agenda', $1::jsonb, CURRENT_TIMESTAMP)
         ON CONFLICT (key) DO NOTHING`,
        [JSON.stringify(agendaRaw)]
      );
    } catch (e) {
      console.warn('Neon agenda sync notice:', (e as Error).message);
    }
  }
}

function mapRowToServerUserRecord(row: any): any {
  const permissoes = Array.isArray(row.permissoes_paginas)
    ? row.permissoes_paginas
    : typeof row.permissoes_paginas === 'string'
    ? JSON.parse(row.permissoes_paginas || '[]')
    : [];
  return {
    id: String(row.id),
    name: String(row.name || row.login || row.email),
    email: String(row.email),
    login: String(row.login || row.email),
    passwordHash: String(row.password_hash || ''),
    passwordSalt: String(row.password_salt || ''),
    mustChangePassword: Boolean(row.must_change_password),
    roleTitle: String(row.role_title || row.role || 'Colaborador'),
    department: String(row.department || 'Administrativo'),
    accessLevel: String(row.access_level || 'FUNCIONARIO'),
    ...(row.access_profile ? { accessProfile: String(row.access_profile) } : {}),
    avatar: String(row.avatar || ''),
    hasCustomAvatar: Boolean(row.has_custom_avatar),
    approvalStatus: String(row.approval_status || 'APROVADO'),
    requestedAt: String(row.requested_at || new Date().toISOString()),
    ...(row.approved_by ? { approvedBy: String(row.approved_by) } : {}),
    ...(row.approved_at ? { approvedAt: String(row.approved_at) } : {}),
    ...(row.status_reason ? { statusReason: String(row.status_reason) } : {}),
    migratedFromGoogle: Boolean(row.migrated_from_google),
    phoneExt: String(row.phone_ext || row.phone || '71 9 9920-2476'),
    phone: String(row.phone || row.phone_ext || '71 9 9920-2476'),
    location: String(row.location || 'BA - Salvador'),
    joinedAt: String(row.joined_at || '28/10/2026'),
    active: row.active !== undefined && row.active !== null ? Boolean(row.active) : true,
    permissoesPaginas: permissoes,
    rosterActivationVersion: Number(row.roster_activation_version || 1),
  };
}

// Live persistence helpers for mutation operations (Stateless HTTP sql driver for Neon Free scalability)
export async function persistUserToNeon(u: any): Promise<void> {
  if (!isNeonConfigured || isIsolatedTestEnv() || !sql || !u || !u.id) return;
  try {
    const email = String(u.email || (String(u.login).includes('@') ? u.login : `${u.login}@rodovar.com.br`));
    const login = String(u.login || email);
    const role = String(u.accessProfile || u.roleTitle || 'COLABORADOR').slice(0, 100);
    const roleTitle = String(u.roleTitle || u.accessProfile || 'Colaborador').slice(0, 150);
    const accessProfile = u.accessProfile ? String(u.accessProfile).slice(0, 50) : null;
    const permissoes = JSON.stringify(Array.isArray(u.permissoesPaginas) ? u.permissoesPaginas : []);
    await sql`
      INSERT INTO rodovar_users (
        id, name, email, login, department, role, role_title, access_level, access_profile,
        password_hash, password_salt, must_change_password, avatar, has_custom_avatar,
        approval_status, requested_at, approved_by, approved_at, status_reason,
        migrated_from_google, phone_ext, phone, location, joined_at, active,
        permissoes_paginas, roster_activation_version, updated_at
      ) VALUES (
        ${String(u.id)}, ${String(u.name || login)}, ${email}, ${login},
        ${String(u.department || 'Administrativo')}, ${role}, ${roleTitle},
        ${String(u.accessLevel || 'FUNCIONARIO').slice(0, 50)}, ${accessProfile},
        ${String(u.passwordHash || 'managed')}, ${String(u.passwordSalt || '')},
        ${Boolean(u.mustChangePassword)}, ${String(u.avatar || '')}, ${Boolean(u.hasCustomAvatar)},
        ${String(u.approvalStatus || 'APROVADO')}, ${u.requestedAt ? String(u.requestedAt) : new Date().toISOString()},
        ${u.approvedBy ? String(u.approvedBy) : null}, ${u.approvedAt ? String(u.approvedAt) : null},
        ${u.statusReason ? String(u.statusReason) : null}, ${Boolean(u.migratedFromGoogle)},
        ${String(u.phoneExt || '71 9 9920-2476')}, ${String(u.phone || u.phoneExt || '71 9 9920-2476')},
        ${String(u.location || 'BA - Salvador')}, ${String(u.joinedAt || '28/10/2026')},
        ${u.active !== undefined ? Boolean(u.active) : true}, ${permissoes}::jsonb,
        ${Number(u.rosterActivationVersion || 1)}, CURRENT_TIMESTAMP
      )
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        email = EXCLUDED.email,
        login = EXCLUDED.login,
        department = EXCLUDED.department,
        role = EXCLUDED.role,
        role_title = EXCLUDED.role_title,
        access_level = EXCLUDED.access_level,
        access_profile = EXCLUDED.access_profile,
        password_hash = EXCLUDED.password_hash,
        password_salt = EXCLUDED.password_salt,
        must_change_password = EXCLUDED.must_change_password,
        avatar = EXCLUDED.avatar,
        has_custom_avatar = EXCLUDED.has_custom_avatar,
        approval_status = EXCLUDED.approval_status,
        requested_at = EXCLUDED.requested_at,
        approved_by = EXCLUDED.approved_by,
        approved_at = EXCLUDED.approved_at,
        status_reason = EXCLUDED.status_reason,
        migrated_from_google = EXCLUDED.migrated_from_google,
        phone_ext = EXCLUDED.phone_ext,
        phone = EXCLUDED.phone,
        location = EXCLUDED.location,
        joined_at = EXCLUDED.joined_at,
        active = EXCLUDED.active,
        permissoes_paginas = EXCLUDED.permissoes_paginas,
        roster_activation_version = EXCLUDED.roster_activation_version,
        updated_at = CURRENT_TIMESTAMP
    `;
  } catch (err) {
    console.warn('Neon persistUserToNeon error:', (err as Error).message);
  }
}

export async function deleteUserFromNeon(userId: string, archived?: any): Promise<void> {
  if (!isNeonConfigured || isIsolatedTestEnv() || !sql || !userId) return;
  try {
    if (archived && archived.user) {
      await sql`
        INSERT INTO rodovar_archived_users (user_id, user_snapshot, deleted_at_iso, deleted_by_id, reason)
        VALUES (${String(userId)}, ${JSON.stringify(archived.user)}::jsonb, ${String(archived.deletedAtIso || new Date().toISOString())}, ${String(archived.deletedById || 'emp-admin-master')}, ${String(archived.reason || '')})
        ON CONFLICT (user_id) DO UPDATE SET
          user_snapshot = EXCLUDED.user_snapshot,
          deleted_at_iso = EXCLUDED.deleted_at_iso,
          deleted_by_id = EXCLUDED.deleted_by_id,
          reason = EXCLUDED.reason
      `;
    }
    await Promise.all([
      sql`DELETE FROM rodovar_password_reset_tokens WHERE user_id = ${userId}`,
      sql`DELETE FROM rodovar_login_locks WHERE identifier = ${`user:${userId}`}`,
      sql`DELETE FROM rodovar_users WHERE id = ${userId}`,
    ]);
  } catch (err) {
    console.warn('Neon deleteUserFromNeon error:', (err as Error).message);
  }
}

export async function loadAllUsersFromNeon(): Promise<any[]> {
  if (!isNeonConfigured || isIsolatedTestEnv() || !sql) return [];
  try {
    const rows = await sql`SELECT * FROM rodovar_users ORDER BY created_at ASC`;
    return rows.map(mapRowToServerUserRecord);
  } catch (err) {
    console.warn('Neon loadAllUsersFromNeon notice:', (err as Error).message);
    return [];
  }
}

export async function persistAccessPolicyToNeon(policy: {
  protectedAdminUid: string;
  authorizedUids: string[];
  version: number;
}): Promise<void> {
  if (!isNeonConfigured || isIsolatedTestEnv() || !sql || !policy) return;
  try {
    await sql`
      INSERT INTO rodovar_access_policy (id, protected_admin_uid, authorized_uids, version, updated_at)
      VALUES ('default', ${String(policy.protectedAdminUid || 'emp-admin-master')}, ${JSON.stringify(Array.isArray(policy.authorizedUids) ? policy.authorizedUids : [])}::jsonb, ${Number(policy.version || 1)}, CURRENT_TIMESTAMP)
      ON CONFLICT (id) DO UPDATE SET
        protected_admin_uid = EXCLUDED.protected_admin_uid,
        authorized_uids = EXCLUDED.authorized_uids,
        version = EXCLUDED.version,
        updated_at = CURRENT_TIMESTAMP
    `;
  } catch (err) {
    console.warn('Neon persistAccessPolicyToNeon error:', (err as Error).message);
  }
}

export async function loadAccessPolicyFromNeon(): Promise<{
  protectedAdminUid: string;
  authorizedUids: string[];
  version: number;
} | null> {
  if (!isNeonConfigured || isIsolatedTestEnv() || !sql) return null;
  try {
    const rows = await sql`SELECT * FROM rodovar_access_policy WHERE id = 'default' LIMIT 1`;
    if (rows.length > 0) {
      const r = rows[0];
      return {
        protectedAdminUid: String(r.protected_admin_uid || 'emp-admin-master'),
        authorizedUids: Array.isArray(r.authorized_uids) ? r.authorized_uids : [],
        version: Number(r.version || 1),
      };
    }
  } catch {
    return null;
  }
  return null;
}

export async function persistLoginLockToNeon(lock: {
  identifier: string;
  consecutiveFailures: number;
  blockedUntil: number | null;
  lastFailureAt: number;
}): Promise<void> {
  if (!isNeonConfigured || isIsolatedTestEnv() || !sql || !lock || !lock.identifier) return;
  try {
    await sql`
      INSERT INTO rodovar_login_locks (identifier, consecutive_failures, blocked_until, last_failure_at, updated_at)
      VALUES (${String(lock.identifier)}, ${Number(lock.consecutiveFailures || 0)}, ${lock.blockedUntil ? Number(lock.blockedUntil) : null}, ${Number(lock.lastFailureAt || 0)}, CURRENT_TIMESTAMP)
      ON CONFLICT (identifier) DO UPDATE SET
        consecutive_failures = EXCLUDED.consecutive_failures,
        blocked_until = EXCLUDED.blocked_until,
        last_failure_at = EXCLUDED.last_failure_at,
        updated_at = CURRENT_TIMESTAMP
    `;
  } catch (err) {
    console.warn('Neon persistLoginLockToNeon error:', (err as Error).message);
  }
}

export async function loadLoginLocksFromNeon(): Promise<Record<string, {
  identifier: string;
  consecutiveFailures: number;
  blockedUntil: number | null;
  lastFailureAt: number;
}>> {
  if (!isNeonConfigured || isIsolatedTestEnv() || !sql) return {};
  try {
    const rows = await sql`SELECT * FROM rodovar_login_locks`;
    const out: Record<string, any> = {};
    for (const r of rows) {
      out[String(r.identifier)] = {
        identifier: String(r.identifier),
        consecutiveFailures: Number(r.consecutive_failures || 0),
        blockedUntil: r.blocked_until !== null && r.blocked_until !== undefined ? Number(r.blocked_until) : null,
        lastFailureAt: Number(r.last_failure_at || 0),
      };
    }
    return out;
  } catch {
    return {};
  }
}

export async function persistPasswordResetTokenToNeon(token: {
  tokenHash: string;
  userId: string;
  createdAt: number;
  expiresAt: number;
  used: boolean;
  onboarding?: boolean;
}): Promise<void> {
  if (!isNeonConfigured || isIsolatedTestEnv() || !sql || !token || !token.tokenHash) return;
  try {
    await sql`
      INSERT INTO rodovar_password_reset_tokens (token_hash, user_id, created_at, expires_at, used, onboarding)
      VALUES (${String(token.tokenHash)}, ${String(token.userId)}, ${Number(token.createdAt || Date.now())}, ${Number(token.expiresAt)}, ${Boolean(token.used)}, ${Boolean(token.onboarding)})
      ON CONFLICT (token_hash) DO UPDATE SET
        used = EXCLUDED.used,
        expires_at = EXCLUDED.expires_at,
        onboarding = EXCLUDED.onboarding
    `;
  } catch (err) {
    console.warn('Neon persistPasswordResetTokenToNeon error:', (err as Error).message);
  }
}

export async function markUserPasswordResetTokensUsedInNeon(userId: string): Promise<void> {
  if (!isNeonConfigured || isIsolatedTestEnv() || !sql || !userId) return;
  try {
    await sql`UPDATE rodovar_password_reset_tokens SET used = TRUE WHERE user_id = ${String(userId)}`;
  } catch (err) {
    console.warn('Neon markUserPasswordResetTokensUsedInNeon error:', (err as Error).message);
  }
}

export async function loadPasswordResetTokensFromNeon(): Promise<any[]> {
  if (!isNeonConfigured || isIsolatedTestEnv() || !sql) return [];
  try {
    const cutoff = Date.now() - 86400000;
    const rows = await sql`SELECT * FROM rodovar_password_reset_tokens WHERE expires_at > ${cutoff}`;
    return rows.map((r) => ({
      tokenHash: String(r.token_hash),
      userId: String(r.user_id),
      createdAt: Number(r.created_at),
      expiresAt: Number(r.expires_at),
      used: Boolean(r.used),
      ...(r.onboarding ? { onboarding: true } : {}),
    }));
  } catch {
    return [];
  }
}

export async function persistAccessDecisionToNeon(d: any): Promise<void> {
  if (!isNeonConfigured || isIsolatedTestEnv() || !sql || !d || !d.id) return;
  try {
    await sql`
      INSERT INTO rodovar_access_decisions (
        id, target_user_id, target_name, target_login, admin_id, admin_name,
        action, new_status, access_level, permissoes_paginas, reason, timestamp_iso, timestamp_formatted
      ) VALUES (
        ${String(d.id)}, ${String(d.targetUserId || '')}, ${String(d.targetName || '')}, ${String(d.targetLogin || '')},
        ${String(d.adminId || '')}, ${String(d.adminName || '')}, ${String(d.action || 'APROVAR')},
        ${String(d.newStatus || 'APROVADO')}, ${String(d.accessLevel || 'FUNCIONARIO')},
        ${JSON.stringify(Array.isArray(d.permissoesPaginas) ? d.permissoesPaginas : [])}::jsonb,
        ${d.reason ? String(d.reason) : null}, ${String(d.timestampIso || new Date().toISOString())},
        ${String(d.timestampFormatted || '')}
      )
      ON CONFLICT (id) DO NOTHING
    `;
  } catch (err) {
    console.warn('Neon persistAccessDecisionToNeon error:', (err as Error).message);
  }
}

export async function loadAccessDecisionsFromNeon(limit = 100): Promise<any[]> {
  if (!isNeonConfigured || isIsolatedTestEnv() || !sql) return [];
  try {
    const rows = await sql`SELECT * FROM rodovar_access_decisions ORDER BY timestamp_iso DESC LIMIT ${limit}`;
    return rows.map((r) => ({
      id: String(r.id),
      targetUserId: String(r.target_user_id),
      targetName: String(r.target_name),
      targetLogin: String(r.target_login),
      adminId: String(r.admin_id),
      adminName: String(r.admin_name),
      action: String(r.action),
      newStatus: String(r.new_status),
      accessLevel: String(r.access_level),
      permissoesPaginas: Array.isArray(r.permissoes_paginas) ? r.permissoes_paginas : [],
      ...(r.reason ? { reason: String(r.reason) } : {}),
      timestampIso: String(r.timestamp_iso),
      timestampFormatted: String(r.timestamp_formatted),
    }));
  } catch {
    return [];
  }
}

export async function persistSessionRevocationToNeon(sessionId: string, userId?: string): Promise<void> {
  if (!isNeonConfigured || isIsolatedTestEnv() || !sql || !sessionId) return;
  try {
    await sql`
      INSERT INTO rodovar_revoked_sessions (session_id, user_id, revoked_at)
      VALUES (${String(sessionId)}, ${userId ? String(userId) : null}, ${Date.now()})
      ON CONFLICT (session_id) DO NOTHING
    `;
  } catch {}
}

export async function persistUserSessionsRevocationToNeon(userId: string, revokedAfterMs: number): Promise<void> {
  if (!isNeonConfigured || isIsolatedTestEnv() || !sql || !userId) return;
  try {
    await sql`
      INSERT INTO rodovar_user_revocations (user_id, revoked_after_ms)
      VALUES (${String(userId)}, ${Number(revokedAfterMs)})
      ON CONFLICT (user_id) DO UPDATE SET revoked_after_ms = EXCLUDED.revoked_after_ms
    `;
  } catch {}
}

export async function loadSessionRevocationsFromNeon(): Promise<{
  revokedSessions: string[];
  userRevocations: Record<string, number>;
}> {
  if (!isNeonConfigured || isIsolatedTestEnv() || !sql) {
    return { revokedSessions: [], userRevocations: {} };
  }
  try {
    const cutoff = Date.now() - 15 * 86400000;
    const [sessRows, userRows] = await Promise.all([
      sql`SELECT session_id FROM rodovar_revoked_sessions WHERE revoked_at > ${cutoff}`,
      sql`SELECT user_id, revoked_after_ms FROM rodovar_user_revocations`,
    ]);
    const userRevocations: Record<string, number> = {};
    for (const r of userRows) {
      userRevocations[String(r.user_id)] = Number(r.revoked_after_ms);
    }
    return {
      revokedSessions: sessRows.map((r) => String(r.session_id)),
      userRevocations,
    };
  } catch {
    return { revokedSessions: [], userRevocations: {} };
  }
}

export async function persistFreightToNeon(f: any): Promise<void> {
  if (!isNeonConfigured || isIsolatedTestEnv() || !sql || !f || !f.id) return;
  try {
    const seqId = String(f.protocol || f.code || f.id).slice(0, 32);
    const destRaw = String(f.destinoCidadeUf || f.destino || 'Destino');
    const destParts = destRaw.split('/');
    const destCity = (destParts[0] || destRaw).trim().slice(0, 255) || 'Destino';
    const destState = (destParts[1] || 'BA').trim().slice(0, 8) || 'BA';
    const agreedReais =
      typeof f.valorTotal === 'number'
        ? Number(f.valorTotal.toFixed(2))
        : Number(
            (
              (f.valorCobradoClienteCentavos ||
                f.valorContratadoCentavos ||
                f.valorFreteMotoristaCentavos ||
                0) / 100
            ).toFixed(2)
          );
    const status = String(
      f.situacaoMonitoramento && f.situacaoMonitoramento !== 'NAO_LIBERADO'
        ? f.situacaoMonitoramento
        : f.situacaoOperacional && f.situacaoOperacional !== 'NAO_ENVIADO'
        ? f.situacaoOperacional
        : f.situacaoComercial || f.status || 'EM_ANDAMENTO'
    ).slice(0, 64);

    const payloadJson = JSON.stringify(f);
    const updatedAtIso = f.updatedAtIso ? String(f.updatedAtIso) : null;

    await sql`
      INSERT INTO rodovar_fretes (
         id, sequential_id, client_name, client_cnpj, origin,
         destination_city, destination_state, destination_address, cargo_description,
         agreed_value, driver_name, driver_cpf, driver_phone, truck_plate, status,
         situacao_comercial, situacao_operacional, situacao_monitoramento,
         comercial_responsavel_id, expedicao_responsavel_id, monitoramento_responsavel_id,
         data_coleta_iso, data_entrega_prevista_iso, entrega_comprovada_em, payload, updated_at
       ) VALUES (
         ${String(f.id).slice(0, 64)}, ${seqId}, ${String(f.cliente || 'Cliente').slice(0, 255)},
         ${f.clienteCnpj ? String(f.clienteCnpj).slice(0, 32) : null},
         ${String(f.origemCidadeUf || f.origem || 'Origem').slice(0, 255)},
         ${destCity}, ${destState}, ${f.enderecoEntrega ? String(f.enderecoEntrega) : null},
         ${f.tipoCarga ? String(f.tipoCarga) : null}, ${agreedReais},
         ${f.motoristaNome ? String(f.motoristaNome).slice(0, 255) : null},
         ${f.motoristaCpf ? String(f.motoristaCpf).slice(0, 32) : null},
         ${f.motoristaTelefone ? String(f.motoristaTelefone).slice(0, 64) : null},
         ${f.placaVeiculo ? String(f.placaVeiculo).slice(0, 32) : null},
         ${status},
         ${f.situacaoComercial ? String(f.situacaoComercial).slice(0, 64) : null},
         ${f.situacaoOperacional ? String(f.situacaoOperacional).slice(0, 64) : null},
         ${f.situacaoMonitoramento ? String(f.situacaoMonitoramento).slice(0, 64) : null},
         ${f.comercialResponsavelId ? String(f.comercialResponsavelId).slice(0, 64) : null},
         ${f.expedicaoResponsavelId ? String(f.expedicaoResponsavelId).slice(0, 64) : null},
         ${f.monitoramentoResponsavelId ? String(f.monitoramentoResponsavelId).slice(0, 64) : null},
         ${f.dataColetaIso ? String(f.dataColetaIso).slice(0, 32) : null},
         ${f.dataEntregaPrevistaIso ? String(f.dataEntregaPrevistaIso).slice(0, 32) : null},
         ${f.entregaComprovadaEm ? String(f.entregaComprovadaEm).slice(0, 64) : null},
         ${payloadJson}::jsonb,
         COALESCE(${updatedAtIso}::timestamptz, CURRENT_TIMESTAMP)
       )
       ON CONFLICT (id) DO UPDATE SET
         sequential_id = EXCLUDED.sequential_id,
         client_name = EXCLUDED.client_name,
         client_cnpj = EXCLUDED.client_cnpj,
         origin = EXCLUDED.origin,
         destination_city = EXCLUDED.destination_city,
         destination_state = EXCLUDED.destination_state,
         destination_address = EXCLUDED.destination_address,
         cargo_description = EXCLUDED.cargo_description,
         agreed_value = EXCLUDED.agreed_value,
         driver_name = EXCLUDED.driver_name,
         driver_cpf = EXCLUDED.driver_cpf,
         driver_phone = EXCLUDED.driver_phone,
         truck_plate = EXCLUDED.truck_plate,
         status = EXCLUDED.status,
         situacao_comercial = EXCLUDED.situacao_comercial,
         situacao_operacional = EXCLUDED.situacao_operacional,
         situacao_monitoramento = EXCLUDED.situacao_monitoramento,
         comercial_responsavel_id = EXCLUDED.comercial_responsavel_id,
         expedicao_responsavel_id = EXCLUDED.expedicao_responsavel_id,
         monitoramento_responsavel_id = EXCLUDED.monitoramento_responsavel_id,
         data_coleta_iso = EXCLUDED.data_coleta_iso,
         data_entrega_prevista_iso = EXCLUDED.data_entrega_prevista_iso,
         entrega_comprovada_em = EXCLUDED.entrega_comprovada_em,
         payload = EXCLUDED.payload,
         updated_at = EXCLUDED.updated_at
    `;
  } catch (err) {
    console.warn('Neon persistFreightToNeon notice:', (err as Error).message);
  }
}

export interface NeonMonitoringQueryParams {
  scope: 'MEUS' | 'EQUIPE';
  userId: string;
  isTesteLogin: boolean;
  responsavelFilterId: string;
  viewMode: 'ATIVOS' | 'FINALIZADOS' | 'ALL';
  search: string;
  periodo: string;
  situacao: string;
  includeCanceled: boolean;
  todaySp: string;
  weekStartIso: string;
  weekEndIso: string;
  monthPrefix: string;
  page: number;
  limit: number;
  compact?: boolean;
}

export async function queryMonitoringFreightsFromNeon(params: NeonMonitoringQueryParams): Promise<{
  items: any[];
  totalMatched: number;
  counters: {
    NOVO_PARA_CARREGAR: number;
    EM_DESLOCAMENTO_COLETA: number;
    NO_LOCAL_COLETA: number;
    CARREGADO_EM_TRANSPORTE: number;
    NO_LOCAL_ENTREGA: number;
    ENTREGUE: number;
    FINALIZADO: number;
    PENDENCIAS: number;
    COLETAS_HOJE: number;
    TOTAL_ATIVOS: number;
    completedCount: number;
  };
} | null> {
  if (!isNeonConfigured || isIsolatedTestEnv() || !sql) return null;
  try {
    const searchLike = params.search ? `%${params.search.toLowerCase()}%` : '';
    const offset = Math.max(0, (Math.max(1, params.page) - 1) * Math.max(1, params.limit));
    const respFilter = params.responsavelFilterId || '';
    const situacao = params.situacao || 'TODAS';
    const periodo = params.periodo || 'TODOS';

    const [counterRows, listRows] = await Promise.all([
      sql`
        SELECT
          COUNT(*) FILTER (WHERE situacao_monitoramento = 'NOVO_PARA_CARREGAR')::int AS novo_para_carregar,
          COUNT(*) FILTER (WHERE situacao_monitoramento = 'EM_DESLOCAMENTO_COLETA')::int AS em_deslocamento_coleta,
          COUNT(*) FILTER (WHERE situacao_monitoramento = 'NO_LOCAL_COLETA')::int AS no_local_coleta,
          COUNT(*) FILTER (WHERE situacao_monitoramento = 'CARREGADO_EM_TRANSPORTE')::int AS carregado_em_transporte,
          COUNT(*) FILTER (WHERE situacao_monitoramento = 'NO_LOCAL_ENTREGA')::int AS no_local_entrega,
          COUNT(*) FILTER (WHERE situacao_monitoramento = 'ENTREGUE')::int AS entregue,
          COUNT(*) FILTER (WHERE situacao_monitoramento = 'FINALIZADO')::int AS finalizado,
          COUNT(*) FILTER (
            WHERE data_coleta_iso = ${params.todaySp}
              AND situacao_monitoramento IN ('NOVO_PARA_CARREGAR','EM_DESLOCAMENTO_COLETA','NO_LOCAL_COLETA','CARREGADO_EM_TRANSPORTE','NO_LOCAL_ENTREGA')
          )::int AS coletas_hoje,
          COUNT(*) FILTER (
            WHERE (
              COALESCE((payload->>'ocorrenciasAbertasCount')::int, 0) > 0
              OR COALESCE((payload->>'requerReconfirmacaoOperacional')::boolean, false) = true
              OR (situacao_monitoramento = 'ENTREGUE' AND COALESCE((payload->>'comprovanteEntregaConferido')::boolean, false) = false)
            )
          )::int AS pendencias
        FROM rodovar_fretes
        WHERE payload IS NOT NULL
          AND situacao_monitoramento IS NOT NULL
          AND situacao_monitoramento NOT IN ('NAO_LIBERADO', 'DEVOLVIDO_EXPEDICAO')
          AND (
            ${params.includeCanceled}::boolean = true
            OR (
              COALESCE(situacao_comercial, '') <> 'CANCELADO'
              AND COALESCE(situacao_operacional, '') <> 'CANCELADO'
              AND situacao_monitoramento <> 'CANCELADO'
            )
          )
          AND (
            (
              ${params.scope} = 'EQUIPE'
              AND (
                (${respFilter} <> '' AND ${respFilter} <> 'TODOS' AND monitoramento_responsavel_id = ${respFilter})
                OR ((${respFilter} = '' OR ${respFilter} = 'TODOS') AND monitoramento_responsavel_id IS NOT NULL)
              )
            )
            OR (
              ${params.scope} <> 'EQUIPE'
              AND (
                monitoramento_responsavel_id = ${params.userId}
                OR (${params.isTesteLogin}::boolean = true AND monitoramento_responsavel_id IN ('emp-teste-logistica', 'emp-4'))
              )
            )
          )
      `,
      sql`
        SELECT
          COUNT(*) OVER()::int AS total_matched,
          id,
          sequential_id,
          client_name,
          origin,
          destination_city,
          destination_state,
          driver_name,
          situacao_monitoramento,
          data_coleta_iso,
          data_entrega_prevista_iso,
          entrega_comprovada_em,
          updated_at,
          payload->>'protocol' AS p_protocol,
          payload->>'origemCidadeUf' AS p_origem,
          payload->>'destinoCidadeUf' AS p_destino,
          payload->>'monitoramentoResponsavelNome' AS p_mon_resp_nome,
          payload->>'monitoramentoResponsavelId' AS p_mon_resp_id,
          payload->>'updatedAtIso' AS p_updated_at_iso,
          payload->>'updatedAtFormatted' AS p_updated_at_fmt,
          payload->>'comprovanteEntregaConferido' AS p_comp_conferido,
          payload->>'revision' AS p_revision,
          CASE WHEN ${Boolean(params.compact)}::boolean = true THEN NULL::jsonb ELSE payload END AS full_payload
        FROM rodovar_fretes
        WHERE payload IS NOT NULL
          AND situacao_monitoramento IS NOT NULL
          AND situacao_monitoramento NOT IN ('NAO_LIBERADO', 'DEVOLVIDO_EXPEDICAO')
          AND (
            ${params.includeCanceled}::boolean = true
            OR (
              COALESCE(situacao_comercial, '') <> 'CANCELADO'
              AND COALESCE(situacao_operacional, '') <> 'CANCELADO'
              AND situacao_monitoramento <> 'CANCELADO'
            )
          )
          AND (
            (
              ${params.scope} = 'EQUIPE'
              AND (
                (${respFilter} <> '' AND ${respFilter} <> 'TODOS' AND monitoramento_responsavel_id = ${respFilter})
                OR ((${respFilter} = '' OR ${respFilter} = 'TODOS') AND monitoramento_responsavel_id IS NOT NULL)
              )
            )
            OR (
              ${params.scope} <> 'EQUIPE'
              AND (
                monitoramento_responsavel_id = ${params.userId}
                OR (${params.isTesteLogin}::boolean = true AND monitoramento_responsavel_id IN ('emp-teste-logistica', 'emp-4'))
              )
            )
          )
          AND (
            ${params.viewMode} = 'ALL'
            OR (
              ${params.viewMode} = 'ATIVOS'
              AND situacao_monitoramento IN ('NOVO_PARA_CARREGAR', 'EM_DESLOCAMENTO_COLETA', 'NO_LOCAL_COLETA', 'CARREGADO_EM_TRANSPORTE', 'NO_LOCAL_ENTREGA')
            )
            OR (
              ${params.viewMode} = 'FINALIZADOS'
              AND situacao_monitoramento IN ('ENTREGUE', 'FINALIZADO')
            )
          )
          AND (
            ${situacao} = 'TODAS'
            OR situacao_monitoramento = ${situacao}
          )
          AND (
            ${searchLike} = ''
            OR LOWER(COALESCE(sequential_id, '')) LIKE ${searchLike}
            OR LOWER(COALESCE(client_name, '')) LIKE ${searchLike}
            OR LOWER(COALESCE(origin, '')) LIKE ${searchLike}
            OR LOWER(COALESCE(destination_city, '') || '/' || COALESCE(destination_state, '')) LIKE ${searchLike}
            OR LOWER(COALESCE(driver_name, '')) LIKE ${searchLike}
            OR LOWER(COALESCE(truck_plate, '')) LIKE ${searchLike}
            OR LOWER(COALESCE(payload->>'ultimaLocalizacaoInformada', '')) LIKE ${searchLike}
            OR LOWER(COALESCE(payload->>'monitoramentoResponsavelNome', '')) LIKE ${searchLike}
          )
          AND (
            ${periodo} = 'TODOS'
            OR (
              ${periodo} = 'HOJE'
              AND (
                data_coleta_iso = ${params.todaySp}
                OR data_entrega_prevista_iso = ${params.todaySp}
                OR SUBSTRING(COALESCE(payload->>'updatedAtIso', ''), 1, 10) = ${params.todaySp}
              )
            )
            OR (
              ${periodo} = 'SEMANA'
              AND COALESCE(NULLIF(data_coleta_iso, ''), SUBSTRING(COALESCE(payload->>'updatedAtIso', ''), 1, 10)) BETWEEN ${params.weekStartIso} AND ${params.weekEndIso}
            )
            OR (
              ${periodo} = 'MES'
              AND SUBSTRING(COALESCE(NULLIF(data_coleta_iso, ''), SUBSTRING(COALESCE(payload->>'updatedAtIso', ''), 1, 10)), 1, 7) = ${params.monthPrefix}
            )
            OR (
              ${periodo} = 'ATRASADOS'
              AND (
                (data_coleta_iso < ${params.todaySp} AND situacao_comercial NOT IN ('EM_MONITORAMENTO', 'EM_TRANSPORTE', 'FINALIZADO', 'CANCELADO'))
                OR (data_entrega_prevista_iso < ${params.todaySp} AND situacao_comercial <> 'FINALIZADO')
                OR COALESCE((payload->>'ocorrenciasAbertasCount')::int, 0) > 0
              )
            )
          )
        ORDER BY updated_at DESC, id DESC
        LIMIT ${params.limit}
        OFFSET ${offset}
      `,
    ]);

    const c = counterRows[0];
    if (!c) return null;
    const totalCheck =
      Number(c.novo_para_carregar || 0) +
      Number(c.em_deslocamento_coleta || 0) +
      Number(c.no_local_coleta || 0) +
      Number(c.carregado_em_transporte || 0) +
      Number(c.no_local_entrega || 0) +
      Number(c.entregue || 0) +
      Number(c.finalizado || 0);
    if (totalCheck === 0 && listRows.length === 0) {
      // Check whether Neon fretes table actually has any payloads yet
      const anyPayloads = await sql`SELECT 1 FROM rodovar_fretes WHERE payload IS NOT NULL LIMIT 1`;
      if (anyPayloads.length === 0) return null;
    }

    const totalAtivos =
      Number(c.novo_para_carregar || 0) +
      Number(c.em_deslocamento_coleta || 0) +
      Number(c.no_local_coleta || 0) +
      Number(c.carregado_em_transporte || 0) +
      Number(c.no_local_entrega || 0);
    const completedCount = Number(c.entregue || 0) + Number(c.finalizado || 0);

    const items = listRows.map((r: any) => {
      if (r.full_payload) return r.full_payload;
      return {
        id: String(r.id),
        protocol: String(r.p_protocol || r.sequential_id || ''),
        cliente: String(r.client_name || ''),
        motoristaNome: r.driver_name ? String(r.driver_name) : '',
        origemCidadeUf: String(r.p_origem || r.origin || ''),
        destinoCidadeUf: String(
          r.p_destino || `${r.destination_city || ''}/${r.destination_state || ''}`
        ),
        dataColetaIso: String(r.data_coleta_iso || ''),
        dataEntregaPrevistaIso: String(r.data_entrega_prevista_iso || ''),
        entregaComprovadaEm: r.entrega_comprovada_em ? String(r.entrega_comprovada_em) : undefined,
        situacaoMonitoramento: String(r.situacao_monitoramento || 'FINALIZADO'),
        monitoramentoResponsavelId: r.p_mon_resp_id ? String(r.p_mon_resp_id) : undefined,
        monitoramentoResponsavelNome: r.p_mon_resp_nome ? String(r.p_mon_resp_nome) : undefined,
        comprovanteEntregaConferido: r.p_comp_conferido === 'true',
        updatedAtIso: String(r.p_updated_at_iso || r.updated_at || ''),
        updatedAtFormatted: String(r.p_updated_at_fmt || ''),
        revision: Number(r.p_revision || 1),
      };
    });

    return {
      items,
      totalMatched: listRows[0] ? Number(listRows[0].total_matched || 0) : 0,
      counters: {
        NOVO_PARA_CARREGAR: Number(c.novo_para_carregar || 0),
        EM_DESLOCAMENTO_COLETA: Number(c.em_deslocamento_coleta || 0),
        NO_LOCAL_COLETA: Number(c.no_local_coleta || 0),
        CARREGADO_EM_TRANSPORTE: Number(c.carregado_em_transporte || 0),
        NO_LOCAL_ENTREGA: Number(c.no_local_entrega || 0),
        ENTREGUE: Number(c.entregue || 0),
        FINALIZADO: Number(c.finalizado || 0),
        PENDENCIAS: Number(c.pendencias || 0),
        COLETAS_HOJE: Number(c.coletas_hoje || 0),
        TOTAL_ATIVOS: totalAtivos,
        completedCount,
      },
    };
  } catch (err) {
    console.warn('Neon queryMonitoringFreightsFromNeon notice:', (err as Error).message);
    return null;
  }
}

export async function persistRequestToNeon(r: any): Promise<void> {
  if (!isNeonConfigured || isIsolatedTestEnv() || !sql || !r || !r.id) return;
  try {
    await sql`
      INSERT INTO rodovar_requests (id, title, department, requester_name, status, details)
      VALUES (
        ${String(r.id).slice(0, 64)},
        ${String(r.subject || r.protocol || 'Solicitação').slice(0, 255)},
        ${String(r.targetDepartment || 'Administrativo').slice(0, 100)},
        ${String(r.requesterName || 'Colaborador').slice(0, 255)},
        ${String(r.status || 'Aberta').slice(0, 64)},
        ${String(r.description || '')}
      )
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        department = EXCLUDED.department,
        requester_name = EXCLUDED.requester_name,
        status = EXCLUDED.status,
        details = EXCLUDED.details
    `;
  } catch (err) {
    console.warn('Neon persistRequestToNeon notice:', (err as Error).message);
  }
}

export async function persistPaymentReceiptToNeon(rec: any): Promise<void> {
  if (!isNeonConfigured || isIsolatedTestEnv() || !sql || !rec || !rec.id) return;
  try {
    await sql`
      INSERT INTO rodovar_payments (id, frete_id, type, amount, status)
      VALUES (
        ${String(rec.id).slice(0, 64)},
        ${rec.freightId ? String(rec.freightId).slice(0, 64) : null},
        ${String(rec.installmentType || 'ADIANTAMENTO').slice(0, 64)},
        ${Number(rec.expectedAmountBRL || (rec.expectedAmountCentavos || 0) / 100)},
        ${String(rec.verificationStatus || rec.uploadStatus || 'SALVO_NO_SERVIDOR').slice(0, 64)}
      )
      ON CONFLICT (id) DO UPDATE SET
        type = EXCLUDED.type,
        amount = EXCLUDED.amount,
        status = EXCLUDED.status
    `;
  } catch (err) {
    console.warn('Neon persistPaymentReceiptToNeon notice:', (err as Error).message);
  }
}

export async function persistAnnouncementToNeon(a: any): Promise<void> {
  if (!isNeonConfigured || isIsolatedTestEnv() || !sql || !a || !a.id) return;
  try {
    await sql`
      INSERT INTO rodovar_announcements (id, title, author_name, target_audience, priority, content, data)
      VALUES (
        ${String(a.id).slice(0, 64)},
        ${String(a.title || 'Comunicado').slice(0, 255)},
        ${String(a.authorName || 'Diretoria').slice(0, 255)},
        ${String(a.targetAudience || 'Todos').slice(0, 100)},
        ${String(a.priority || 'Normal').slice(0, 50)},
        ${String(a.content || a.summary || '')},
        ${JSON.stringify(a)}::jsonb
      )
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        author_name = EXCLUDED.author_name,
        target_audience = EXCLUDED.target_audience,
        priority = EXCLUDED.priority,
        content = EXCLUDED.content,
        data = EXCLUDED.data
    `;
  } catch (err) {
    console.warn('Neon persistAnnouncementToNeon notice:', (err as Error).message);
  }
}

export async function persistAgendaEventToNeon(e: any): Promise<void> {
  if (!isNeonConfigured || isIsolatedTestEnv() || !sql || !e || !e.id) return;
  try {
    await sql`
      INSERT INTO rodovar_agenda (id, title, date_iso, start_time, end_time, category, data)
      VALUES (
        ${String(e.id).slice(0, 64)},
        ${String(e.title || 'Evento').slice(0, 255)},
        ${String(e.dateIso || new Date().toISOString().slice(0, 10)).slice(0, 32)},
        ${String(e.start || '08:00').slice(0, 16)},
        ${String(e.end || '09:00').slice(0, 16)},
        ${String(e.category || 'Geral').slice(0, 100)},
        ${JSON.stringify(e)}::jsonb
      )
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        date_iso = EXCLUDED.date_iso,
        start_time = EXCLUDED.start_time,
        end_time = EXCLUDED.end_time,
        category = EXCLUDED.category,
        data = EXCLUDED.data
    `;
  } catch (err) {
    console.warn('Neon persistAgendaEventToNeon notice:', (err as Error).message);
  }
}

export async function persistAuditLogToNeon(log: {
  id: string;
  actorId?: string;
  actorName?: string;
  actorRole?: string;
  action: string;
  details?: string;
  ip?: string;
  timestampIso?: string;
  timestampFormatted?: string;
}): Promise<void> {
  if (!isNeonConfigured || isIsolatedTestEnv() || !sql || !log || !log.id) return;
  try {
    const now = new Date();
    await sql`
      INSERT INTO rodovar_audit_logs (
        id, actor_id, actor_name, actor_role, action, details, ip_address, timestamp_iso, timestamp_formatted
      ) VALUES (
        ${String(log.id)},
        ${log.actorId ? String(log.actorId).slice(0, 64) : null},
        ${log.actorName ? String(log.actorName).slice(0, 255) : null},
        ${log.actorRole ? String(log.actorRole).slice(0, 64) : 'FUNCIONARIO'},
        ${String(log.action).slice(0, 100)},
        ${log.details ? String(log.details) : null},
        ${log.ip ? String(log.ip).slice(0, 64) : null},
        ${log.timestampIso || now.toISOString()},
        ${log.timestampFormatted || now.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
      )
      ON CONFLICT (id) DO NOTHING
    `;
  } catch (err) {
    console.warn('Neon persistAuditLogToNeon error:', (err as Error).message);
  }
}

export async function loadAuditLogsFromNeon(limit = 200): Promise<any[]> {
  if (!isNeonConfigured || isIsolatedTestEnv() || !sql) return [];
  try {
    const rows = await sql`SELECT * FROM rodovar_audit_logs ORDER BY created_at DESC LIMIT ${limit}`;
    return rows.map((r) => {
      const dt = r.created_at ? new Date(r.created_at) : new Date();
      return {
        id: String(r.id),
        timestampIso: String(r.timestamp_iso || dt.toISOString()),
        timestampFormatted: String(
          r.timestamp_formatted || dt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
        ),
        actorId: String(r.actor_id || 'anon'),
        actorName: String(r.actor_name || 'Sistema'),
        actorRole: String(r.actor_role || 'FUNCIONARIO'),
        action: String(r.action || ''),
        details: String(r.details || ''),
        ...(r.ip_address ? { ip: String(r.ip_address) } : {}),
      };
    });
  } catch {
    return [];
  }
}

export async function persistStateSnapshotToNeon(key: string, data: any): Promise<void> {
  if (!isNeonConfigured || isIsolatedTestEnv() || !sql || !key) return;
  try {
    await sql`
      INSERT INTO rodovar_state_store (key, payload, updated_at)
      VALUES (${key}, ${JSON.stringify(data)}::jsonb, CURRENT_TIMESTAMP)
      ON CONFLICT (key) DO UPDATE SET payload = EXCLUDED.payload, updated_at = CURRENT_TIMESTAMP
    `;
  } catch (err) {
    console.warn('Neon persistStateSnapshotToNeon error:', (err as Error).message);
  }
}

export async function loadStateSnapshotFromNeon<T = any>(
  key: string
): Promise<{ payload: T; updatedAtMs: number } | null> {
  if (!isNeonConfigured || isIsolatedTestEnv() || !sql || !key) return null;
  try {
    const rows = await sql`
      SELECT payload, EXTRACT(EPOCH FROM updated_at) * 1000 AS updated_at_ms
      FROM rodovar_state_store
      WHERE key = ${key}
      LIMIT 1
    `;
    if (rows.length > 0 && rows[0].payload) {
      return {
        payload: rows[0].payload as T,
        updatedAtMs: Number(rows[0].updated_at_ms || Date.now()),
      };
    }
  } catch (err) {
    console.warn(`Neon loadStateSnapshotFromNeon(${key}) notice:`, (err as Error).message);
  }
  return null;
}

export async function fetchNeonStateTimestamps(): Promise<Record<string, number>> {
  if (!isNeonConfigured || isIsolatedTestEnv() || !sql) return {};
  try {
    const rows = await sql`
      SELECT key, EXTRACT(EPOCH FROM updated_at) * 1000 AS updated_at_ms
      FROM rodovar_state_store
    `;
    const map: Record<string, number> = {};
    for (const row of rows) {
      if (row.key) {
        map[String(row.key)] = Number(row.updated_at_ms || 0);
      }
    }
    return map;
  } catch {
    return {};
  }
}

export async function persistSocialProfileToNeon(p: {
  userId: string;
  coverUrl?: string;
  bio?: string;
  customDisplayName?: string;
  phone?: string;
  location?: string;
  socialLinks?: any;
}): Promise<void> {
  if (!isNeonConfigured || isIsolatedTestEnv() || !sql || !p || !p.userId) return;
  try {
    await sql`
      INSERT INTO rodovar_social_profiles (user_id, cover_url, bio, custom_display_name, phone, location, social_links, updated_at)
      VALUES (
        ${p.userId}, ${p.coverUrl || null}, ${p.bio || null}, ${p.customDisplayName || null},
        ${p.phone || null}, ${p.location || null}, ${JSON.stringify(p.socialLinks || {})}::jsonb, CURRENT_TIMESTAMP
      )
      ON CONFLICT (user_id) DO UPDATE SET
        cover_url = EXCLUDED.cover_url,
        bio = EXCLUDED.bio,
        custom_display_name = EXCLUDED.custom_display_name,
        phone = EXCLUDED.phone,
        location = EXCLUDED.location,
        social_links = EXCLUDED.social_links,
        updated_at = CURRENT_TIMESTAMP
    `;
  } catch (err) {
    console.warn('Neon persistSocialProfileToNeon error:', (err as Error).message);
  }
}

export async function persistSocialPostToNeon(post: {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar?: string;
  authorRole?: string;
  authorDepartment?: string;
  content: string;
  images?: string[];
  likes?: string[];
  audience?: string;
}): Promise<void> {
  if (!isNeonConfigured || isIsolatedTestEnv() || !sql || !post || !post.id) return;
  try {
    await sql`
      INSERT INTO rodovar_social_posts (id, author_id, author_name, author_avatar, author_role, author_department, content, images, likes, audience, updated_at)
      VALUES (
        ${post.id}, ${post.authorId}, ${post.authorName}, ${post.authorAvatar || null},
        ${post.authorRole || null}, ${post.authorDepartment || null}, ${post.content},
        ${JSON.stringify(post.images || [])}::jsonb, ${JSON.stringify(post.likes || [])}::jsonb,
        ${post.audience || 'Público'}, CURRENT_TIMESTAMP
      )
      ON CONFLICT (id) DO UPDATE SET
        content = EXCLUDED.content,
        images = EXCLUDED.images,
        likes = EXCLUDED.likes,
        audience = EXCLUDED.audience,
        updated_at = CURRENT_TIMESTAMP
    `;
  } catch (err) {
    console.warn('Neon persistSocialPostToNeon error:', (err as Error).message);
  }
}

export async function deleteSocialPostFromNeon(postId: string): Promise<void> {
  if (!isNeonConfigured || isIsolatedTestEnv() || !sql || !postId) return;
  try {
    await Promise.all([
      sql`DELETE FROM rodovar_social_comments WHERE post_id = ${postId}`,
      sql`DELETE FROM rodovar_social_posts WHERE id = ${postId}`,
    ]);
  } catch (err) {
    console.warn('Neon deleteSocialPostFromNeon error:', (err as Error).message);
  }
}

export async function persistSocialCommentToNeon(c: {
  id: string;
  postId: string;
  authorId: string;
  authorName: string;
  authorAvatar?: string;
  authorRole?: string;
  content: string;
}): Promise<void> {
  if (!isNeonConfigured || isIsolatedTestEnv() || !sql || !c || !c.id) return;
  try {
    await sql`
      INSERT INTO rodovar_social_comments (id, post_id, author_id, author_name, author_avatar, author_role, content)
      VALUES (${c.id}, ${c.postId}, ${c.authorId}, ${c.authorName}, ${c.authorAvatar || null}, ${c.authorRole || null}, ${c.content})
      ON CONFLICT (id) DO UPDATE SET content = EXCLUDED.content
    `;
  } catch (err) {
    console.warn('Neon persistSocialCommentToNeon error:', (err as Error).message);
  }
}

export async function deleteSocialCommentFromNeon(commentId: string): Promise<void> {
  if (!isNeonConfigured || isIsolatedTestEnv() || !sql || !commentId) return;
  try {
    await sql`DELETE FROM rodovar_social_comments WHERE id = ${commentId}`;
  } catch (err) {
    console.warn('Neon deleteSocialCommentFromNeon error:', (err as Error).message);
  }
}

export async function persistSystemAssetToNeon(asset: {
  id: string;
  slot: string;
  mimeType: string;
  dataBase64: string;
  width?: number;
  height?: number;
}): Promise<void> {
  if (!isNeonConfigured || isIsolatedTestEnv() || !sql || !asset.id) return;
  try {
    await sql`
      INSERT INTO rodovar_system_assets (id, slot, mime_type, data_base64, width, height, updated_at)
      VALUES (${asset.id}, ${asset.slot}, ${asset.mimeType}, ${asset.dataBase64}, ${asset.width || null}, ${asset.height || null}, CURRENT_TIMESTAMP)
      ON CONFLICT (id) DO UPDATE SET
        slot = EXCLUDED.slot,
        mime_type = EXCLUDED.mime_type,
        data_base64 = EXCLUDED.data_base64,
        width = EXCLUDED.width,
        height = EXCLUDED.height,
        updated_at = CURRENT_TIMESTAMP
    `;
  } catch (err) {
    console.warn('Neon persistSystemAssetToNeon error:', (err as Error).message);
  }
}

export async function getSystemAssetFromNeon(id: string): Promise<{ mimeType: string; buffer: Buffer } | null> {
  if (!isNeonConfigured || isIsolatedTestEnv() || !sql || !id) return null;
  try {
    const rows = await sql`
      SELECT mime_type, data_base64 FROM rodovar_system_assets WHERE id = ${id} LIMIT 1
    `;
    if (rows.length > 0 && rows[0].data_base64) {
      return {
        mimeType: rows[0].mime_type,
        buffer: Buffer.from(rows[0].data_base64, 'base64'),
      };
    }
  } catch (err) {
    console.warn('Neon getSystemAssetFromNeon error:', (err as Error).message);
  }
  return null;
}

export async function persistSystemConfigToNeon(config: any): Promise<void> {
  if (!isNeonConfigured || isIsolatedTestEnv() || !sql || !config) return;
  try {
    await sql`
      INSERT INTO rodovar_state_store (key, payload, updated_at)
      VALUES ('rodovar-system-config', ${JSON.stringify(config)}::jsonb, CURRENT_TIMESTAMP)
      ON CONFLICT (key) DO UPDATE SET payload = EXCLUDED.payload, updated_at = CURRENT_TIMESTAMP
    `;
  } catch (err) {
    console.warn('Neon persistSystemConfigToNeon error:', (err as Error).message);
  }
}

export async function loadSystemConfigFromNeon(): Promise<any | null> {
  if (!isNeonConfigured || isIsolatedTestEnv() || !sql) return null;
  try {
    const rows = await sql`SELECT payload FROM rodovar_state_store WHERE key = 'rodovar-system-config' LIMIT 1`;
    if (rows.length > 0 && rows[0].payload) {
      return rows[0].payload;
    }
  } catch (err) {
    console.warn('Neon loadSystemConfigFromNeon notice:', (err as Error).message);
  }
  return null;
}

export async function persistNotificationToNeon(notif: {
  id: string;
  recipientId: string;
  type: string;
  dotColor?: string;
  title: string;
  subtitle?: string;
  timeLabel?: string;
  read?: boolean;
  targetSection: string;
  targetId?: string;
  dedupeKey?: string;
}): Promise<boolean> {
  if (!isNeonConfigured || isIsolatedTestEnv() || !sql || !notif.id || !notif.recipientId) return false;
  try {
    if (notif.dedupeKey) {
      const check = await sql`
        SELECT id FROM rodovar_notifications WHERE recipient_id = ${notif.recipientId} AND dedupe_key = ${notif.dedupeKey} LIMIT 1
      `;
      if (check.length > 0) return false;
    }
    await sql`
      INSERT INTO rodovar_notifications (
        id, recipient_id, type, dot_color, title, subtitle, time_label, read, target_section, target_id, dedupe_key, created_at
      ) VALUES (
        ${notif.id}, ${notif.recipientId}, ${notif.type}, ${notif.dotColor || 'blue'}, ${notif.title},
        ${notif.subtitle || null}, ${notif.timeLabel || null}, ${Boolean(notif.read)},
        ${notif.targetSection}, ${notif.targetId || null}, ${notif.dedupeKey || null}, CURRENT_TIMESTAMP
      )
      ON CONFLICT (id) DO NOTHING
    `;
    return true;
  } catch (err) {
    console.warn('Neon persistNotificationToNeon error:', (err as Error).message);
    return false;
  }
}

export async function loadNotificationsFromNeon(recipientId: string, limit = 50): Promise<any[]> {
  if (!isNeonConfigured || isIsolatedTestEnv() || !sql || !recipientId) return [];
  try {
    const rows = await sql`
      SELECT id, recipient_id AS "recipientId", type, dot_color AS "dotColor", title, subtitle,
              time_label AS "timeLabel", read, target_section AS "targetSection", target_id AS "targetId",
              dedupe_key AS "dedupeKey", created_at AS "createdAt"
       FROM rodovar_notifications
       WHERE recipient_id = ${recipientId}
       ORDER BY created_at DESC
       LIMIT ${limit}
    `;
    return rows as any[];
  } catch (err) {
    console.warn('Neon loadNotificationsFromNeon error:', (err as Error).message);
    return [];
  }
}

export async function markNotificationReadInNeon(notifId: string, recipientId: string): Promise<void> {
  if (!isNeonConfigured || isIsolatedTestEnv() || !sql || !notifId) return;
  try {
    await sql`UPDATE rodovar_notifications SET read = TRUE WHERE id = ${notifId} AND recipient_id = ${recipientId}`;
  } catch (err) {
    console.warn('Neon markNotificationReadInNeon error:', (err as Error).message);
  }
}

export async function markAllNotificationsReadInNeon(recipientId: string): Promise<void> {
  if (!isNeonConfigured || isIsolatedTestEnv() || !sql || !recipientId) return;
  try {
    await sql`UPDATE rodovar_notifications SET read = TRUE WHERE recipient_id = ${recipientId} AND read = FALSE`;
  } catch (err) {
    console.warn('Neon markAllNotificationsReadInNeon error:', (err as Error).message);
  }
}

export async function persistEconomicModeToNeon(enabled: boolean): Promise<void> {
  if (!isNeonConfigured || isIsolatedTestEnv() || !sql) return;
  try {
    await sql`
      INSERT INTO rodovar_state_store (key, payload, updated_at)
      VALUES ('rodovar-economic-mode', ${JSON.stringify({ enabled, updatedAt: new Date().toISOString() })}::jsonb, CURRENT_TIMESTAMP)
      ON CONFLICT (key) DO UPDATE SET payload = EXCLUDED.payload, updated_at = CURRENT_TIMESTAMP
    `;
  } catch (err) {
    console.warn('Neon persistEconomicModeToNeon error:', (err as Error).message);
  }
}

export async function loadEconomicModeFromNeon(): Promise<boolean> {
  if (!isNeonConfigured || isIsolatedTestEnv() || !sql) return true;
  try {
    const rows = await sql`SELECT payload FROM rodovar_state_store WHERE key = 'rodovar-economic-mode' LIMIT 1`;
    if (rows.length > 0 && rows[0].payload) {
      return Boolean(rows[0].payload.enabled ?? true);
    }
  } catch {
    return true;
  }
  return true;
}




