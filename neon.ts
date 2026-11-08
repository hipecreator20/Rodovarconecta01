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

export const DEFAULT_NEON_DATABASE_URL =
  'postgresql://neondb_owner:npg_WTmE1HUFL9cC@ep-raspy-river-b6yady4i-pooler.c-2.sa-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

const connectionString = normalizeNeonConnectionString(
  process.env.DATABASE_URL || process.env.POSTGRES_URL || DEFAULT_NEON_DATABASE_URL
);

export const isNeonConfigured = Boolean(
  connectionString &&
    !connectionString.includes('dummy') &&
    !connectionString.includes('****************')
);

export const pool = new Pool({
  connectionString: isNeonConfigured
    ? connectionString
    : DEFAULT_NEON_DATABASE_URL,
  connectionTimeoutMillis: 15000,
  idleTimeoutMillis: 10000,
  max: 10,
});

export const sql = isNeonConfigured ? neon(connectionString) : null;

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
    chats?: number;
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
          (SELECT COUNT(*)::int FROM rodovar_chats) AS chats,
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
          chats: Number(rows[0].chats || 0),
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
  if (!isNeonConfigured) {
    return;
  }
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS rodovar_users (
        id VARCHAR(64) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        department VARCHAR(100) NOT NULL,
        role VARCHAR(50) NOT NULL,
        access_level VARCHAR(50) NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        must_change_password BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
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
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

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
        frete_id VARCHAR(64) REFERENCES rodovar_fretes(id),
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

      CREATE TABLE IF NOT EXISTS rodovar_chats (
        id VARCHAR(64) PRIMARY KEY,
        thread_id VARCHAR(64) NOT NULL,
        sender_id VARCHAR(64) NOT NULL,
        sender_name VARCHAR(255),
        text TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS rodovar_audit_logs (
        id VARCHAR(64) PRIMARY KEY,
        actor_id VARCHAR(64),
        actor_name VARCHAR(255),
        action VARCHAR(100) NOT NULL,
        details TEXT,
        ip_address VARCHAR(64),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await syncLocalDataToNeon(client);
    console.log('Neon Postgres schema & data synchronized successfully.');
  } catch (error) {
    console.warn('Neon schema/data synchronization failed:', (error as Error).message);
  } finally {
    client.release();
  }
}

async function syncLocalDataToNeon(client: any): Promise<void> {
  const dataDir = path.join(resolveDataRoot(), 'data');

  // 1. Sync Users from rodovar-server-db.json
  const dbPath = path.join(dataDir, 'rodovar-server-db.json');
  if (fs.existsSync(dbPath)) {
    const dbRaw = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    const users = Array.isArray(dbRaw.users) ? dbRaw.users : [];
    for (const u of users) {
      if (!u || !u.id || !u.email) continue;
      await client.query(
        `INSERT INTO rodovar_users (id, name, email, department, role, access_level, password_hash, must_change_password)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           email = EXCLUDED.email,
           department = EXCLUDED.department,
           role = EXCLUDED.role,
           access_level = EXCLUDED.access_level,
           password_hash = EXCLUDED.password_hash,
           must_change_password = EXCLUDED.must_change_password`,
        [
          String(u.id),
          String(u.name || u.login || u.email),
          String(u.email),
          String(u.department || 'Administrativo'),
          String(u.accessProfile || u.roleTitle || 'COLABORADOR').slice(0, 50),
          String(u.accessLevel || 'FUNCIONARIO').slice(0, 50),
          String(u.passwordHash || 'managed'),
          Boolean(u.mustChangePassword),
        ]
      );
    }

    await client.query(
      `INSERT INTO rodovar_state_store (key, payload, updated_at)
       VALUES ($1, $2::jsonb, CURRENT_TIMESTAMP)
       ON CONFLICT (key) DO UPDATE SET payload = EXCLUDED.payload, updated_at = CURRENT_TIMESTAMP`,
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

  // 2. Sync Unified Freights from data/freights-store/*.json + payment-store/freights.json
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
           agreed_value, driver_name, driver_cpf, driver_phone, truck_plate, status
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
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
           updated_at = CURRENT_TIMESTAMP`,
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
        ]
      );
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
        );
      }
    }
  }

  // 3. Sync Internal Requests from data/requests-server.json
  const reqPath = path.join(dataDir, 'requests-server.json');
  if (fs.existsSync(reqPath)) {
    const reqState = JSON.parse(fs.readFileSync(reqPath, 'utf8'));
    const requests = Array.isArray(reqState.requests) ? reqState.requests : [];
    for (const r of requests) {
      if (!r || !r.id) continue;
      await client.query(
        `INSERT INTO rodovar_requests (id, title, department, requester_name, status, details)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO UPDATE SET
           title = EXCLUDED.title,
           department = EXCLUDED.department,
           requester_name = EXCLUDED.requester_name,
           status = EXCLUDED.status,
           details = EXCLUDED.details`,
        [
          String(r.id),
          String(r.subject || r.protocol || 'Solicitação').slice(0, 255),
          String(r.targetDepartment || 'Administrativo').slice(0, 100),
          String(r.requesterName || 'Colaborador').slice(0, 255),
          String(r.status || 'Aberta').slice(0, 64),
          String(r.description || ''),
        ]
      );
    }
  }

  // 4. Sync Payments from data/payment-store/receipts.json
  const receiptsPath = path.join(dataDir, 'payment-store', 'receipts.json');
  if (fs.existsSync(receiptsPath)) {
    const receipts = JSON.parse(fs.readFileSync(receiptsPath, 'utf8'));
    if (Array.isArray(receipts)) {
      for (const rec of receipts) {
        if (!rec || !rec.id || !rec.freightId) continue;
        await client.query(
          `INSERT INTO rodovar_payments (id, frete_id, type, amount, status)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (id) DO UPDATE SET
             type = EXCLUDED.type,
             amount = EXCLUDED.amount,
             status = EXCLUDED.status`,
          [
            String(rec.id),
            String(rec.freightId),
            String(rec.installmentType || 'ADIANTAMENTO').slice(0, 64),
            Number(rec.expectedAmountBRL || (rec.expectedAmountCentavos || 0) / 100),
            String(rec.verificationStatus || rec.uploadStatus || 'SALVO_NO_SERVIDOR').slice(0, 64),
          ]
        );
      }
    }
  }

  // 5. Sync Announcements (Mural) from rodovar-server-db.json
  if (fs.existsSync(dbPath)) {
    try {
      const dbRaw = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
      const announcements = dbRaw.mural?.announcements || [];
      for (const a of announcements) {
        if (!a || !a.id || !a.title) continue;
        await client.query(
          `INSERT INTO rodovar_announcements (id, title, author_name, target_audience, priority, content, data)
           VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
           ON CONFLICT (id) DO UPDATE SET
             title = EXCLUDED.title,
             author_name = EXCLUDED.author_name,
             target_audience = EXCLUDED.target_audience,
             priority = EXCLUDED.priority,
             content = EXCLUDED.content,
             data = EXCLUDED.data`,
          [
            String(a.id),
            String(a.title).slice(0, 255),
            String(a.authorName || 'Diretoria').slice(0, 255),
            String(a.targetAudience || 'Todos').slice(0, 100),
            String(a.priority || 'Normal').slice(0, 50),
            String(a.content || a.summary || ''),
            JSON.stringify(a),
          ]
        );
      }
      if (announcements.length > 0) {
        await client.query(
          `INSERT INTO rodovar_state_store (key, payload, updated_at)
           VALUES ('rodovar-mural', $1::jsonb, CURRENT_TIMESTAMP)
           ON CONFLICT (key) DO UPDATE SET payload = EXCLUDED.payload, updated_at = CURRENT_TIMESTAMP`,
          [JSON.stringify(dbRaw.mural)]
        );
      }
    } catch (e) {
      console.warn('Neon announcements sync notice:', (e as Error).message);
    }
  }

  // 6. Sync Corporate Agenda from data/agenda-local.json
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
           ON CONFLICT (id) DO UPDATE SET
             title = EXCLUDED.title,
             date_iso = EXCLUDED.date_iso,
             start_time = EXCLUDED.start_time,
             end_time = EXCLUDED.end_time,
             category = EXCLUDED.category,
             data = EXCLUDED.data`,
          [
            String(e.id),
            String(e.title).slice(0, 255),
            String(e.dateIso || new Date().toISOString().slice(0, 10)).slice(0, 32),
            String(e.start || '08:00').slice(0, 16),
            String(e.end || '09:00').slice(0, 16),
            String(e.category || 'Geral').slice(0, 100),
            JSON.stringify(e),
          ]
        );
      }
      await client.query(
        `INSERT INTO rodovar_state_store (key, payload, updated_at)
         VALUES ('rodovar-agenda', $1::jsonb, CURRENT_TIMESTAMP)
         ON CONFLICT (key) DO UPDATE SET payload = EXCLUDED.payload, updated_at = CURRENT_TIMESTAMP`,
        [JSON.stringify(agendaRaw)]
      );
    } catch (e) {
      console.warn('Neon agenda sync notice:', (e as Error).message);
    }
  }
}

// Live persistence helpers for mutation operations
export async function persistUserToNeon(u: any): Promise<void> {
  if (!isNeonConfigured || !u || !u.id) return;
  try {
    const client = await pool.connect();
    try {
      await client.query(
        `INSERT INTO rodovar_users (id, name, email, department, role, access_level, password_hash, must_change_password)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           email = EXCLUDED.email,
           department = EXCLUDED.department,
           role = EXCLUDED.role,
           access_level = EXCLUDED.access_level,
           password_hash = EXCLUDED.password_hash,
           must_change_password = EXCLUDED.must_change_password`,
        [
          String(u.id),
          String(u.name || u.login || u.email),
          String(u.email),
          String(u.department || 'Administrativo'),
          String(u.accessProfile || u.roleTitle || 'COLABORADOR').slice(0, 50),
          String(u.accessLevel || 'FUNCIONARIO').slice(0, 50),
          String(u.passwordHash || 'managed'),
          Boolean(u.mustChangePassword),
        ]
      );
    } finally {
      client.release();
    }
  } catch (err) {
    console.warn('Neon persistUserToNeon error:', (err as Error).message);
  }
}

export async function persistAuditLogToNeon(log: {
  id: string;
  actorId?: string;
  actorName?: string;
  action: string;
  details?: string;
  ip?: string;
}): Promise<void> {
  if (!isNeonConfigured || !log || !log.id) return;
  try {
    const client = await pool.connect();
    try {
      await client.query(
        `INSERT INTO rodovar_audit_logs (id, actor_id, actor_name, action, details, ip_address)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO NOTHING`,
        [
          String(log.id),
          log.actorId ? String(log.actorId).slice(0, 64) : null,
          log.actorName ? String(log.actorName).slice(0, 255) : null,
          String(log.action).slice(0, 100),
          log.details ? String(log.details) : null,
          log.ip ? String(log.ip).slice(0, 64) : null,
        ]
      );
    } finally {
      client.release();
    }
  } catch (err) {
    console.warn('Neon persistAuditLogToNeon error:', (err as Error).message);
  }
}

export async function persistChatMessageToNeon(msg: {
  id: string;
  threadId: string;
  senderId: string;
  senderName?: string;
  text: string;
}): Promise<void> {
  if (!isNeonConfigured || !msg || !msg.id) return;
  try {
    const client = await pool.connect();
    try {
      await client.query(
        `INSERT INTO rodovar_chats (id, thread_id, sender_id, sender_name, text)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE SET text = EXCLUDED.text`,
        [
          String(msg.id),
          String(msg.threadId).slice(0, 64),
          String(msg.senderId).slice(0, 64),
          String(msg.senderName || 'Colaborador').slice(0, 255),
          String(msg.text),
        ]
      );
    } finally {
      client.release();
    }
  } catch (err) {
    console.warn('Neon persistChatMessageToNeon error:', (err as Error).message);
  }
}

export async function persistStateSnapshotToNeon(key: string, data: any): Promise<void> {
  if (!isNeonConfigured || !key) return;
  try {
    const client = await pool.connect();
    try {
      await client.query(
        `INSERT INTO rodovar_state_store (key, payload, updated_at)
         VALUES ($1, $2::jsonb, CURRENT_TIMESTAMP)
         ON CONFLICT (key) DO UPDATE SET payload = EXCLUDED.payload, updated_at = CURRENT_TIMESTAMP`,
        [key, JSON.stringify(data)]
      );
    } finally {
      client.release();
    }
  } catch (err) {
    console.warn('Neon persistStateSnapshotToNeon error:', (err as Error).message);
  }
}

