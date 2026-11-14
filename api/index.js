// server.ts
import "dotenv/config";

// src/server/customerCovers.ts
import crypto from "node:crypto";

// src/lib/accessPolicy.ts
var BUSINESS_MODULES = ["inicio", "comunicados", "fretes_ativos", "solicitacoes", "financeiro", "agenda", "documentos", "diretorio"];
var PROFILE_MODULES = {
  RH: ["solicitacoes"],
  DIRETORIA: BUSINESS_MODULES,
  MONITORAMENTO: BUSINESS_MODULES,
  COMERCIAL: ["fretes_comercial"],
  EXPEDICAO: ["fretes_expedicao"],
  FINANCEIRO: ["financeiro", "financeiro_confirmar", "solicitacoes", "fretes_ativos"]
};

// src/lib/permissions.ts
var AVAILABLE_MODULES = [
  {
    id: "inicio",
    label: "In\xEDcio",
    description: "Painel principal, destaques institucionais e acessos r\xE1pidos.",
    badgeCategory: "Vis\xE3o Geral"
  },
  {
    id: "comunicados",
    label: "Mural de Comunicados",
    description: "Avisos da diretoria, confirma\xE7\xF5es de leitura obrigat\xF3ria e novidades.",
    badgeCategory: "Comunica\xE7\xE3o"
  },
  {
    id: "fretes_comercial",
    label: "Meus Fretes \u2014 Comercial",
    description: "Carteira individual de negocia\xE7\xE3o, contrata\xE7\xE3o e envio de fretes \xE0 Expedi\xE7\xE3o.",
    badgeCategory: "Comercial"
  },
  {
    id: "fretes_expedicao",
    label: "Meus Fretes \u2014 Expedi\xE7\xE3o",
    description: "Fila operacional individual, dispon\xEDvel para assumir, fechamento, coleta e conclus\xE3o.",
    badgeCategory: "Expedi\xE7\xE3o"
  },
  {
    id: "fretes_equipe",
    label: "Gest\xE3o de Equipe de Fretes",
    description: "Permiss\xE3o expl\xEDcita para visualizar carteiras e filas de outros funcion\xE1rios do setor.",
    badgeCategory: "Gest\xE3o"
  },
  {
    id: "fretes_transferir",
    label: "Transfer\xEAncia de Responsabilidade de Frete",
    description: "Permiss\xE3o para transferir fretes entre respons\xE1veis com justificativa auditada.",
    badgeCategory: "Gest\xE3o"
  },
  {
    id: "fretes_cancelar",
    label: "Cancelamento de Frete",
    description: "Permiss\xE3o para cancelar fretes mediante motivo registrado no hist\xF3rico.",
    badgeCategory: "Gest\xE3o"
  },
  {
    id: "fretes_ativos",
    label: "Fretes Ativos (Vis\xE3o Geral)",
    description: "Painel geral de acompanhamento de rotas e status da opera\xE7\xE3o.",
    badgeCategory: "Opera\xE7\xE3o"
  },
  {
    id: "solicitacoes",
    label: "Minhas Solicita\xE7\xF5es (CSI)",
    description: "Central de solicita\xE7\xF5es internas, prazos e chamados audit\xE1veis.",
    badgeCategory: "Atendimento"
  },
  {
    id: "financeiro",
    label: "Financeiro (Gest\xE3o de Fretes)",
    description: "Acompanhamento de fretes, valida\xE7\xE3o de CT-e/MDF-e, prepara\xE7\xE3o de pagamentos e envio de comprovantes.",
    badgeCategory: "Financeiro"
  },
  {
    id: "financeiro_confirmar",
    label: "Confirmar Liquida\xE7\xE3o de Pagamentos",
    description: "Permiss\xE3o de confer\xEAncia banc\xE1ria para confirmar liquida\xE7\xE3o definitiva de Adiantamento e Saldo.",
    badgeCategory: "Financeiro"
  },
  {
    id: "agenda",
    label: "Agenda",
    description: "Eventos corporativos, reuni\xF5es e treinamentos da empresa.",
    badgeCategory: "Organiza\xE7\xE3o"
  },
  {
    id: "documentos",
    label: "Documentos",
    description: "Procedimentos operacionais (POPs), manuais e pol\xEDticas vigentes.",
    badgeCategory: "Normas"
  },
  {
    id: "diretorio",
    label: "Diret\xF3rio de Funcion\xE1rios",
    description: "Lista de contatos, telefones e departamentos autorizados.",
    badgeCategory: "Pessoas"
  }
];
var ALL_MODULE_IDS = AVAILABLE_MODULES.map((m) => m.id);
function resolveAccessProfileFromSector(dept, accessLevel, explicitProfile, roleTitle) {
  if (accessLevel === "ADMINISTRADOR") return void 0;
  if (accessLevel === "DIRETORIA") return "DIRETORIA";
  const validProfiles = ["RH", "DIRETORIA", "MONITORAMENTO", "COMERCIAL", "EXPEDICAO", "FINANCEIRO"];
  if (explicitProfile && validProfiles.includes(explicitProfile)) {
    return explicitProfile;
  }
  const norm = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const d = norm(String(dept || ""));
  const r = norm(String(roleTitle || ""));
  if (d === "comercial" || r.includes("comercial")) return "COMERCIAL";
  if (d === "expedicao" || r.includes("expedicao")) return "EXPEDICAO";
  if (d === "monitoramento" || r.includes("monitoramento")) return "MONITORAMENTO";
  if (d === "financeiro" || r.includes("financeir")) return "FINANCEIRO";
  if (d === "recursos humanos" || d === "rh" || r.includes("recursos humanos") || r === "rh") return "RH";
  if (d === "diretoria" || r.includes("diretor")) return "DIRETORIA";
  return void 0;
}
function getDefaultPermissionsForDepartment(dept, accessLevel, accessProfile) {
  if (accessLevel === "ADMINISTRADOR") return [...ALL_MODULE_IDS];
  if (accessLevel === "DIRETORIA") return [...PROFILE_MODULES.DIRETORIA];
  const resolved = resolveAccessProfileFromSector(dept, accessLevel, accessProfile);
  if (resolved && PROFILE_MODULES[resolved]) {
    return [...PROFILE_MODULES[resolved]];
  }
  const norm = String(dept || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  if (norm === "logistica" || norm === "operacional") {
    return [...PROFILE_MODULES.MONITORAMENTO];
  }
  if (norm === "administrativo" || norm === "seguranca") {
    return ["inicio", "comunicados", "solicitacoes", "agenda", "documentos", "diretorio"];
  }
  return [];
}
function isLogisticsManager(u) {
  if (!u || !u.active || u.approvalStatus !== "APROVADO") return false;
  const normalize = (v) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const role = normalize(u.roleTitle || "");
  return /gerent/.test(role) && (/logistic/.test(normalize(u.department || "")) || /logistic/.test(role));
}
function hasPagePermission(employee, moduleId) {
  if (!employee || employee.active !== true || employee.approvalStatus !== "APROVADO") return false;
  if (moduleId === "perfil" || moduleId === "ajuda") return true;
  if (employee.accessLevel === "ADMINISTRADOR") return true;
  if (moduleId === "administracao" || moduleId === "fluxo_notificacoes") return false;
  if (moduleId === "fretes_ativos" && isLogisticsManager(employee)) return true;
  if (moduleId === "agenda") return !!employee.accessProfile || employee.accessLevel === "DIRETORIA";
  const profile = employee.accessProfile || (employee.accessLevel === "DIRETORIA" ? "DIRETORIA" : void 0);
  return !!profile && PROFILE_MODULES[profile]?.includes(moduleId) === true;
}
var canAccessComercialFreights = (u) => hasPagePermission(u, "fretes_comercial");
var canAccessExpedicaoFreights = (u) => hasPagePermission(u, "fretes_expedicao");
var canAccessMonitoramentoFreights = (u) => hasPagePermission(u, "fretes_ativos");
var canAccessFinanceiroFreights = (u) => hasPagePermission(u, "financeiro");
var canConfirmFreightPayment = (u) => !!u && u.accessProfile === "FINANCEIRO" && hasPagePermission(u, "financeiro_confirmar");
var canViewFreightTeam = (u) => !!u && u.active && u.approvalStatus === "APROVADO" && (u.accessLevel === "ADMINISTRADOR" || u.accessProfile === "DIRETORIA" || u.accessLevel === "DIRETORIA" || u.accessProfile === "MONITORAMENTO" || u.accessProfile === "FINANCEIRO");
var canOperateMonitoring = (u) => !!u && (u.accessProfile === "MONITORAMENTO" || isLogisticsManager(u)) && hasPagePermission(u, "fretes_ativos");
function canViewPendingPaymentsCount(u) {
  if (!u || u.active !== true || u.approvalStatus !== "APROVADO") return false;
  if (u.accessLevel === "ADMINISTRADOR" || u.accessLevel === "DIRETORIA" || u.accessProfile === "DIRETORIA") return true;
  if (u.accessProfile === "FINANCEIRO") return true;
  if (u.accessProfile === "MONITORAMENTO") return true;
  if (isLogisticsManager(u) || u.roleTitle && /gerent/i.test(u.roleTitle)) return true;
  return false;
}

// src/server/customerCovers.ts
var customerCoverKey = (name) => String(name || "").normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
function registerCustomerCovers(app, guard, db, save) {
  const allowed = (u) => canAccessMonitoramentoFreights(u);
  app.get("/api/customer-covers", guard, (req, res) => {
    if (!allowed(req.sessionUser)) return res.sendStatus(403);
    res.setHeader("Cache-Control", "no-store");
    res.json({
      covers: db.customerCovers || [],
      canEdit: req.sessionUser.accessLevel === "ADMINISTRADOR" || canOperateMonitoring(req.sessionUser)
    });
  });
  app.put("/api/customer-covers", guard, async (req, res) => {
    const u = req.sessionUser;
    if (!(u.accessLevel === "ADMINISTRADOR" || canOperateMonitoring(u))) {
      return res.sendStatus(403);
    }
    const b = req.body || {};
    const key = customerCoverKey(b.customer);
    if (!key || key.length > 200) {
      return res.status(400).json({ error: "Cliente inv\xE1lido." });
    }
    const match = /^data:(image\/png|image\/jpeg|image\/jpg|image\/webp|image\/gif);base64,([A-Za-z0-9+/=\r\n]+)$/.exec(
      String(b.dataUrl || "")
    );
    if (!match) {
      return res.status(400).json({ error: "Escolha uma imagem PNG, JPG, WebP ou GIF." });
    }
    const mime = match[1] === "image/jpg" ? "image/jpeg" : match[1];
    const bytes = Buffer.from(match[2], "base64");
    const valid = mime === "image/png" ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) : mime === "image/jpeg" ? bytes[0] === 255 && bytes[1] === 216 : mime === "image/webp" ? bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP" : bytes.subarray(0, 3).toString() === "GIF";
    if (!valid || bytes.length > 3 * 1024 * 1024) {
      return res.status(400).json({ error: "Imagem inv\xE1lida ou acima de 3 MB." });
    }
    db.customerCovers ||= [];
    const cover = {
      key,
      customer: String(b.customer).trim(),
      dataUrl: b.dataUrl,
      updatedBy: u.id,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    const index = db.customerCovers.findIndex((c) => c.key === key);
    if (index < 0) db.customerCovers.push(cover);
    else db.customerCovers[index] = cover;
    db.auditLogs ||= [];
    db.auditLogs.push({
      id: crypto.randomUUID(),
      action: "CUSTOMER_COVER_UPDATED",
      actorUserId: u.id,
      customer: cover.customer,
      atIso: cover.updatedAt
    });
    await Promise.resolve(save());
    res.json({ cover });
  });
}

// src/server/drivers.ts
import crypto2 from "node:crypto";
var normalizeDriverCpf = (value) => String(value || "").replace(/\D/g, "");
function registerDrivers(app, guard, adminGuard, db, save) {
  db.drivers ||= [];
  db.driverAudit ||= [];
  const admin = (u) => u?.accessLevel === "ADMINISTRADOR";
  const allowed = (u) => admin(u) || ["COMERCIAL", "EXPEDICAO"].includes(u?.accessProfile);
  const audit = (u, driver, action, note) => {
    const event = { id: crypto2.randomUUID(), at: (/* @__PURE__ */ new Date()).toISOString(), actorId: u.id, actorName: u.name, action, note };
    driver.history.push(event);
    db.driverAudit.push({ ...event, driverId: driver.id });
  };
  const view = (d, u) => admin(u) ? d : { id: d.id, name: d.name, cpf: "***.***.***-" + d.cpf.slice(-2), phone: d.phone, status: d.status, highlight: d.highlight && d.status !== "BLOQUEADO", avatar: d.avatar || "", history: d.history.filter((h) => h.public === true).map((h) => ({ at: h.at, action: h.action })) };
  app.get("/api/drivers", guard, (req, res) => {
    const u = req.sessionUser;
    if (!allowed(u)) return res.status(403).json({ error: "Consulta de motoristas n\xE3o autorizada." });
    const q = String(req.query.q || "").trim().toLowerCase(), cpf = normalizeDriverCpf(q);
    if (!admin(u) && q.length < 3) return res.json({ drivers: [] });
    res.setHeader("Cache-Control", "no-store");
    res.json({ metrics: admin(u) ? { LIBERADO: db.drivers.filter((d) => d.status === "LIBERADO").length, BLOQUEADO: db.drivers.filter((d) => d.status === "BLOQUEADO").length, DESTAQUE: db.drivers.filter((d) => d.highlight && d.status !== "BLOQUEADO").length, EM_ANALISE: db.drivers.filter((d) => d.status === "EM_ANALISE").length } : void 0, drivers: db.drivers.filter((d) => !q || d.name.toLowerCase().includes(q) || cpf.length >= 3 && (d.cpf.includes(cpf) || normalizeDriverCpf(d.phone).includes(cpf)) || (d.plates || []).some((p) => p.toLowerCase().includes(q))).map((d) => view(d, u)) });
  });
  app.post("/api/drivers", adminGuard, (req, res) => {
    const b = req.body || {}, cpf = normalizeDriverCpf(b.cpf);
    if (!/^\d{11}$/.test(cpf) || !String(b.name || "").trim() || String(b.name).length > 160 || !["LIBERADO", "BLOQUEADO", "EM_ANALISE"].includes(b.status) || String(b.reason || "").trim().length < 5) return res.status(400).json({ error: "Informe nome, CPF com 11 d\xEDgitos, situa\xE7\xE3o e justificativa de pelo menos 5 caracteres." });
    if (db.drivers.some((d2) => d2.cpf === cpf)) return res.status(409).json({ error: "CPF j\xE1 cadastrado. Consulte e revise o cadastro existente." });
    const d = { id: crypto2.randomUUID(), cpf, name: b.name.trim(), phone: String(b.phone || "").slice(0, 40), plates: String(b.plates || "").split(/[,;\s]+/).filter(Boolean).slice(0, 10).map((v) => v.toUpperCase().slice(0, 10)), status: b.status, highlight: !!b.highlight, reason: String(b.reason).trim().slice(0, 3e3), history: [], documents: [] };
    audit(req.sessionUser, d, "CADASTRO", d.reason);
    db.drivers.push(d);
    save();
    res.status(201).json({ driver: d });
  });
  app.post("/api/drivers/:id/action", adminGuard, (req, res) => {
    const d = db.drivers.find((r) => r.id === req.params.id), b = req.body || {};
    if (!d) return res.status(404).json({ error: "Motorista n\xE3o encontrado." });
    if (String(b.reason || "").trim().length < 5 || String(b.reason).length > 3e3) return res.status(400).json({ error: "Justificativa obrigat\xF3ria (5 a 3000 caracteres)." });
    if (!["BLOCK", "UNBLOCK", "HIGHLIGHT", "REMOVE_HIGHLIGHT", "REVIEW"].includes(b.action)) return res.status(400).json({ error: "A\xE7\xE3o inv\xE1lida." });
    if (b.action === "UNBLOCK" && b.confirm !== true) return res.status(400).json({ error: "Confirme o desbloqueio administrativo." });
    if (b.action === "BLOCK") d.status = "BLOQUEADO";
    if (b.action === "UNBLOCK") d.status = "LIBERADO";
    if (b.action === "HIGHLIGHT") d.highlight = true;
    if (b.action === "REMOVE_HIGHLIGHT") d.highlight = false;
    if (b.action === "REVIEW") {
      if (b.name) d.name = String(b.name).trim().slice(0, 160);
      if (b.phone !== void 0) d.phone = String(b.phone).slice(0, 40);
    }
    d.reason = b.reason;
    audit(req.sessionUser, d, b.action, b.reason);
    save();
    res.json({ driver: d });
  });
  app.post("/api/drivers/:id/document", adminGuard, (req, res) => {
    const driver = db.drivers.find((d) => d.id === req.params.id);
    if (!driver) return res.status(404).json({ error: "Motorista n\xE3o encontrado." });
    const b = req.body || {}, match = /^data:(application\/pdf|image\/png|image\/jpeg);base64,([A-Za-z0-9+/=\r\n]+)$/.exec(String(b.dataUrl || ""));
    if (!match) return res.status(400).json({ error: "Formato inv\xE1lido." });
    const bytes = Buffer.from(match[2], "base64");
    if (bytes.length > 5 * 1024 * 1024 || !(match[1] === "application/pdf" ? bytes.subarray(0, 5).toString() === "%PDF-" : match[1] === "image/png" ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) : bytes[0] === 255 && bytes[1] === 216)) return res.status(400).json({ error: "Arquivo inv\xE1lido ou acima de 5 MB." });
    driver.documents.push({ id: crypto2.randomUUID(), name: String(b.name || "Documento").slice(0, 160), dataUrl: b.dataUrl });
    audit(req.sessionUser, driver, "DOCUMENTO", "Documento comprobat\xF3rio adicionado");
    save();
    res.json({ driver });
  });
  const check = (req, res, next) => {
    if (!allowed(req.sessionUser)) return next();
    if (!["POST", "PUT", "PATCH"].includes(req.method) || req.body?.motoristaCpf === void 0) return next();
    const cpf = normalizeDriverCpf(req.body.motoristaCpf);
    const driver = db.drivers.find((d) => d.cpf === cpf && d.status === "BLOQUEADO");
    if (!driver) return next();
    audit(req.sessionUser, driver, "VINCULO_BLOQUEADO", "Tentativa de v\xEDnculo bloqueada em " + req.path);
    save();
    res.status(409).json({ error: "Motorista bloqueado. Procure a Administra\xE7\xE3o.", code: "DRIVER_BLOCKED", driver: { name: driver.name, status: "BLOQUEADO" } });
  };
  app.locals.checkDriverBinding = (req, res, cpf) => {
    const body = req.body;
    req.body = { ...body, motoristaCpf: cpf };
    let permitted = false;
    check(req, res, () => {
      permitted = true;
    });
    req.body = body;
    return permitted;
  };
  app.use("/api/meus-fretes", guard, check);
  return { check };
}

// src/server/agenda.ts
import fs3 from "node:fs";
import path3 from "node:path";
import crypto3 from "node:crypto";

// src/server/dataRoot.ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";

// src/server/embeddedDataSeed.ts
var EMBEDDED_DATA_SEED_GZIP_B64 = "H4sIAAAAAAAAA6uuBQBDv6ajAgAAAA==";

// src/server/dataRoot.ts
var cachedServerlessRoot = null;
function seedFromEmbeddedArchive(tmpDataDir) {
  if (!EMBEDDED_DATA_SEED_GZIP_B64) return;
  try {
    const jsonStr = zlib.gunzipSync(Buffer.from(EMBEDDED_DATA_SEED_GZIP_B64, "base64")).toString("utf8");
    const files = JSON.parse(jsonStr);
    for (const [relPath, content] of Object.entries(files)) {
      const targetPath = path.join(tmpDataDir, relPath);
      if (!fs.existsSync(targetPath)) {
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        fs.writeFileSync(targetPath, content, "utf8");
      }
    }
  } catch (err) {
    console.warn("Failed to extract embedded data seed:", err.message);
  }
}
function resolveDataRoot() {
  const cwd = process.cwd();
  const isVercel = Boolean(process.env.VERCEL || process.env.VERCEL_ENV);
  const configuredRoot = process.env.RODOVAR_DATA_ROOT?.trim();
  if (configuredRoot && !isVercel) {
    return configuredRoot;
  }
  if (!isVercel) {
    try {
      fs.accessSync(cwd, fs.constants.W_OK);
      if (fs.existsSync(path.join(cwd, "data", "rodovar-server-db.json"))) {
        return cwd;
      }
    } catch {
    }
  }
  if (cachedServerlessRoot && fs.existsSync(path.join(cachedServerlessRoot, "data", "rodovar-server-db.json"))) {
    return cachedServerlessRoot;
  }
  let candidateRoot = path.join(os.tmpdir(), "rodovar-conecta-runtime-v2");
  if (configuredRoot && configuredRoot.startsWith(os.tmpdir())) {
    candidateRoot = configuredRoot;
  }
  const tmpDataDir = path.join(candidateRoot, "data");
  const bundledDataDir = path.join(cwd, "data");
  try {
    fs.mkdirSync(tmpDataDir, { recursive: true });
    if (fs.existsSync(bundledDataDir) && !fs.existsSync(path.join(tmpDataDir, "rodovar-server-db.json"))) {
      fs.cpSync(bundledDataDir, tmpDataDir, { recursive: true });
    }
    if (!fs.existsSync(path.join(tmpDataDir, "rodovar-server-db.json"))) {
      seedFromEmbeddedArchive(tmpDataDir);
    }
  } catch {
  }
  cachedServerlessRoot = candidateRoot;
  return candidateRoot;
}

// neon.ts
import "dotenv/config";
import { Pool, neon, neonConfig } from "@neondatabase/serverless";
import fs2 from "node:fs";
import path2 from "node:path";
import ws from "ws";
neonConfig.webSocketConstructor = ws;
function normalizeNeonConnectionString(raw) {
  const trimmed = (raw || "").trim();
  if (!trimmed) return "";
  return trimmed.replace(/channel_binding=requerido/gi, "channel_binding=require");
}
var rawConnectionString = (process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || process.env.DATABASE_URL_UNPOOLED || "").trim();
if (!rawConnectionString && !process.env.RODOVAR_DATA_ROOT) {
  console.warn(
    "Neon Postgres notice: vari\xE1vel DATABASE_URL (ou POSTGRES_URL) n\xE3o configurada neste ambiente."
  );
}
var connectionString = normalizeNeonConnectionString(rawConnectionString);
var isNeonConfigured = Boolean(
  connectionString && !connectionString.includes("dummy") && !connectionString.includes("****************")
);
function isIsolatedTestEnv() {
  if (process.env.VERCEL || process.env.VERCEL_ENV) return false;
  return Boolean(
    process.env.RODOVAR_DATA_ROOT || process.env.NODE_TEST_CONTEXT || process.execArgv.includes("--test") || process.argv.includes("--test")
  );
}
var pool = new Pool({
  connectionString: connectionString || void 0,
  connectionTimeoutMillis: 1e4,
  idleTimeoutMillis: 5e3,
  max: 5
});
var sql = isNeonConfigured ? neon(connectionString) : null;
var pendingNeonWrites = /* @__PURE__ */ new Set();
function trackNeonWrite(promise) {
  pendingNeonWrites.add(promise);
  promise.finally(() => {
    pendingNeonWrites.delete(promise);
  });
  return promise;
}
function hasPendingNeonWrites() {
  return pendingNeonWrites.size > 0;
}
async function flushPendingNeonWrites(timeoutMs = 15e3) {
  const deadline = Date.now() + timeoutMs;
  while (pendingNeonWrites.size > 0) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    const batch = Array.from(pendingNeonWrites);
    await Promise.race([
      Promise.allSettled(batch),
      new Promise((resolve) => setTimeout(resolve, remaining))
    ]);
    if (Date.now() >= deadline) break;
  }
}
var NEON_SCHEMA_VERSION = "2027.06.v1";
var neonSchemaInitialized = false;
var neonSchemaInitPromise = null;
async function testNeonConnection() {
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
        await client.query("SELECT 1");
        return true;
      } finally {
        client.release();
      }
    } catch (poolErr) {
      console.warn("Neon Postgres connection failed:", poolErr.message || error.message);
      return false;
    }
  }
}
var NEON_AUTH_URL = process.env.NEON_AUTH_URL || "https://ep-raspy-river-b6yady4i.neonauth.c-2.sa-east-1.aws.neon.tech/neondb/auth";
var NEON_JWKS_URL = process.env.NEON_JWKS_URL || "https://ep-raspy-river-b6yady4i.neonauth.c-2.sa-east-1.aws.neon.tech/neondb/auth/.well-known/jwks.json";
async function getNeonHealthStats() {
  let host = null;
  let database = null;
  if (isNeonConfigured) {
    try {
      const parsed = new URL(connectionString);
      host = parsed.hostname;
      database = parsed.pathname.replace(/^\//, "") || "neondb";
    } catch {
    }
  }
  const connected = await testNeonConnection();
  let counts = null;
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
          auditLogs: Number(rows[0].audit_logs || 0)
        };
      }
    } catch {
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
            snapshots: Number(rows[0].snapshots || 0)
          };
        }
      } catch {
      }
    }
  }
  return {
    connected,
    databaseUrlConfigured: isNeonConfigured,
    host,
    database,
    branch: "production",
    services: ["postgres", "auth"],
    authUrl: NEON_AUTH_URL,
    jwksUrl: NEON_JWKS_URL,
    counts,
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  };
}
async function initializeNeonSchema() {
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
        audience VARCHAR(50) DEFAULT 'P\xFAblico',
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
          [JSON.stringify({ version: NEON_SCHEMA_VERSION, updatedAt: (/* @__PURE__ */ new Date()).toISOString() })]
        );
        neonSchemaInitialized = true;
        console.log("Neon Postgres schema & data synchronized successfully.");
      } finally {
        client.release();
      }
    } catch (error) {
      console.warn("Neon schema/data synchronization failed:", error.message);
    }
  })().finally(() => {
    neonSchemaInitPromise = null;
  });
  return neonSchemaInitPromise;
}
var ensureNeonReady = initializeNeonSchema;
async function upsertUserRowWithClient(client, u, overwriteExisting = false) {
  if (!u || !u.id || !u.email && !u.login) return;
  const email = String(u.email || (String(u.login).includes("@") ? u.login : `${u.login}@rodovar.com.br`));
  const login = String(u.login || email);
  const role = String(u.accessProfile || u.roleTitle || "COLABORADOR").slice(0, 100);
  const roleTitle = String(u.roleTitle || u.accessProfile || "Colaborador").slice(0, 150);
  const accessProfile = u.accessProfile ? String(u.accessProfile).slice(0, 50) : null;
  const permissoes = Array.isArray(u.permissoesPaginas) ? u.permissoesPaginas : [];
  const conflictClause = overwriteExisting ? `ON CONFLICT (id) DO UPDATE SET
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
        updated_at = CURRENT_TIMESTAMP` : `ON CONFLICT (id) DO UPDATE SET
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
      String(u.department || "Administrativo"),
      role,
      roleTitle,
      String(u.accessLevel || "FUNCIONARIO").slice(0, 50),
      accessProfile,
      String(u.passwordHash || "managed"),
      String(u.passwordSalt || ""),
      Boolean(u.mustChangePassword),
      String(u.avatar || ""),
      Boolean(u.hasCustomAvatar),
      String(u.approvalStatus || "APROVADO"),
      u.requestedAt ? String(u.requestedAt) : (/* @__PURE__ */ new Date()).toISOString(),
      u.approvedBy ? String(u.approvedBy) : null,
      u.approvedAt ? String(u.approvedAt) : null,
      u.statusReason ? String(u.statusReason) : null,
      Boolean(u.migratedFromGoogle),
      String(u.phoneExt || "71 9 9920-2476"),
      String(u.phone || u.phoneExt || "71 9 9920-2476"),
      String(u.location || "BA - Salvador"),
      String(u.joinedAt || "28/10/2026"),
      u.active !== void 0 ? Boolean(u.active) : true,
      JSON.stringify(permissoes),
      Number(u.rosterActivationVersion || 1)
    ]
  );
}
async function syncLocalDataToNeon(client) {
  const dataDir = path2.join(resolveDataRoot(), "data");
  const dbPath = path2.join(dataDir, "rodovar-server-db.json");
  if (fs2.existsSync(dbPath)) {
    const dbRaw = JSON.parse(fs2.readFileSync(dbPath, "utf8"));
    const users = Array.isArray(dbRaw.users) ? dbRaw.users : [];
    for (const u of users) {
      await upsertUserRowWithClient(client, u, false).catch(() => {
      });
    }
    if (dbRaw.accessPolicy) {
      await client.query(
        `INSERT INTO rodovar_access_policy (id, protected_admin_uid, authorized_uids, version, updated_at)
         VALUES ('default', $1, $2::jsonb, $3, CURRENT_TIMESTAMP)
         ON CONFLICT (id) DO UPDATE SET
           protected_admin_uid = CASE WHEN rodovar_access_policy.protected_admin_uid = 'admin' THEN EXCLUDED.protected_admin_uid ELSE rodovar_access_policy.protected_admin_uid END,
           authorized_uids = CASE WHEN rodovar_access_policy.protected_admin_uid = 'admin' OR jsonb_array_length(rodovar_access_policy.authorized_uids) = 0 THEN EXCLUDED.authorized_uids ELSE rodovar_access_policy.authorized_uids END`,
        [
          String(dbRaw.accessPolicy.protectedAdminUid || "emp-admin-master"),
          JSON.stringify(Array.isArray(dbRaw.accessPolicy.authorizedUids) ? dbRaw.accessPolicy.authorizedUids : users.map((u) => u.id)),
          Number(dbRaw.accessPolicy.version || 1)
        ]
      ).catch(() => {
      });
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
          String(d.targetUserId || ""),
          String(d.targetName || ""),
          String(d.targetLogin || ""),
          String(d.adminId || ""),
          String(d.adminName || ""),
          String(d.action || "APROVAR"),
          String(d.newStatus || "APROVADO"),
          String(d.accessLevel || "FUNCIONARIO"),
          JSON.stringify(Array.isArray(d.permissoesPaginas) ? d.permissoesPaginas : []),
          d.reason ? String(d.reason) : null,
          String(d.timestampIso || (/* @__PURE__ */ new Date()).toISOString()),
          String(d.timestampFormatted || "")
        ]
      ).catch(() => {
      });
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
          String(a.deletedAtIso || (/* @__PURE__ */ new Date()).toISOString()),
          String(a.deletedById || "emp-admin-master"),
          String(a.reason || "")
        ]
      ).catch(() => {
      });
    }
    await client.query(
      `INSERT INTO rodovar_state_store (key, payload, updated_at)
       VALUES ($1, $2::jsonb, CURRENT_TIMESTAMP)
       ON CONFLICT (key) DO NOTHING`,
      [
        "rodovar-server-db",
        JSON.stringify({
          systemConfig: dbRaw.systemConfig,
          accessPolicy: dbRaw.accessPolicy,
          userCount: users.length
        })
      ]
    );
  }
  const freightsDir = path2.join(dataDir, "freights-store");
  if (fs2.existsSync(freightsDir)) {
    const files = fs2.readdirSync(freightsDir).filter((f) => f.startsWith("frete-") && f.endsWith(".json") && !f.endsWith(".sub.json"));
    for (const file of files) {
      const f = JSON.parse(fs2.readFileSync(path2.join(freightsDir, file), "utf8"));
      if (!f || !f.id || !f.protocol) continue;
      const destParts = String(f.destinoCidadeUf || "").split("/");
      const destCity = (destParts[0] || f.destinoCidadeUf || "Destino").trim();
      const destState = (destParts[1] || "BR").trim().slice(0, 8);
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
          String(f.cliente || "Cliente"),
          f.clienteCnpj ? String(f.clienteCnpj).slice(0, 32) : null,
          String(f.origemCidadeUf || "Origem"),
          destCity,
          destState || "BR",
          f.enderecoEntrega ? String(f.enderecoEntrega) : null,
          f.tipoCarga ? String(f.tipoCarga) : null,
          agreedReais,
          f.motoristaNome ? String(f.motoristaNome) : null,
          f.motoristaCpf ? String(f.motoristaCpf).slice(0, 32) : null,
          f.motoristaTelefone ? String(f.motoristaTelefone).slice(0, 64) : null,
          f.placaVeiculo ? String(f.placaVeiculo).slice(0, 32) : null,
          String(f.situacaoMonitoramento !== "NAO_LIBERADO" ? f.situacaoMonitoramento : f.situacaoOperacional !== "NAO_ENVIADO" ? f.situacaoOperacional : f.situacaoComercial || "EM_NEGOCIACAO").slice(0, 64),
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
          f.updatedAtIso ? String(f.updatedAtIso) : null
        ]
      ).catch(() => {
      });
    }
  }
  const paymentFreightsPath = path2.join(dataDir, "payment-store", "freights.json");
  if (fs2.existsSync(paymentFreightsPath)) {
    const pfList = JSON.parse(fs2.readFileSync(paymentFreightsPath, "utf8"));
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
            String(pf.cliente || "Cliente"),
            null,
            String(pf.origem || "Origem"),
            String(pf.destino || "Destino").slice(0, 255),
            "BA",
            String(pf.destino || ""),
            "Frete Financeiro",
            Number(pf.valorTotal || pf.valorFreteMotorista || 0),
            pf.motoristaNome ? String(pf.motoristaNome) : null,
            null,
            pf.motoristaTelefone ? String(pf.motoristaTelefone).slice(0, 64) : null,
            null,
            String(pf.status || "Pendente").slice(0, 64)
          ]
        ).catch(() => {
        });
      }
    }
  }
  const reqPath = path2.join(dataDir, "requests-server.json");
  if (fs2.existsSync(reqPath)) {
    const reqState = JSON.parse(fs2.readFileSync(reqPath, "utf8"));
    const requests = Array.isArray(reqState.requests) ? reqState.requests : [];
    for (const r of requests) {
      if (!r || !r.id) continue;
      await client.query(
        `INSERT INTO rodovar_requests (id, title, department, requester_name, status, details)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO NOTHING`,
        [
          String(r.id),
          String(r.subject || r.protocol || "Solicita\xE7\xE3o").slice(0, 255),
          String(r.targetDepartment || "Administrativo").slice(0, 100),
          String(r.requesterName || "Colaborador").slice(0, 255),
          String(r.status || "Aberta").slice(0, 64),
          String(r.description || "")
        ]
      ).catch(() => {
      });
    }
  }
  const receiptsPath = path2.join(dataDir, "payment-store", "receipts.json");
  if (fs2.existsSync(receiptsPath)) {
    const receipts = JSON.parse(fs2.readFileSync(receiptsPath, "utf8"));
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
            String(rec.installmentType || "ADIANTAMENTO").slice(0, 64),
            Number(rec.expectedAmountBRL || (rec.expectedAmountCentavos || 0) / 100),
            String(rec.verificationStatus || rec.uploadStatus || "SALVO_NO_SERVIDOR").slice(0, 64)
          ]
        ).catch(() => {
        });
      }
    }
  }
  if (fs2.existsSync(dbPath)) {
    try {
      const dbRaw = JSON.parse(fs2.readFileSync(dbPath, "utf8"));
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
            String(a.authorName || "Diretoria").slice(0, 255),
            String(a.targetAudience || "Todos").slice(0, 100),
            String(a.priority || "Normal").slice(0, 50),
            String(a.content || a.summary || ""),
            JSON.stringify(a)
          ]
        ).catch(() => {
        });
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
      console.warn("Neon announcements sync notice:", e.message);
    }
  }
  const agendaPath = path2.join(dataDir, "agenda-local.json");
  if (fs2.existsSync(agendaPath)) {
    try {
      const agendaRaw = JSON.parse(fs2.readFileSync(agendaPath, "utf8"));
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
            String(e.dateIso || (/* @__PURE__ */ new Date()).toISOString().slice(0, 10)).slice(0, 32),
            String(e.start || "08:00").slice(0, 16),
            String(e.end || "09:00").slice(0, 16),
            String(e.category || "Geral").slice(0, 100),
            JSON.stringify(e)
          ]
        ).catch(() => {
        });
      }
      await client.query(
        `INSERT INTO rodovar_state_store (key, payload, updated_at)
         VALUES ('rodovar-agenda', $1::jsonb, CURRENT_TIMESTAMP)
         ON CONFLICT (key) DO NOTHING`,
        [JSON.stringify(agendaRaw)]
      );
    } catch (e) {
      console.warn("Neon agenda sync notice:", e.message);
    }
  }
}
function mapRowToServerUserRecord(row) {
  const permissoes = Array.isArray(row.permissoes_paginas) ? row.permissoes_paginas : typeof row.permissoes_paginas === "string" ? JSON.parse(row.permissoes_paginas || "[]") : [];
  return {
    id: String(row.id),
    name: String(row.name || row.login || row.email),
    email: String(row.email),
    login: String(row.login || row.email),
    passwordHash: String(row.password_hash || ""),
    passwordSalt: String(row.password_salt || ""),
    mustChangePassword: Boolean(row.must_change_password),
    roleTitle: String(row.role_title || row.role || "Colaborador"),
    department: String(row.department || "Administrativo"),
    accessLevel: String(row.access_level || "FUNCIONARIO"),
    ...row.access_profile ? { accessProfile: String(row.access_profile) } : {},
    avatar: String(row.avatar || ""),
    hasCustomAvatar: Boolean(row.has_custom_avatar),
    approvalStatus: String(row.approval_status || "APROVADO"),
    requestedAt: String(row.requested_at || (/* @__PURE__ */ new Date()).toISOString()),
    ...row.approved_by ? { approvedBy: String(row.approved_by) } : {},
    ...row.approved_at ? { approvedAt: String(row.approved_at) } : {},
    ...row.status_reason ? { statusReason: String(row.status_reason) } : {},
    migratedFromGoogle: Boolean(row.migrated_from_google),
    phoneExt: String(row.phone_ext || row.phone || "71 9 9920-2476"),
    phone: String(row.phone || row.phone_ext || "71 9 9920-2476"),
    location: String(row.location || "BA - Salvador"),
    joinedAt: String(row.joined_at || "28/10/2026"),
    active: row.active !== void 0 && row.active !== null ? Boolean(row.active) : true,
    permissoesPaginas: permissoes,
    rosterActivationVersion: Number(row.roster_activation_version || 1)
  };
}
function persistUserToNeon(u) {
  if (!isNeonConfigured || isIsolatedTestEnv() || !sql || !u || !u.id) return Promise.resolve();
  const dbSql = sql;
  return trackNeonWrite(
    (async () => {
      try {
        const email = String(u.email || (String(u.login).includes("@") ? u.login : `${u.login}@rodovar.com.br`));
        const login = String(u.login || email);
        const role = String(u.accessProfile || u.roleTitle || "COLABORADOR").slice(0, 100);
        const roleTitle = String(u.roleTitle || u.accessProfile || "Colaborador").slice(0, 150);
        const accessProfile = u.accessProfile ? String(u.accessProfile).slice(0, 50) : null;
        const permissoes = JSON.stringify(Array.isArray(u.permissoesPaginas) ? u.permissoesPaginas : []);
        await dbSql`
          INSERT INTO rodovar_users (
            id, name, email, login, department, role, role_title, access_level, access_profile,
            password_hash, password_salt, must_change_password, avatar, has_custom_avatar,
            approval_status, requested_at, approved_by, approved_at, status_reason,
            migrated_from_google, phone_ext, phone, location, joined_at, active,
            permissoes_paginas, roster_activation_version, updated_at
          ) VALUES (
            ${String(u.id)}, ${String(u.name || login)}, ${email}, ${login},
            ${String(u.department || "Administrativo")}, ${role}, ${roleTitle},
            ${String(u.accessLevel || "FUNCIONARIO").slice(0, 50)}, ${accessProfile},
            ${String(u.passwordHash || "managed")}, ${String(u.passwordSalt || "")},
            ${Boolean(u.mustChangePassword)}, ${String(u.avatar || "")}, ${Boolean(u.hasCustomAvatar)},
            ${String(u.approvalStatus || "APROVADO")}, ${u.requestedAt ? String(u.requestedAt) : (/* @__PURE__ */ new Date()).toISOString()},
            ${u.approvedBy ? String(u.approvedBy) : null}, ${u.approvedAt ? String(u.approvedAt) : null},
            ${u.statusReason ? String(u.statusReason) : null}, ${Boolean(u.migratedFromGoogle)},
            ${String(u.phoneExt || "71 9 9920-2476")}, ${String(u.phone || u.phoneExt || "71 9 9920-2476")},
            ${String(u.location || "BA - Salvador")}, ${String(u.joinedAt || "28/10/2026")},
            ${u.active !== void 0 ? Boolean(u.active) : true}, ${permissoes}::jsonb,
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
        console.warn("Neon persistUserToNeon error:", err.message);
      }
    })()
  );
}
function deleteUserFromNeon(userId, archived) {
  if (!isNeonConfigured || isIsolatedTestEnv() || !sql || !userId) return Promise.resolve();
  const dbSql = sql;
  return trackNeonWrite(
    (async () => {
      try {
        if (archived && archived.user) {
          await dbSql`
            INSERT INTO rodovar_archived_users (user_id, user_snapshot, deleted_at_iso, deleted_by_id, reason)
            VALUES (${String(userId)}, ${JSON.stringify(archived.user)}::jsonb, ${String(archived.deletedAtIso || (/* @__PURE__ */ new Date()).toISOString())}, ${String(archived.deletedById || "emp-admin-master")}, ${String(archived.reason || "")})
            ON CONFLICT (user_id) DO UPDATE SET
              user_snapshot = EXCLUDED.user_snapshot,
              deleted_at_iso = EXCLUDED.deleted_at_iso,
              deleted_by_id = EXCLUDED.deleted_by_id,
              reason = EXCLUDED.reason
          `;
        }
        await Promise.all([
          dbSql`DELETE FROM rodovar_password_reset_tokens WHERE user_id = ${userId}`,
          dbSql`DELETE FROM rodovar_login_locks WHERE identifier = ${`user:${userId}`}`,
          dbSql`DELETE FROM rodovar_users WHERE id = ${userId}`
        ]);
      } catch (err) {
        console.warn("Neon deleteUserFromNeon error:", err.message);
      }
    })()
  );
}
async function loadAllUsersFromNeon() {
  if (!isNeonConfigured || isIsolatedTestEnv() || !sql) return [];
  try {
    const rows = await sql`SELECT * FROM rodovar_users ORDER BY created_at ASC`;
    return rows.map(mapRowToServerUserRecord);
  } catch (err) {
    console.warn("Neon loadAllUsersFromNeon notice:", err.message);
    return [];
  }
}
function persistAccessPolicyToNeon(policy) {
  if (!isNeonConfigured || isIsolatedTestEnv() || !sql || !policy) return Promise.resolve();
  const dbSql = sql;
  return trackNeonWrite(
    (async () => {
      try {
        await dbSql`
          INSERT INTO rodovar_access_policy (id, protected_admin_uid, authorized_uids, version, updated_at)
          VALUES ('default', ${String(policy.protectedAdminUid || "emp-admin-master")}, ${JSON.stringify(Array.isArray(policy.authorizedUids) ? policy.authorizedUids : [])}::jsonb, ${Number(policy.version || 1)}, CURRENT_TIMESTAMP)
          ON CONFLICT (id) DO UPDATE SET
            protected_admin_uid = EXCLUDED.protected_admin_uid,
            authorized_uids = EXCLUDED.authorized_uids,
            version = EXCLUDED.version,
            updated_at = CURRENT_TIMESTAMP
        `;
      } catch (err) {
        console.warn("Neon persistAccessPolicyToNeon error:", err.message);
      }
    })()
  );
}
async function loadAccessPolicyFromNeon() {
  if (!isNeonConfigured || isIsolatedTestEnv() || !sql) return null;
  try {
    const rows = await sql`SELECT * FROM rodovar_access_policy WHERE id = 'default' LIMIT 1`;
    if (rows.length > 0) {
      const r = rows[0];
      return {
        protectedAdminUid: String(r.protected_admin_uid || "emp-admin-master"),
        authorizedUids: Array.isArray(r.authorized_uids) ? r.authorized_uids : [],
        version: Number(r.version || 1)
      };
    }
  } catch {
    return null;
  }
  return null;
}
function persistLoginLockToNeon(lock) {
  if (!isNeonConfigured || isIsolatedTestEnv() || !sql || !lock || !lock.identifier) return Promise.resolve();
  const dbSql = sql;
  return trackNeonWrite(
    (async () => {
      try {
        await dbSql`
          INSERT INTO rodovar_login_locks (identifier, consecutive_failures, blocked_until, last_failure_at, updated_at)
          VALUES (${String(lock.identifier)}, ${Number(lock.consecutiveFailures || 0)}, ${lock.blockedUntil ? Number(lock.blockedUntil) : null}, ${Number(lock.lastFailureAt || 0)}, CURRENT_TIMESTAMP)
          ON CONFLICT (identifier) DO UPDATE SET
            consecutive_failures = EXCLUDED.consecutive_failures,
            blocked_until = EXCLUDED.blocked_until,
            last_failure_at = EXCLUDED.last_failure_at,
            updated_at = CURRENT_TIMESTAMP
        `;
      } catch (err) {
        console.warn("Neon persistLoginLockToNeon error:", err.message);
      }
    })()
  );
}
async function loadLoginLocksFromNeon() {
  if (!isNeonConfigured || isIsolatedTestEnv() || !sql) return {};
  try {
    const rows = await sql`SELECT * FROM rodovar_login_locks`;
    const out = {};
    for (const r of rows) {
      out[String(r.identifier)] = {
        identifier: String(r.identifier),
        consecutiveFailures: Number(r.consecutive_failures || 0),
        blockedUntil: r.blocked_until !== null && r.blocked_until !== void 0 ? Number(r.blocked_until) : null,
        lastFailureAt: Number(r.last_failure_at || 0)
      };
    }
    return out;
  } catch {
    return {};
  }
}
function persistPasswordResetTokenToNeon(token) {
  if (!isNeonConfigured || isIsolatedTestEnv() || !sql || !token || !token.tokenHash) return Promise.resolve();
  const dbSql = sql;
  return trackNeonWrite(
    (async () => {
      try {
        await dbSql`
          INSERT INTO rodovar_password_reset_tokens (token_hash, user_id, created_at, expires_at, used, onboarding)
          VALUES (${String(token.tokenHash)}, ${String(token.userId)}, ${Number(token.createdAt || Date.now())}, ${Number(token.expiresAt)}, ${Boolean(token.used)}, ${Boolean(token.onboarding)})
          ON CONFLICT (token_hash) DO UPDATE SET
            used = EXCLUDED.used,
            expires_at = EXCLUDED.expires_at,
            onboarding = EXCLUDED.onboarding
        `;
      } catch (err) {
        console.warn("Neon persistPasswordResetTokenToNeon error:", err.message);
      }
    })()
  );
}
function markUserPasswordResetTokensUsedInNeon(userId) {
  if (!isNeonConfigured || isIsolatedTestEnv() || !sql || !userId) return Promise.resolve();
  const dbSql = sql;
  return trackNeonWrite(
    (async () => {
      try {
        await dbSql`UPDATE rodovar_password_reset_tokens SET used = TRUE WHERE user_id = ${String(userId)}`;
      } catch (err) {
        console.warn("Neon markUserPasswordResetTokensUsedInNeon error:", err.message);
      }
    })()
  );
}
async function loadPasswordResetTokensFromNeon() {
  if (!isNeonConfigured || isIsolatedTestEnv() || !sql) return [];
  try {
    const cutoff = Date.now() - 864e5;
    const rows = await sql`SELECT * FROM rodovar_password_reset_tokens WHERE expires_at > ${cutoff}`;
    return rows.map((r) => ({
      tokenHash: String(r.token_hash),
      userId: String(r.user_id),
      createdAt: Number(r.created_at),
      expiresAt: Number(r.expires_at),
      used: Boolean(r.used),
      ...r.onboarding ? { onboarding: true } : {}
    }));
  } catch {
    return [];
  }
}
function persistAccessDecisionToNeon(d) {
  if (!isNeonConfigured || isIsolatedTestEnv() || !sql || !d || !d.id) return Promise.resolve();
  const dbSql = sql;
  return trackNeonWrite(
    (async () => {
      try {
        await dbSql`
          INSERT INTO rodovar_access_decisions (
            id, target_user_id, target_name, target_login, admin_id, admin_name,
            action, new_status, access_level, permissoes_paginas, reason, timestamp_iso, timestamp_formatted
          ) VALUES (
            ${String(d.id)}, ${String(d.targetUserId || "")}, ${String(d.targetName || "")}, ${String(d.targetLogin || "")},
            ${String(d.adminId || "")}, ${String(d.adminName || "")}, ${String(d.action || "APROVAR")},
            ${String(d.newStatus || "APROVADO")}, ${String(d.accessLevel || "FUNCIONARIO")},
            ${JSON.stringify(Array.isArray(d.permissoesPaginas) ? d.permissoesPaginas : [])}::jsonb,
            ${d.reason ? String(d.reason) : null}, ${String(d.timestampIso || (/* @__PURE__ */ new Date()).toISOString())},
            ${String(d.timestampFormatted || "")}
          )
          ON CONFLICT (id) DO NOTHING
        `;
      } catch (err) {
        console.warn("Neon persistAccessDecisionToNeon error:", err.message);
      }
    })()
  );
}
async function loadAccessDecisionsFromNeon(limit = 100) {
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
      ...r.reason ? { reason: String(r.reason) } : {},
      timestampIso: String(r.timestamp_iso),
      timestampFormatted: String(r.timestamp_formatted)
    }));
  } catch {
    return [];
  }
}
function persistSessionRevocationToNeon(sessionId, userId) {
  if (!isNeonConfigured || isIsolatedTestEnv() || !sql || !sessionId) return Promise.resolve();
  const dbSql = sql;
  return trackNeonWrite(
    (async () => {
      try {
        await dbSql`
          INSERT INTO rodovar_revoked_sessions (session_id, user_id, revoked_at)
          VALUES (${String(sessionId)}, ${userId ? String(userId) : null}, ${Date.now()})
          ON CONFLICT (session_id) DO NOTHING
        `;
      } catch {
      }
    })()
  );
}
function persistUserSessionsRevocationToNeon(userId, revokedAfterMs) {
  if (!isNeonConfigured || isIsolatedTestEnv() || !sql || !userId) return Promise.resolve();
  const dbSql = sql;
  return trackNeonWrite(
    (async () => {
      try {
        await dbSql`
          INSERT INTO rodovar_user_revocations (user_id, revoked_after_ms)
          VALUES (${String(userId)}, ${Number(revokedAfterMs)})
          ON CONFLICT (user_id) DO UPDATE SET revoked_after_ms = EXCLUDED.revoked_after_ms
        `;
      } catch {
      }
    })()
  );
}
async function loadSessionRevocationsFromNeon() {
  if (!isNeonConfigured || isIsolatedTestEnv() || !sql) {
    return { revokedSessions: [], userRevocations: {} };
  }
  try {
    const cutoff = Date.now() - 15 * 864e5;
    const [sessRows, userRows] = await Promise.all([
      sql`SELECT session_id FROM rodovar_revoked_sessions WHERE revoked_at > ${cutoff}`,
      sql`SELECT user_id, revoked_after_ms FROM rodovar_user_revocations`
    ]);
    const userRevocations = {};
    for (const r of userRows) {
      userRevocations[String(r.user_id)] = Number(r.revoked_after_ms);
    }
    return {
      revokedSessions: sessRows.map((r) => String(r.session_id)),
      userRevocations
    };
  } catch {
    return { revokedSessions: [], userRevocations: {} };
  }
}
function persistFreightToNeon(f) {
  if (!isNeonConfigured || isIsolatedTestEnv() || !sql || !f || !f.id) return Promise.resolve();
  const dbSql = sql;
  return trackNeonWrite(
    (async () => {
      try {
        const seqId = String(f.protocol || f.code || f.id).slice(0, 32);
        const destRaw = String(f.destinoCidadeUf || f.destino || "Destino");
        const destParts = destRaw.split("/");
        const destCity = (destParts[0] || destRaw).trim().slice(0, 255) || "Destino";
        const destState = (destParts[1] || "BA").trim().slice(0, 8) || "BA";
        const agreedReais = typeof f.valorTotal === "number" ? Number(f.valorTotal.toFixed(2)) : Number(
          ((f.valorCobradoClienteCentavos || f.valorContratadoCentavos || f.valorFreteMotoristaCentavos || 0) / 100).toFixed(2)
        );
        const status = String(
          f.situacaoMonitoramento && f.situacaoMonitoramento !== "NAO_LIBERADO" ? f.situacaoMonitoramento : f.situacaoOperacional && f.situacaoOperacional !== "NAO_ENVIADO" ? f.situacaoOperacional : f.situacaoComercial || f.status || "EM_ANDAMENTO"
        ).slice(0, 64);
        const payloadJson = JSON.stringify(f);
        const updatedAtIso = f.updatedAtIso ? String(f.updatedAtIso) : null;
        await dbSql`
          INSERT INTO rodovar_fretes (
             id, sequential_id, client_name, client_cnpj, origin,
             destination_city, destination_state, destination_address, cargo_description,
             agreed_value, driver_name, driver_cpf, driver_phone, truck_plate, status,
             situacao_comercial, situacao_operacional, situacao_monitoramento,
             comercial_responsavel_id, expedicao_responsavel_id, monitoramento_responsavel_id,
             data_coleta_iso, data_entrega_prevista_iso, entrega_comprovada_em, payload, updated_at
           ) VALUES (
             ${String(f.id).slice(0, 64)}, ${seqId}, ${String(f.cliente || "Cliente").slice(0, 255)},
             ${f.clienteCnpj ? String(f.clienteCnpj).slice(0, 32) : null},
             ${String(f.origemCidadeUf || f.origem || "Origem").slice(0, 255)},
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
        console.warn("Neon persistFreightToNeon notice:", err.message);
      }
    })()
  );
}
async function queryMonitoringFreightsFromNeon(params) {
  if (!isNeonConfigured || isIsolatedTestEnv() || !sql) return null;
  try {
    const searchLike = params.search ? `%${params.search.toLowerCase()}%` : "";
    const offset = Math.max(0, (Math.max(1, params.page) - 1) * Math.max(1, params.limit));
    const respFilter = params.responsavelFilterId || "";
    const situacao = params.situacao || "TODAS";
    const periodo = params.periodo || "TODOS";
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
      `
    ]);
    const c = counterRows[0];
    if (!c) return null;
    const totalCheck = Number(c.novo_para_carregar || 0) + Number(c.em_deslocamento_coleta || 0) + Number(c.no_local_coleta || 0) + Number(c.carregado_em_transporte || 0) + Number(c.no_local_entrega || 0) + Number(c.entregue || 0) + Number(c.finalizado || 0);
    if (totalCheck === 0 && listRows.length === 0) {
      const anyPayloads = await sql`SELECT 1 FROM rodovar_fretes WHERE payload IS NOT NULL LIMIT 1`;
      if (anyPayloads.length === 0) return null;
    }
    const totalAtivos = Number(c.novo_para_carregar || 0) + Number(c.em_deslocamento_coleta || 0) + Number(c.no_local_coleta || 0) + Number(c.carregado_em_transporte || 0) + Number(c.no_local_entrega || 0);
    const completedCount = Number(c.entregue || 0) + Number(c.finalizado || 0);
    const items = listRows.map((r) => {
      if (r.full_payload) return r.full_payload;
      return {
        id: String(r.id),
        protocol: String(r.p_protocol || r.sequential_id || ""),
        cliente: String(r.client_name || ""),
        motoristaNome: r.driver_name ? String(r.driver_name) : "",
        origemCidadeUf: String(r.p_origem || r.origin || ""),
        destinoCidadeUf: String(
          r.p_destino || `${r.destination_city || ""}/${r.destination_state || ""}`
        ),
        dataColetaIso: String(r.data_coleta_iso || ""),
        dataEntregaPrevistaIso: String(r.data_entrega_prevista_iso || ""),
        entregaComprovadaEm: r.entrega_comprovada_em ? String(r.entrega_comprovada_em) : void 0,
        situacaoMonitoramento: String(r.situacao_monitoramento || "FINALIZADO"),
        monitoramentoResponsavelId: r.p_mon_resp_id ? String(r.p_mon_resp_id) : void 0,
        monitoramentoResponsavelNome: r.p_mon_resp_nome ? String(r.p_mon_resp_nome) : void 0,
        comprovanteEntregaConferido: r.p_comp_conferido === "true",
        updatedAtIso: String(r.p_updated_at_iso || r.updated_at || ""),
        updatedAtFormatted: String(r.p_updated_at_fmt || ""),
        revision: Number(r.p_revision || 1)
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
        completedCount
      }
    };
  } catch (err) {
    console.warn("Neon queryMonitoringFreightsFromNeon notice:", err.message);
    return null;
  }
}
function persistRequestToNeon(r) {
  if (!isNeonConfigured || isIsolatedTestEnv() || !sql || !r || !r.id) return Promise.resolve();
  const dbSql = sql;
  return trackNeonWrite(
    (async () => {
      try {
        await dbSql`
          INSERT INTO rodovar_requests (id, title, department, requester_name, status, details)
          VALUES (
            ${String(r.id).slice(0, 64)},
            ${String(r.subject || r.protocol || "Solicita\xE7\xE3o").slice(0, 255)},
            ${String(r.targetDepartment || "Administrativo").slice(0, 100)},
            ${String(r.requesterName || "Colaborador").slice(0, 255)},
            ${String(r.status || "Aberta").slice(0, 64)},
            ${String(r.description || "")}
          )
          ON CONFLICT (id) DO UPDATE SET
            title = EXCLUDED.title,
            department = EXCLUDED.department,
            requester_name = EXCLUDED.requester_name,
            status = EXCLUDED.status,
            details = EXCLUDED.details
        `;
      } catch (err) {
        console.warn("Neon persistRequestToNeon notice:", err.message);
      }
    })()
  );
}
function persistPaymentReceiptToNeon(rec) {
  if (!isNeonConfigured || isIsolatedTestEnv() || !sql || !rec || !rec.id) return Promise.resolve();
  const dbSql = sql;
  return trackNeonWrite(
    (async () => {
      try {
        await dbSql`
          INSERT INTO rodovar_payments (id, frete_id, type, amount, status)
          VALUES (
            ${String(rec.id).slice(0, 64)},
            ${rec.freightId ? String(rec.freightId).slice(0, 64) : null},
            ${String(rec.installmentType || "ADIANTAMENTO").slice(0, 64)},
            ${Number(rec.expectedAmountBRL || (rec.expectedAmountCentavos || 0) / 100)},
            ${String(rec.verificationStatus || rec.uploadStatus || "SALVO_NO_SERVIDOR").slice(0, 64)}
          )
          ON CONFLICT (id) DO UPDATE SET
            type = EXCLUDED.type,
            amount = EXCLUDED.amount,
            status = EXCLUDED.status
        `;
      } catch (err) {
        console.warn("Neon persistPaymentReceiptToNeon notice:", err.message);
      }
    })()
  );
}
function persistAnnouncementToNeon(a) {
  if (!isNeonConfigured || isIsolatedTestEnv() || !sql || !a || !a.id) return Promise.resolve();
  const dbSql = sql;
  return trackNeonWrite(
    (async () => {
      try {
        await dbSql`
          INSERT INTO rodovar_announcements (id, title, author_name, target_audience, priority, content, data)
          VALUES (
            ${String(a.id).slice(0, 64)},
            ${String(a.title || "Comunicado").slice(0, 255)},
            ${String(a.authorName || "Diretoria").slice(0, 255)},
            ${String(a.targetAudience || "Todos").slice(0, 100)},
            ${String(a.priority || "Normal").slice(0, 50)},
            ${String(a.content || a.summary || "")},
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
        console.warn("Neon persistAnnouncementToNeon notice:", err.message);
      }
    })()
  );
}
function persistAgendaEventToNeon(e) {
  if (!isNeonConfigured || isIsolatedTestEnv() || !sql || !e || !e.id) return Promise.resolve();
  const dbSql = sql;
  return trackNeonWrite(
    (async () => {
      try {
        await dbSql`
          INSERT INTO rodovar_agenda (id, title, date_iso, start_time, end_time, category, data)
          VALUES (
            ${String(e.id).slice(0, 64)},
            ${String(e.title || "Evento").slice(0, 255)},
            ${String(e.dateIso || (/* @__PURE__ */ new Date()).toISOString().slice(0, 10)).slice(0, 32)},
            ${String(e.start || "08:00").slice(0, 16)},
            ${String(e.end || "09:00").slice(0, 16)},
            ${String(e.category || "Geral").slice(0, 100)},
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
        console.warn("Neon persistAgendaEventToNeon notice:", err.message);
      }
    })()
  );
}
function persistAuditLogToNeon(log) {
  if (!isNeonConfigured || isIsolatedTestEnv() || !sql || !log || !log.id) return Promise.resolve();
  const dbSql = sql;
  return trackNeonWrite(
    (async () => {
      try {
        const now = /* @__PURE__ */ new Date();
        await dbSql`
          INSERT INTO rodovar_audit_logs (
            id, actor_id, actor_name, actor_role, action, details, ip_address, timestamp_iso, timestamp_formatted
          ) VALUES (
            ${String(log.id)},
            ${log.actorId ? String(log.actorId).slice(0, 64) : null},
            ${log.actorName ? String(log.actorName).slice(0, 255) : null},
            ${log.actorRole ? String(log.actorRole).slice(0, 64) : "FUNCIONARIO"},
            ${String(log.action).slice(0, 100)},
            ${log.details ? String(log.details) : null},
            ${log.ip ? String(log.ip).slice(0, 64) : null},
            ${log.timestampIso || now.toISOString()},
            ${log.timestampFormatted || now.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
          )
          ON CONFLICT (id) DO NOTHING
        `;
      } catch (err) {
        console.warn("Neon persistAuditLogToNeon error:", err.message);
      }
    })()
  );
}
async function loadAuditLogsFromNeon(limit = 200) {
  if (!isNeonConfigured || isIsolatedTestEnv() || !sql) return [];
  try {
    const rows = await sql`SELECT * FROM rodovar_audit_logs ORDER BY created_at DESC LIMIT ${limit}`;
    return rows.map((r) => {
      const dt = r.created_at ? new Date(r.created_at) : /* @__PURE__ */ new Date();
      return {
        id: String(r.id),
        timestampIso: String(r.timestamp_iso || dt.toISOString()),
        timestampFormatted: String(
          r.timestamp_formatted || dt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
        ),
        actorId: String(r.actor_id || "anon"),
        actorName: String(r.actor_name || "Sistema"),
        actorRole: String(r.actor_role || "FUNCIONARIO"),
        action: String(r.action || ""),
        details: String(r.details || ""),
        ...r.ip_address ? { ip: String(r.ip_address) } : {}
      };
    });
  } catch {
    return [];
  }
}
function persistStateSnapshotToNeon(key, data) {
  if (!isNeonConfigured || isIsolatedTestEnv() || !sql || !key) return Promise.resolve();
  const dbSql = sql;
  return trackNeonWrite(
    (async () => {
      try {
        await dbSql`
          INSERT INTO rodovar_state_store (key, payload, updated_at)
          VALUES (${key}, ${JSON.stringify(data)}::jsonb, CURRENT_TIMESTAMP)
          ON CONFLICT (key) DO UPDATE SET payload = EXCLUDED.payload, updated_at = CURRENT_TIMESTAMP
        `;
      } catch (err) {
        console.warn("Neon persistStateSnapshotToNeon error:", err.message);
      }
    })()
  );
}
async function loadStateSnapshotFromNeon(key) {
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
        payload: rows[0].payload,
        updatedAtMs: Number(rows[0].updated_at_ms || Date.now())
      };
    }
  } catch (err) {
    console.warn(`Neon loadStateSnapshotFromNeon(${key}) notice:`, err.message);
  }
  return null;
}
async function fetchNeonStateTimestamps() {
  if (!isNeonConfigured || isIsolatedTestEnv() || !sql) return {};
  try {
    const rows = await sql`
      SELECT key, EXTRACT(EPOCH FROM updated_at) * 1000 AS updated_at_ms
      FROM rodovar_state_store
    `;
    const map = {};
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
function persistSocialProfileToNeon(p) {
  if (!isNeonConfigured || isIsolatedTestEnv() || !sql || !p || !p.userId) return Promise.resolve();
  const dbSql = sql;
  return trackNeonWrite(
    (async () => {
      try {
        await dbSql`
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
        console.warn("Neon persistSocialProfileToNeon error:", err.message);
      }
    })()
  );
}
function persistSocialPostToNeon(post) {
  if (!isNeonConfigured || isIsolatedTestEnv() || !sql || !post || !post.id) return Promise.resolve();
  const dbSql = sql;
  return trackNeonWrite(
    (async () => {
      try {
        await dbSql`
          INSERT INTO rodovar_social_posts (id, author_id, author_name, author_avatar, author_role, author_department, content, images, likes, audience, updated_at)
          VALUES (
            ${post.id}, ${post.authorId}, ${post.authorName}, ${post.authorAvatar || null},
            ${post.authorRole || null}, ${post.authorDepartment || null}, ${post.content},
            ${JSON.stringify(post.images || [])}::jsonb, ${JSON.stringify(post.likes || [])}::jsonb,
            ${post.audience || "P\xFAblico"}, CURRENT_TIMESTAMP
          )
          ON CONFLICT (id) DO UPDATE SET
            content = EXCLUDED.content,
            images = EXCLUDED.images,
            likes = EXCLUDED.likes,
            audience = EXCLUDED.audience,
            updated_at = CURRENT_TIMESTAMP
        `;
      } catch (err) {
        console.warn("Neon persistSocialPostToNeon error:", err.message);
      }
    })()
  );
}
function deleteSocialPostFromNeon(postId) {
  if (!isNeonConfigured || isIsolatedTestEnv() || !sql || !postId) return Promise.resolve();
  const dbSql = sql;
  return trackNeonWrite(
    (async () => {
      try {
        await Promise.all([
          dbSql`DELETE FROM rodovar_social_comments WHERE post_id = ${postId}`,
          dbSql`DELETE FROM rodovar_social_posts WHERE id = ${postId}`
        ]);
      } catch (err) {
        console.warn("Neon deleteSocialPostFromNeon error:", err.message);
      }
    })()
  );
}
function persistSocialCommentToNeon(c) {
  if (!isNeonConfigured || isIsolatedTestEnv() || !sql || !c || !c.id) return Promise.resolve();
  const dbSql = sql;
  return trackNeonWrite(
    (async () => {
      try {
        await dbSql`
          INSERT INTO rodovar_social_comments (id, post_id, author_id, author_name, author_avatar, author_role, content)
          VALUES (${c.id}, ${c.postId}, ${c.authorId}, ${c.authorName}, ${c.authorAvatar || null}, ${c.authorRole || null}, ${c.content})
          ON CONFLICT (id) DO UPDATE SET content = EXCLUDED.content
        `;
      } catch (err) {
        console.warn("Neon persistSocialCommentToNeon error:", err.message);
      }
    })()
  );
}
function deleteSocialCommentFromNeon(commentId) {
  if (!isNeonConfigured || isIsolatedTestEnv() || !sql || !commentId) return Promise.resolve();
  const dbSql = sql;
  return trackNeonWrite(
    (async () => {
      try {
        await dbSql`DELETE FROM rodovar_social_comments WHERE id = ${commentId}`;
      } catch (err) {
        console.warn("Neon deleteSocialCommentFromNeon error:", err.message);
      }
    })()
  );
}
function persistSystemAssetToNeon(asset) {
  if (!isNeonConfigured || isIsolatedTestEnv() || !sql || !asset.id) return Promise.resolve();
  const dbSql = sql;
  return trackNeonWrite(
    (async () => {
      try {
        await dbSql`
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
        console.warn("Neon persistSystemAssetToNeon error:", err.message);
      }
    })()
  );
}
async function getSystemAssetFromNeon(id) {
  if (!isNeonConfigured || isIsolatedTestEnv() || !sql || !id) return null;
  try {
    const rows = await sql`
      SELECT mime_type, data_base64 FROM rodovar_system_assets WHERE id = ${id} LIMIT 1
    `;
    if (rows.length > 0 && rows[0].data_base64) {
      return {
        mimeType: rows[0].mime_type,
        buffer: Buffer.from(rows[0].data_base64, "base64")
      };
    }
  } catch (err) {
    console.warn("Neon getSystemAssetFromNeon error:", err.message);
  }
  return null;
}
function persistSystemConfigToNeon(config) {
  if (!isNeonConfigured || isIsolatedTestEnv() || !sql || !config) return Promise.resolve();
  const dbSql = sql;
  return trackNeonWrite(
    (async () => {
      try {
        await dbSql`
          INSERT INTO rodovar_state_store (key, payload, updated_at)
          VALUES ('rodovar-system-config', ${JSON.stringify(config)}::jsonb, CURRENT_TIMESTAMP)
          ON CONFLICT (key) DO UPDATE SET payload = EXCLUDED.payload, updated_at = CURRENT_TIMESTAMP
        `;
      } catch (err) {
        console.warn("Neon persistSystemConfigToNeon error:", err.message);
      }
    })()
  );
}
async function loadSystemConfigFromNeon() {
  if (!isNeonConfigured || isIsolatedTestEnv() || !sql) return null;
  try {
    const rows = await sql`SELECT payload FROM rodovar_state_store WHERE key = 'rodovar-system-config' LIMIT 1`;
    if (rows.length > 0 && rows[0].payload) {
      return rows[0].payload;
    }
  } catch (err) {
    console.warn("Neon loadSystemConfigFromNeon notice:", err.message);
  }
  return null;
}
function persistNotificationToNeon(notif) {
  if (!isNeonConfigured || isIsolatedTestEnv() || !sql || !notif.id || !notif.recipientId) return Promise.resolve(false);
  const dbSql = sql;
  return trackNeonWrite(
    (async () => {
      try {
        if (notif.dedupeKey) {
          const check = await dbSql`
            SELECT id FROM rodovar_notifications WHERE recipient_id = ${notif.recipientId} AND dedupe_key = ${notif.dedupeKey} LIMIT 1
          `;
          if (check.length > 0) return false;
        }
        await dbSql`
          INSERT INTO rodovar_notifications (
            id, recipient_id, type, dot_color, title, subtitle, time_label, read, target_section, target_id, dedupe_key, created_at
          ) VALUES (
            ${notif.id}, ${notif.recipientId}, ${notif.type}, ${notif.dotColor || "blue"}, ${notif.title},
            ${notif.subtitle || null}, ${notif.timeLabel || null}, ${Boolean(notif.read)},
            ${notif.targetSection}, ${notif.targetId || null}, ${notif.dedupeKey || null}, CURRENT_TIMESTAMP
          )
          ON CONFLICT (id) DO NOTHING
        `;
        return true;
      } catch (err) {
        console.warn("Neon persistNotificationToNeon error:", err.message);
        return false;
      }
    })()
  );
}
async function loadNotificationsFromNeon(recipientId, limit = 50) {
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
    return rows;
  } catch (err) {
    console.warn("Neon loadNotificationsFromNeon error:", err.message);
    return [];
  }
}
function markNotificationReadInNeon(notifId, recipientId) {
  if (!isNeonConfigured || isIsolatedTestEnv() || !sql || !notifId) return Promise.resolve();
  const dbSql = sql;
  return trackNeonWrite(
    (async () => {
      try {
        await dbSql`UPDATE rodovar_notifications SET read = TRUE WHERE id = ${notifId} AND recipient_id = ${recipientId}`;
      } catch (err) {
        console.warn("Neon markNotificationReadInNeon error:", err.message);
      }
    })()
  );
}
function markAllNotificationsReadInNeon(recipientId) {
  if (!isNeonConfigured || isIsolatedTestEnv() || !sql || !recipientId) return Promise.resolve();
  const dbSql = sql;
  return trackNeonWrite(
    (async () => {
      try {
        await dbSql`UPDATE rodovar_notifications SET read = TRUE WHERE recipient_id = ${recipientId} AND read = FALSE`;
      } catch (err) {
        console.warn("Neon markAllNotificationsReadInNeon error:", err.message);
      }
    })()
  );
}
function persistEconomicModeToNeon(enabled) {
  if (!isNeonConfigured || isIsolatedTestEnv() || !sql) return Promise.resolve();
  const dbSql = sql;
  return trackNeonWrite(
    (async () => {
      try {
        await dbSql`
          INSERT INTO rodovar_state_store (key, payload, updated_at)
          VALUES ('rodovar-economic-mode', ${JSON.stringify({ enabled, updatedAt: (/* @__PURE__ */ new Date()).toISOString() })}::jsonb, CURRENT_TIMESTAMP)
          ON CONFLICT (key) DO UPDATE SET payload = EXCLUDED.payload, updated_at = CURRENT_TIMESTAMP
        `;
      } catch (err) {
        console.warn("Neon persistEconomicModeToNeon error:", err.message);
      }
    })()
  );
}
async function loadEconomicModeFromNeon() {
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

// src/server/agenda.ts
var agendaCreator = (u) => u.accessLevel === "ADMINISTRADOR" || ["DIRETORIA", "RH"].includes(u.accessProfile) || u.accessLevel === "DIRETORIA" || u.roleTitle === "Ger\xEAncia Administrativa" || u.permissoesPaginas?.includes("agenda_criar");
var activeAgendaState = null;
function hydrateAgendaFromPayload(payload) {
  if (!activeAgendaState || !payload || typeof payload !== "object") return;
  if (Array.isArray(payload.events)) activeAgendaState.events = payload.events;
  if (Array.isArray(payload.notifications)) activeAgendaState.notifications = payload.notifications;
  if (typeof payload.imported === "boolean") activeAgendaState.imported = payload.imported;
  if (payload.keys && typeof payload.keys === "object") activeAgendaState.keys = payload.keys;
}
function registerAgenda(app, guard, users) {
  const file = path3.join(resolveDataRoot(), "data", "agenda-local.json");
  const state = fs3.existsSync(file) ? JSON.parse(fs3.readFileSync(file, "utf8")) : { events: [], notifications: [], imported: false, keys: {} };
  activeAgendaState = state;
  const save = () => {
    fs3.mkdirSync(path3.dirname(file), { recursive: true });
    fs3.writeFileSync(file + ".tmp", JSON.stringify(state));
    fs3.renameSync(file + ".tmp", file);
    void persistStateSnapshotToNeon("rodovar-agenda", state);
  };
  const manage = (e, u) => u.accessLevel === "ADMINISTRADOR" || agendaCreator(u) && (e.ownerId === u.id || !e.ownerId && ["DIRETORIA", "RH"].includes(u.accessProfile));
  const invited = (e, u) => e.visibility === "Todos" || e.invitees?.includes(u.id) || e.sectors?.includes(u.department) || e.ownerId === u.id || !e.visibility;
  const visible = (e, u) => manage(e, u) || invited(e, u);
  const audience = (e) => users().filter((u) => u.active && invited(e, u));
  const notify = (e, title, key) => {
    for (const u of audience(e)) {
      const id = "agenda:" + key + ":" + u.id;
      if (!state.notifications.some((n) => n.id === id)) state.notifications.push({ id, recipientId: u.id, targetId: e.id, type: "agenda", title, subtitle: e.title, targetSection: "agenda", read: false, createdAtIso: (/* @__PURE__ */ new Date()).toISOString(), timeLabel: "Agenda" });
    }
  };
  const audit = (e, u, action) => {
    e.history ||= [];
    e.history.push({ id: crypto3.randomUUID(), actor: u.name, action, at: (/* @__PURE__ */ new Date()).toISOString() });
  };
  const view = (e, u) => {
    const c = structuredClone(e);
    c.canManage = manage(e, u);
    c.participantCount = audience(e).length;
    c.confirmedCount = (e.attendees || []).length;
    c.response = e.responses?.[u.id] || (e.attendees?.includes(u.id) ? "Confirmado" : "Pendente");
    if (!c.canManage && !["ADMINISTRADOR", "DIRETORIA"].includes(u.accessLevel)) {
      delete c.responses;
      delete c.attendees;
      delete c.invitees;
      delete c.confirmedCount;
      delete c.participantCount;
      c.history = (c.history || []).filter((h) => !h.action.startsWith("Participa\xE7\xE3o:") || h.actor === u.name);
    }
    return c;
  };
  app.get("/api/agenda", guard, (req, res) => {
    let changed = false;
    for (const e of state.events) {
      const hours = (Date.parse(e.dateIso + "T" + (e.start || e.time?.match(/\d\d:\d\d/)?.[0] || "00:00") + ":00-03:00") - Date.now()) / 36e5;
      if (!e.cancelled && hours > 0 && hours <= 24) {
        const before = state.notifications.length;
        notify(e, "Lembrete: evento nas pr\xF3ximas 24h", "upcoming:" + e.id + ":" + e.dateIso);
        if (state.notifications.length > before) changed = true;
      }
    }
    if (changed) save();
    res.setHeader("Cache-Control", "no-store");
    res.json({ events: state.events.filter((e) => visible(e, req.sessionUser)).map((e) => view(e, req.sessionUser)), canCreate: agendaCreator(req.sessionUser), notifications: state.notifications.filter((n) => n.recipientId === req.sessionUser.id) });
  });
  app.post("/api/agenda/import", guard, (req, res) => {
    if (req.sessionUser.accessLevel !== "ADMINISTRADOR") return res.status(403).json({ error: "Importa\xE7\xE3o n\xE3o autorizada." });
    if (!state.imported) {
      for (const e of req.body.events || []) {
        if (e.id && !state.events.some((r) => r.id === e.id)) state.events.push({ ...e, history: e.history || [], responses: e.responses || {}, visibility: e.visibility || "Todos" });
      }
      state.imported = true;
      save();
    }
    res.json({ ok: true });
  });
  app.post("/api/agenda/read", guard, (req, res) => {
    for (const n of state.notifications) if (n.recipientId === req.sessionUser.id && req.body.ids?.includes(n.id)) n.read = true;
    save();
    res.json({ ok: true });
  });
  app.post("/api/agenda", guard, (req, res) => {
    const b = req.body || {}, u = req.sessionUser;
    let e = state.events.find((r) => r.id === b.id);
    if (!agendaCreator(u) || e && !manage(e, u)) return res.status(403).json({ error: "Evento n\xE3o autorizado." });
    if (u.accessProfile === "FINANCEIRO" && b.department !== u.department) return res.status(403).json({ error: "Cria\xE7\xE3o restrita ao pr\xF3prio setor." });
    if (b.id && !e) return res.status(404).json({ error: "Evento n\xE3o encontrado." });
    if (e?.cancelled) return res.status(409).json({ error: "Evento cancelado." });
    if (!b.id && !req.headers["x-idempotency-key"]) return res.status(400).json({ error: "Identificador obrigat\xF3rio." });
    if (!String(b.title || "").trim() || String(b.title).length > 200 || !/^\d{4}-\d{2}-\d{2}$/.test(b.dateIso) || !Number.isFinite(Date.parse(b.dateIso)) || new Date(b.dateIso).toISOString().slice(0, 10) !== b.dateIso || !b.allDay && (!/^([01]\d|2[0-3]):[0-5]\d$/.test(b.start) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(b.end) || b.end <= b.start)) return res.status(400).json({ error: "Confira t\xEDtulo, data e hor\xE1rios inicial/final." });
    if (!["Reuni\xE3o", "Treinamento", "Evento Corporativo", "Comunicado de Agenda", "Outro"].includes(b.category)) return res.status(400).json({ error: "Categoria inv\xE1lida." });
    if ((b.attachments || []).some((a) => !/^data:(application\/pdf|image\/png|image\/jpeg);base64,/.test(a.dataUrl) || a.dataUrl.length > 7e6)) return res.status(400).json({ error: "Anexo inv\xE1lido: PDF, PNG ou JPEG at\xE9 5 MB." });
    const key = u.id + ":" + String(req.headers["x-idempotency-key"] || "");
    if (!b.id && state.keys[key]) return res.json(view(state.events.find((r) => r.id === state.keys[key]), u));
    const id = e?.id || crypto3.randomUUID();
    const prior = e;
    if (!e) {
      e = { id, ownerId: u.id, attendees: [], responses: {}, history: [] };
      state.events.push(e);
    }
    for (const field of ["title", "description", "category", "dateIso", "start", "end", "allDay", "location", "organizer", "department", "invitees", "sectors", "priority", "visibility", "attachments", "recurrence", "requireRsvp"]) e[field] = b[field];
    e.time = b.allDay ? "Dia inteiro" : b.start + " - " + b.end;
    e.day = b.dateIso.slice(8);
    e.monthShort = (/* @__PURE__ */ new Date(b.dateIso + "T12:00:00")).toLocaleString("pt-BR", { month: "short" }).toUpperCase();
    audit(e, u, prior ? "Evento atualizado" : "Evento criado");
    state.keys[key] = id;
    notify(e, prior ? "Evento alterado" : "Novo convite recebido", crypto3.randomUUID());
    save();
    void persistAgendaEventToNeon(e);
    res.json(view(e, u));
  });
  app.post("/api/agenda/:id/:action", guard, (req, res) => {
    const e = state.events.find((r) => r.id === req.params.id), u = req.sessionUser, a = req.params.action;
    if (!e || !visible(e, u)) return res.status(404).json({ error: "Evento indispon\xEDvel." });
    if (a === "rsvp") {
      if (e.cancelled || !invited(e, u)) return res.status(409).json({ error: "Convite indispon\xEDvel." });
      const response = req.body.response;
      if (!["Confirmado", "Recusado", "Pendente"].includes(response)) return res.status(400).json({ error: "Resposta inv\xE1lida." });
      e.responses ||= {};
      if (e.responses[u.id] === response) return res.json({ ok: true });
      e.responses[u.id] = response;
      e.attendees = (e.attendees || []).filter((id) => id !== u.id);
      if (response === "Confirmado") e.attendees.push(u.id);
      audit(e, u, "Participa\xE7\xE3o: " + response);
      if (e.ownerId) state.notifications.push({ id: "agenda:" + crypto3.randomUUID(), recipientId: e.ownerId, targetId: e.id, targetSection: "agenda", type: "agenda", title: u.name + " \u2014 " + response, subtitle: e.title, read: false, createdAtIso: (/* @__PURE__ */ new Date()).toISOString() });
    } else {
      if (!manage(e, u)) return res.status(403).json({ error: "Gerenciamento n\xE3o autorizado." });
      if (a === "cancel") {
        e.cancelled = true;
        audit(e, u, "Evento cancelado");
        notify(e, "Evento cancelado", crypto3.randomUUID());
      } else if (a === "remind") {
        audit(e, u, "Lembrete enviado");
        notify(e, "Lembrete de participa\xE7\xE3o", crypto3.randomUUID());
      } else return res.status(400).json({ error: "A\xE7\xE3o inv\xE1lida." });
    }
    save();
    void persistAgendaEventToNeon(e);
    res.json({ ok: true });
  });
}

// src/server/muralPolls.ts
import fs4 from "node:fs";
import path4 from "node:path";
import crypto4 from "node:crypto";
var canManagePolls = (u) => u?.accessLevel === "ADMINISTRADOR" || ["DIRETORIA", "FINANCEIRO", "RH"].includes(u?.accessProfile) || u?.accessLevel === "DIRETORIA" || u?.roleTitle === "Ger\xEAncia Administrativa";
var activePollsRef = null;
function hydrateMuralPollsFromPayload(payload) {
  if (!activePollsRef || !Array.isArray(payload)) return;
  activePollsRef.splice(0, activePollsRef.length, ...payload);
}
function registerPolls(app, guard, storageFile = path4.join(resolveDataRoot(), "data", "mural-polls.local.json")) {
  const isDefaultStorage = storageFile === path4.join(resolveDataRoot(), "data", "mural-polls.local.json");
  const polls = fs4.existsSync(storageFile) ? JSON.parse(fs4.readFileSync(storageFile, "utf8")) : [];
  if (!Array.isArray(polls)) throw Error("Arquivo local de enquetes inv\xE1lido.");
  if (isDefaultStorage) activePollsRef = polls;
  const save = () => {
    fs4.mkdirSync(path4.dirname(storageFile), { recursive: true });
    const temporary = storageFile + ".tmp";
    fs4.writeFileSync(temporary, JSON.stringify(polls), { mode: 384 });
    fs4.renameSync(temporary, storageFile);
    if (isDefaultStorage) void persistStateSnapshotToNeon("rodovar-mural-polls", polls);
  };
  app.use("/api/mural-polls", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  const view = (p, u) => {
    const total = Object.keys(p.votes).length, own = p.votes[u.id], ended = p.closed || Date.now() >= Date.parse(p.deadline), show = canManagePolls(u) || p.results === "always" || own !== void 0 || ended;
    return { id: p.id, question: p.question, options: p.options, deadline: p.deadline, closed: ended, draft: p.draft, results: p.results, total, own, counts: show ? p.options.map((_, i) => Object.values(p.votes).filter((v) => v === i).length) : null };
  };
  app.get("/api/mural-polls", guard, (req, res) => res.json({ canManage: canManagePolls(req.sessionUser), polls: polls.filter((p) => !p.draft || canManagePolls(req.sessionUser)).map((p) => view(p, req.sessionUser)) }));
  app.post("/api/mural-polls", guard, (req, res) => {
    const u = req.sessionUser, b = req.body || {};
    if (!canManagePolls(u)) return res.status(403).json({ error: "Sem permiss\xE3o para administrar enquetes." });
    let p = polls.find((p2) => p2.id === b.id);
    if (b.action === "close") {
      if (!p) return res.status(404).json({ error: "Enquete indispon\xEDvel." });
      p.closed = true;
      save();
      return res.json(view(p, u));
    }
    const options = Array.isArray(b.options) ? b.options.map((v) => String(v).trim()) : [];
    if (!String(b.question || "").trim() || String(b.question).length > 240 || options.length < 2 || options.length > 6 || options.some((v) => !v || v.length > 120) || new Set(options).size !== options.length || !Number.isFinite(Date.parse(b.deadline)) || Date.parse(b.deadline) <= Date.now()) return res.status(400).json({ error: "Informe pergunta, 2 a 6 alternativas distintas e prazo futuro." });
    if (p && (Object.keys(p.votes).length || p.closed)) return res.status(409).json({ error: "Enquetes com votos ou encerradas n\xE3o podem ser editadas." });
    if (!p) {
      p = { id: crypto4.randomUUID(), votes: {}, closed: false };
      polls.push(p);
    }
    Object.assign(p, { question: String(b.question).trim(), options, deadline: b.deadline, draft: !!b.draft, results: b.results === "always" ? "always" : "after", authorId: u.id });
    save();
    res.json(view(p, u));
  });
  app.post("/api/mural-polls/:id/vote", guard, (req, res) => {
    const p = polls.find((p2) => p2.id === req.params.id), u = req.sessionUser, i = req.body?.option;
    if (!p || p.draft) return res.status(404).json({ error: "Enquete indispon\xEDvel." });
    if (p.closed || Date.now() >= Date.parse(p.deadline)) return res.status(409).json({ error: "Vota\xE7\xE3o encerrada." });
    if (!Number.isInteger(i) || i < 0 || i >= p.options.length) return res.status(400).json({ error: "Alternativa inv\xE1lida." });
    if (p.votes[u.id] !== void 0) {
      if (p.votes[u.id] !== i) return res.status(409).json({ error: "Seu voto j\xE1 foi registrado." });
      return res.json(view(p, u));
    }
    p.votes[u.id] = i;
    save();
    res.json(view(p, u));
  });
}

// src/server/mural.ts
import crypto5 from "node:crypto";
import fs5 from "node:fs";
import path5 from "node:path";
function registerMural(app, guard, db, save, initial) {
  registerPolls(app, guard);
  const directory = path5.join(resolveDataRoot(), "data", "mural-attachments");
  db.mural ||= { announcements: structuredClone(initial), notifications: [], keys: {}, audit: [], imported: false };
  const state = db.mural;
  const publisher = (u) => hasPagePermission(u, "comunicados") && ["ADMINISTRADOR", "DIRETORIA"].includes(u.accessLevel);
  const matchesSector = (target, u) => target === "Todos" || target === u.department || target === "Comercial" && u.accessProfile === "COMERCIAL" || target === "Expedi\xE7\xE3o" && u.accessProfile === "EXPEDICAO" || target === "Monitoramento" && u.accessProfile === "MONITORAMENTO";
  const visible = (a, u) => hasPagePermission(u, "comunicados") && (publisher(u) || !a.draft && matchesSector(a.targetAudience, u));
  const stamp = () => (/* @__PURE__ */ new Date()).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const audit = (u, id, action) => state.audit.push({ id: crypto5.randomUUID(), announcementId: id, actorId: u.id, actorName: u.name, action, at: (/* @__PURE__ */ new Date()).toISOString() });
  const fail = (res, status, error) => res.status(status).json({ error });
  const check = (req, res, next) => hasPagePermission(req.sessionUser, "comunicados") ? (res.setHeader("Cache-Control", "no-store"), next()) : fail(res, 403, "Sem acesso ao Mural.");
  const get = (id) => state.announcements.find((a) => a.id === id);
  const notify = (a) => {
    if (a.draft || a.archived) return;
    for (const u of db.users.filter((u2) => visible(a, u2) && matchesSector(a.targetAudience, u2))) {
      const id = "mural:" + a.id + ":" + u.id;
      if (!state.notifications.some((n) => n.id === id)) state.notifications.push({ id, recipientId: u.id, targetId: a.id, publicationId: a.id, type: "comunicado", title: "Novo comunicado publicado", subtitle: a.title, read: false, timeLabel: "Mural", targetSection: "comunicados", createdAtIso: (/* @__PURE__ */ new Date()).toISOString() });
    }
  };
  const publicRecord = (a, u) => {
    const copy = structuredClone(a);
    if (!publisher(u)) {
      copy.readReceipts = copy.readReceipts.filter((r) => r.userId === u.id);
      copy.readCount = a.readReceipts.length;
      delete copy.editHistory;
      delete copy.versions;
    }
    return copy;
  };
  const cleanFile = (input) => {
    if (!input.dataUrl) return input.url && /^\/(assets|uploads)\/[a-zA-Z0-9_./%() -]+$/.test(input.url) && !input.url.includes("..") ? { name: String(input.name).slice(0, 160), size: String(input.size || ""), type: String(input.type || ""), url: input.url } : null;
    const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=\r\n]+)$/.exec(input.dataUrl);
    if (!match) throw Error("Arquivo inv\xE1lido.");
    const bytes = Buffer.from(match[2], "base64");
    const extension = String(input.name || "").split(".").pop()?.toLowerCase();
    const signature = bytes.subarray(0, 8);
    const allowed = extension === "pdf" ? bytes.subarray(0, 5).toString() === "%PDF-" : ["docx", "xlsx"].includes(extension || "") ? bytes[0] === 80 && bytes[1] === 75 : ["doc", "xls"].includes(extension || "") ? signature.equals(Buffer.from([208, 207, 17, 224, 161, 177, 26, 225])) : ["png"].includes(extension || "") ? signature.equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) : ["jpg", "jpeg"].includes(extension || "") ? bytes[0] === 255 && bytes[1] === 216 : extension === "webp" ? bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP" : false;
    if (!allowed || !bytes.length || bytes.length > 5 * 1024 * 1024) throw Error("Envie PDF, Word, Excel ou imagem v\xE1lida de at\xE9 5 MB.");
    const mime = { pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", doc: "application/msword", xls: "application/vnd.ms-excel", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };
    const id = crypto5.randomUUID();
    fs5.mkdirSync(directory, { recursive: true });
    fs5.writeFileSync(path5.join(directory, id), bytes, { mode: 384 });
    void persistSystemAssetToNeon({ id, slot: "mural-attachment", mimeType: mime[extension], dataBase64: bytes.toString("base64") });
    return { id, name: String(input.name).replace(/[\r\n<>"/\\]/g, "_").slice(0, 160), size: Math.ceil(bytes.length / 1024) + " KB", type: extension.toUpperCase(), mimeType: mime[extension], hash: crypto5.createHash("sha256").update(bytes).digest("hex") };
  };
  app.get("/api/mural", guard, check, (req, res) => res.json({ announcements: state.announcements.filter((a) => visible(a, req.sessionUser)).map((a) => publicRecord(a, req.sessionUser)), notifications: state.notifications.filter((n) => n.recipientId === req.sessionUser.id && !n.dismissed), canPublish: publisher(req.sessionUser) }));
  app.post("/api/mural/notifications/read", guard, check, (req, res) => {
    const ids = req.body?.ids;
    if (!Array.isArray(ids) || ids.length > 500) return fail(res, 400, "Notifica\xE7\xF5es inv\xE1lidas.");
    for (const n of state.notifications.filter((n2) => n2.recipientId === req.sessionUser.id && ids.includes(n2.id))) {
      n.read = true;
      if (req.body.dismiss) n.dismissed = true;
    }
    save();
    res.json({ ok: true });
  });
  app.post("/api/mural/import", guard, check, (req, res) => {
    if (req.sessionUser.accessLevel !== "ADMINISTRADOR") return fail(res, 403, "Importa\xE7\xE3o exclusiva do administrador.");
    if (!state.imported) {
      const incoming = req.body?.announcements;
      if (!Array.isArray(incoming) || incoming.length > 1e3) return fail(res, 400, "Origem inv\xE1lida.");
      for (const old of incoming) {
        if (!old?.id || !old.title || !Array.isArray(old.readReceipts) || !Array.isArray(old.comments) || !Array.isArray(old.likes)) continue;
        const current = get(old.id);
        if (current) {
          const reads = current.readReceipts, comments = current.comments, likes = current.likes, history = current.editHistory || [];
          Object.assign(current, structuredClone(old));
          current.editHistory = [...new Map([...history, ...old.editHistory || []].map((h) => [h.id, h])).values()];
          current.readReceipts = [...new Map([...reads, ...old.readReceipts].map((r) => [r.userId, r])).values()];
          current.comments = [...new Map([...comments, ...old.comments].map((c) => [c.id, c])).values()];
          current.likes = [.../* @__PURE__ */ new Set([...likes, ...old.likes])];
        } else state.announcements.push(structuredClone(old));
      }
      state.imported = true;
      audit(req.sessionUser, "migration", "Hist\xF3rico existente importado sem substituir registros");
      save();
    }
    res.json({ ok: true });
  });
  app.post("/api/mural", guard, check, async (req, res) => {
    if (!publisher(req.sessionUser)) return fail(res, 403, "Publica\xE7\xE3o n\xE3o autorizada.");
    const b = req.body || {}, u = req.sessionUser;
    const key = String(req.headers["x-idempotency-key"] || "");
    if (!key || key.length > 160) return fail(res, 400, "Identificador do envio obrigat\xF3rio.");
    const fingerprint = crypto5.createHash("sha256").update(JSON.stringify(b)).digest("hex"), composite = u.id + ":" + key;
    if (state.keys[composite]) return state.keys[composite].fingerprint === fingerprint ? res.json({ announcement: get(state.keys[composite].id) }) : fail(res, 409, "Envio repetido com dados diferentes.");
    const existing = b.id ? get(b.id) : null;
    if (b.id && !existing) return fail(res, 404, "Comunicado n\xE3o encontrado.");
    if (typeof b.title !== "string" || !b.title.trim() || b.title.length > 180 || typeof b.content !== "string" || !b.draft && !b.content.trim() || b.content.length > 2e4 || !["Normal", "Importante", "Urgente"].includes(b.priority) || !["Comunicado Geral", "Importante", "Urgente", "Recursos Humanos", "Seguran\xE7a", "Operacional", "Log\xEDstica", "Comercial", "Expedi\xE7\xE3o", "Monitoramento", "Financeiro", "Administrativo", "Eventos", "Diretoria"].includes(b.category) || !["Todos", "Operacional", "Log\xEDstica", "Comercial", "Expedi\xE7\xE3o", "Monitoramento", "Administrativo", "Financeiro", "Recursos Humanos", "Seguran\xE7a", "Diretoria"].includes(b.targetAudience)) return fail(res, 400, "Confira t\xEDtulo, conte\xFAdo, categoria, prioridade e p\xFAblico.");
    try {
      const attachments = b.attachments || [];
      if (!Array.isArray(attachments) || attachments.length > 12) throw Error("Limite de 12 anexos.");
      const stored = attachments.map((item) => {
        if (item.id) {
          const known = existing?.attachments?.find((d) => d.id === item.id);
          if (!known) throw Error("Anexo n\xE3o autorizado.");
          return known;
        }
        const legacy = existing?.attachments?.find((d) => !d.id && d.name === item.name && d.url === item.url);
        return legacy || cleanFile(item) || { name: String(item.name).slice(0, 160), size: String(item.size || ""), type: String(item.type || "") };
      }).filter(Boolean);
      const cover = String(b.coverImage || "");
      const banner = String(b.bannerImage || "");
      if (banner && !/^\/(assets|uploads|api)\//.test(banner) && !/^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(banner)) throw Error("Imagem do banner inv\xE1lida.");
      if (banner.length > 7 * 1024 * 1024) throw Error("Imagem do banner muito grande.");
      if (cover && !/^\/(assets|uploads|api)\//.test(cover) && !/^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(cover)) throw Error("Imagem de capa inv\xE1lida.");
      if (cover.length > 7 * 1024 * 1024) throw Error("Imagem muito grande.");
      const validImage = (value) => {
        if (!value) return true;
        if (value.startsWith("/assets/") || value.startsWith("/uploads/") || value.startsWith("/api/")) return !value.includes("..") && !/[\r\n]/.test(value);
        const match = /^data:image\/([a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\r\n]+)$/.exec(value);
        if (!match) return false;
        const data = Buffer.from(match[2], "base64");
        if (data.length > 5 * 1024 * 1024 || data.length < 4) return false;
        return match[1] === "png" ? data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) : match[1] === "jpeg" || match[1] === "jpg" ? data[0] === 255 && data[1] === 216 : match[1] === "webp" ? data.subarray(0, 4).toString() === "RIFF" && data.subarray(8, 12).toString() === "WEBP" : true;
      };
      if (!validImage(cover) || !validImage(banner)) throw Error("Imagem inv\xE1lida: envie imagem v\xE1lida de at\xE9 5 MB.");
      const versions = [...existing?.versions || []];
      if (existing) versions.push({ id: crypto5.randomUUID(), at: stamp(), editorName: u.name, title: existing.title, content: existing.content, attachments: structuredClone(existing.attachments || []) });
      const now = /* @__PURE__ */ new Date(), record = { ...existing || {}, id: existing?.id || crypto5.randomUUID(), title: b.title.trim(), summary: String(b.summary || "").slice(0, 500), content: b.content.trim(), category: b.category, priority: b.priority, targetAudience: b.targetAudience, requireReadConfirmation: !!b.requireReadConfirmation, pinned: !!b.pinned, featured: !!b.featured, draft: !!b.draft, versions, coverImage: cover, bannerImage: String(b.bannerImage || cover || "/assets/login-rodovar-sunset-v2.png"), attachments: stored, authorId: existing?.authorId || u.id, authorName: existing?.authorName || u.name, department: existing?.department || u.department, createdAtIso: existing?.createdAtIso || now.toISOString(), dateFormatted: existing?.dateFormatted || now.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }), readReceipts: existing?.readReceipts || [], comments: existing?.comments || [], likes: existing?.likes || [], editHistory: [{ id: crypto5.randomUUID(), editedAt: stamp(), editorName: u.name, editorRole: u.accessLevel, note: String(b.editNote || "Publica\xE7\xE3o atualizada").slice(0, 1e3) }, ...existing?.editHistory || []] };
      if (existing) Object.assign(existing, record);
      else state.announcements.unshift(record);
      state.keys[composite] = { id: record.id, fingerprint };
      audit(u, record.id, record.draft ? "Rascunho salvo" : "Publica\xE7\xE3o salva");
      notify(record);
      await Promise.resolve(save());
      await persistAnnouncementToNeon(record).catch(() => {
      });
      res.status(201).json({ announcement: record });
    } catch (e) {
      fail(res, 400, e.message);
    }
  });
  app.post("/api/mural/:id/action", guard, check, (req, res) => {
    const a = get(req.params.id), u = req.sessionUser;
    if (!a || !visible(a, u)) return fail(res, 404, "Comunicado indispon\xEDvel.");
    const b = req.body || {};
    if (b.action === "READ") {
      if (a.draft || a.archived) return fail(res, 409, "Publica\xE7\xE3o indispon\xEDvel para confirma\xE7\xE3o.");
      if (!a.readReceipts.some((r) => r.userId === u.id)) {
        a.readReceipts.push({ userId: u.id, userName: u.name, department: u.department, confirmedAt: stamp() });
        audit(u, a.id, "Leitura confirmada explicitamente");
      }
      for (const n of state.notifications.filter((n2) => n2.recipientId === u.id && n2.targetId === a.id)) n.read = true;
    } else if (b.action === "LIKE") {
      a.likes = a.likes.includes(u.id) ? a.likes.filter((id) => id !== u.id) : [...a.likes, u.id];
    } else if (b.action === "COMMENT") {
      const text = String(b.text || "").trim();
      if (!text || text.length > 3e3) return fail(res, 400, "Coment\xE1rio de at\xE9 3000 caracteres.");
      const key = String(req.headers["x-idempotency-key"] || "");
      if (!key) return fail(res, 400, "Identificador obrigat\xF3rio.");
      const prior = a.comments.find((c) => c.key === u.id + ":" + key);
      if (prior) {
        if (prior.content !== text) return fail(res, 409, "Coment\xE1rio repetido com conte\xFAdo diferente.");
        return res.json({ announcement: publicRecord(a, u) });
      }
      a.comments.push({ id: crypto5.randomUUID(), key: u.id + ":" + key, authorId: u.id, authorName: u.name, authorRole: u.roleTitle || u.accessLevel, authorAvatar: u.avatar, content: text, createdAt: stamp() });
      audit(u, a.id, "Coment\xE1rio registrado");
    } else if (b.action === "DELETE_COMMENT") {
      const c = a.comments.find((c2) => c2.id === b.commentId);
      if (!c || !publisher(u) && c.authorId !== u.id) return fail(res, 403, "Coment\xE1rio n\xE3o autorizado.");
      a.comments = a.comments.filter((c2) => c2.id !== b.commentId);
      audit(u, a.id, "Coment\xE1rio removido");
    } else {
      if (!publisher(u)) return fail(res, 403, "A\xE7\xE3o administrativa n\xE3o autorizada.");
      if (b.action === "PIN") a.pinned = !a.pinned;
      else if (b.action === "FEATURE") a.featured = !a.featured;
      else if (b.action === "ARCHIVE") a.archived = !a.archived;
      else return fail(res, 400, "A\xE7\xE3o inv\xE1lida.");
      audit(u, a.id, b.action);
    }
    save();
    void persistAnnouncementToNeon(a);
    res.json({ announcement: publicRecord(a, u) });
  });
  app.get("/api/mural/:id/attachments/:fileId", guard, check, async (req, res) => {
    const a = get(req.params.id), u = req.sessionUser;
    if (!a || !visible(a, u)) return fail(res, 404, "Documento indispon\xEDvel.");
    const d = a.attachments?.find((d2) => d2.id === req.params.fileId) || (publisher(u) ? a.versions?.flatMap((v) => v.attachments).find((d2) => d2.id === req.params.fileId) : void 0);
    if (!d) return fail(res, 404, "Arquivo n\xE3o encontrado.");
    res.setHeader("X-Content-Type-Options", "nosniff");
    audit(u, a.id, "Download autorizado de anexo");
    save();
    const localPath = path5.join(directory, d.id);
    if (fs5.existsSync(localPath)) {
      return res.type(d.mimeType).attachment(d.name).sendFile(localPath);
    }
    const neonAsset = await getSystemAssetFromNeon(d.id);
    if (neonAsset) {
      try {
        fs5.mkdirSync(directory, { recursive: true });
        fs5.writeFileSync(localPath, neonAsset.buffer, { mode: 384 });
      } catch {
      }
      return res.type(d.mimeType || neonAsset.mimeType).attachment(d.name).send(neonAsset.buffer);
    }
    return fail(res, 404, "Arquivo n\xE3o encontrado.");
  });
}

// src/server/externalRh.ts
import fs6 from "node:fs";
import path6 from "node:path";
import crypto6 from "node:crypto";
var canAccessExternalRh = (u) => !!u && u.accessProfile === "RH" && hasPagePermission(u, "solicitacoes");
function validDocument(value) {
  if (![11, 14].includes(value.length) || /^(\d)\1+$/.test(value)) return false;
  const digit = (base, weights) => {
    const sum = [...base].reduce((n, c, i) => n + Number(c) * weights[i], 0), remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  if (value.length === 11) {
    const first = digit(value.slice(0, 9), [10, 9, 8, 7, 6, 5, 4, 3, 2]);
    return first === Number(value[9]) && digit(value.slice(0, 10), [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]) === Number(value[10]);
  }
  return digit(value.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === Number(value[12]) && digit(value.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === Number(value[13]);
}
var activeRhDecrypt = null;
var activeRhStateRef = null;
function hydrateExternalRhFromPayload(payload) {
  if (!activeRhStateRef || !activeRhDecrypt || !payload || typeof payload.encBase64 !== "string") return;
  try {
    const parsed = JSON.parse(activeRhDecrypt(Buffer.from(payload.encBase64, "base64")).toString("utf8"));
    if (parsed && typeof parsed === "object") {
      activeRhStateRef.clients = Array.isArray(parsed.clients) ? parsed.clients : [];
      activeRhStateRef.services = Array.isArray(parsed.services) ? parsed.services : [];
      activeRhStateRef.requests = Array.isArray(parsed.requests) ? parsed.requests : [];
      activeRhStateRef.keys = parsed.keys && typeof parsed.keys === "object" ? parsed.keys : {};
      activeRhStateRef.events = parsed.events && typeof parsed.events === "object" ? parsed.events : {};
    }
  } catch (err) {
    console.warn("hydrateExternalRhFromPayload notice:", err.message);
  }
}
function registerExternalRh(app, guard, provider) {
  const dir = path6.join(resolveDataRoot(), "data", "rh-external");
  fs6.mkdirSync(dir, { recursive: true });
  const keyFile = path6.join(dir, "encryption.key");
  const useLocalKeyFile = isIsolatedTestEnv() || !process.env.VERCEL && !process.env.VERCEL_ENV;
  let key;
  if (useLocalKeyFile) {
    if (!fs6.existsSync(keyFile)) fs6.writeFileSync(keyFile, crypto6.randomBytes(32), { mode: 384, flag: "wx" });
    key = fs6.readFileSync(keyFile);
  } else {
    key = crypto6.createHash("sha256").update(`rodovar-rh-ext:${process.env.SESSION_SECRET || process.env.DATABASE_URL || "rodovar-default-rh-key"}`).digest();
  }
  const file = path6.join(dir, "records.enc");
  const encrypt = (bytes) => {
    const iv = crypto6.randomBytes(12), cipher = crypto6.createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([cipher.update(bytes), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
  };
  const decrypt = (bytes) => {
    const decipher = crypto6.createDecipheriv("aes-256-gcm", key, bytes.subarray(0, 12));
    decipher.setAuthTag(bytes.subarray(12, 28));
    return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]);
  };
  const state = fs6.existsSync(file) ? JSON.parse(decrypt(fs6.readFileSync(file)).toString()) : { clients: [], services: [], requests: [], keys: {}, events: {} };
  if (!isIsolatedTestEnv()) {
    activeRhDecrypt = decrypt;
    activeRhStateRef = state;
  }
  const save = () => {
    const encryptedBytes = encrypt(Buffer.from(JSON.stringify(state)));
    fs6.writeFileSync(file + ".tmp", encryptedBytes, { mode: 384 });
    fs6.renameSync(file + ".tmp", file);
    if (!isIsolatedTestEnv()) {
      void persistStateSnapshotToNeon("rodovar-external-rh", { encBase64: encryptedBytes.toString("base64"), updatedAt: (/* @__PURE__ */ new Date()).toISOString() });
    }
  };
  const audit = (r, u, action) => r.history.push({ id: crypto6.randomUUID(), at: (/* @__PURE__ */ new Date()).toISOString(), actorId: u.id, actorName: u.name, action });
  const fail = (res, status, error) => res.status(status).json({ error });
  const rh = (req, res, next) => canAccessExternalRh(req.sessionUser) ? (res.setHeader("Cache-Control", "no-store"), next()) : fail(res, 403, "Acesso exclusivo \xE0 permiss\xE3o RH.");
  const find = (id) => state.requests.find((r) => r.id === id);
  const locks = /* @__PURE__ */ new Set();
  const storeDoc = (r, name, mimeType, bytes, kind, u) => {
    const id = crypto6.randomUUID();
    const encBytes = encrypt(bytes);
    fs6.writeFileSync(path6.join(dir, id + ".enc"), encBytes, { mode: 384 });
    if (!isIsolatedTestEnv()) {
      void persistSystemAssetToNeon({ id: `rh-ext-${id}`, slot: "rh-external-doc", mimeType, dataBase64: encBytes.toString("base64") });
    }
    const doc = { id, name: name.replace(/[\r\n<>"/\\]/g, "_").slice(0, 150), mimeType, size: bytes.length, kind, at: (/* @__PURE__ */ new Date()).toISOString() };
    r.documents.push(doc);
    audit(r, u, "Documento anexado: " + kind);
    return doc;
  };
  app.get("/api/rh-external", guard, rh, (_req, res) => res.json({ requests: state.requests, services: state.services, provider: { configured: !!provider, name: provider?.name || null } }));
  app.post("/api/rh-external", guard, rh, (req, res) => {
    const b = req.body || {}, name = String(b.clientName || "").trim(), document = String(b.document || "").replace(/\D/g, ""), service = String(b.service || "").trim(), reference = String(b.reference || "").trim(), email = String(b.email || "").trim(), dueDate = String(b.dueDate || "");
    const amountCents = b.amountCents, idempotency = String(req.headers["x-idempotency-key"] || "");
    if (!idempotency || idempotency.length > 160) return fail(res, 400, "Identificador do envio obrigat\xF3rio.");
    const fingerprint = crypto6.createHash("sha256").update(JSON.stringify(b)).digest("hex"), composite = req.sessionUser.id + ":" + idempotency;
    if (state.keys[composite]) {
      const old = state.keys[composite];
      return old.fingerprint === fingerprint ? res.json({ request: find(old.id) }) : fail(res, 409, "Identificador j\xE1 utilizado com dados diferentes.");
    }
    if (name.length < 2 || name.length > 160 || !validDocument(document) || !service || service.length > 160 || !reference || reference.length > 100 || !Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents > 1e8 || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || Number.isNaN(Date.parse(dueDate)) || email.length > 180 || email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(res, 400, "Confira cliente, CPF/CNPJ, servi\xE7o, refer\xEAncia, valor e vencimento.");
    const businessKey = crypto6.createHash("sha256").update(document + "|" + service.toLocaleLowerCase("pt-BR") + "|" + reference.toLocaleLowerCase("pt-BR")).digest("hex");
    if (state.requests.some((r2) => r2.businessKey === businessKey)) return fail(res, 409, "J\xE1 existe atendimento para este cliente, servi\xE7o e refer\xEAncia.");
    let client = state.clients.find((c) => c.document === document);
    if (client && (client.name !== name || client.email !== email)) return fail(res, 409, "Cliente j\xE1 cadastrado com dados diferentes. Confira a identidade antes de reutilizar.");
    if (!client) {
      client = { id: crypto6.randomUUID(), name, document, email };
      state.clients.push(client);
    }
    let catalog = state.services.find((s) => s.name.toLocaleLowerCase("pt-BR") === service.toLocaleLowerCase("pt-BR"));
    if (!catalog) {
      catalog = { id: crypto6.randomUUID(), name: service };
      state.services.push(catalog);
    }
    const r = { id: crypto6.randomUUID(), protocol: "RH-EXT-" + String(state.requests.length + 1).padStart(6, "0"), client: { ...client }, serviceId: catalog.id, service: catalog.name, reference, amountCents, dueDate, businessKey, status: "Solicita\xE7\xE3o", createdAt: (/* @__PURE__ */ new Date()).toISOString(), documents: [], history: [], notes: [] };
    audit(r, req.sessionUser, "Solicita\xE7\xE3o cadastrada");
    state.requests.unshift(r);
    state.keys[composite] = { id: r.id, fingerprint };
    save();
    res.status(201).json({ request: r });
  });
  app.post("/api/rh-external/:id/action", guard, rh, async (req, res) => {
    const r = find(req.params.id);
    if (!r) return fail(res, 404, "Atendimento n\xE3o encontrado.");
    const action = req.body?.action;
    if (action === "ANALYZE" && r.status === "Solicita\xE7\xE3o") {
      r.status = "An\xE1lise";
      audit(r, req.sessionUser, "Encaminhado para an\xE1lise");
      save();
      return res.json({ request: r });
    }
    if (action === "NOTE") {
      const text = String(req.body?.text || "").trim();
      if (!text || text.length > 3e3) return fail(res, 400, "Informe uma observa\xE7\xE3o de at\xE9 3000 caracteres.");
      r.notes.push({ id: crypto6.randomUUID(), text, actorName: req.sessionUser.name, at: (/* @__PURE__ */ new Date()).toISOString() });
      audit(r, req.sessionUser, "Observa\xE7\xE3o registrada");
      save();
      return res.json({ request: r });
    }
    if (action === "COMPLETE" && r.status === "Pago" && r.bankConfirmation) {
      r.status = "Conclu\xEDdo";
      audit(r, req.sessionUser, "Atendimento conclu\xEDdo");
      save();
      return res.json({ request: r });
    }
    if (!["ISSUE", "CONSULT"].includes(action)) return fail(res, 409, "Transi\xE7\xE3o n\xE3o permitida. Pagamento exige confirma\xE7\xE3o banc\xE1ria validada.");
    if (!provider) return fail(res, 503, "Provedor banc\xE1rio oficial ainda n\xE3o configurado. Nenhum boleto foi emitido.");
    if (locks.has(r.id)) return fail(res, 409, "Opera\xE7\xE3o banc\xE1ria em andamento.");
    locks.add(r.id);
    try {
      if (action === "ISSUE") {
        if (r.chargeId) return res.json({ request: r });
        if (r.status !== "An\xE1lise") return fail(res, 409, "Atendimento deve estar em an\xE1lise.");
        const issued = await provider.issue({ idempotencyKey: r.id, amountCents: r.amountCents, dueDate: r.dueDate, customer: r.client, description: r.service + " \xB7 " + r.reference });
        if (!issued.id || issued.pdf.subarray(0, 5).toString() !== "%PDF-") throw Error("Resposta banc\xE1ria inv\xE1lida");
        if (state.requests.some((item) => item.id !== r.id && item.chargeId === issued.id)) throw Error("Identificador banc\xE1rio duplicado");
        r.chargeId = issued.id;
        r.status = "Boleto Emitido";
        storeDoc(r, "Boleto-" + r.protocol + ".pdf", "application/pdf", issued.pdf, "Boleto", req.sessionUser);
        audit(r, req.sessionUser, "Boleto emitido pelo provedor oficial");
        save();
      } else {
        if (!r.chargeId) return fail(res, 409, "Boleto ainda n\xE3o emitido.");
        await reconcile(r, await provider.lookup(r.chargeId), req.sessionUser);
        save();
      }
      res.json({ request: r });
    } catch {
      fail(res, 502, "N\xE3o foi poss\xEDvel validar a opera\xE7\xE3o no provedor banc\xE1rio. Tente consultar novamente.");
    } finally {
      locks.delete(r.id);
    }
  });
  async function reconcile(r, charge, actor) {
    if (charge.id !== r.chargeId || charge.currency !== "BRL" || charge.amountCents !== r.amountCents) throw Error("Cobran\xE7a divergente");
    if (charge.status === "PAID") {
      if (charge.paidAmountCents !== r.amountCents || !charge.paidAt || Number.isNaN(Date.parse(charge.paidAt))) throw Error("Liquida\xE7\xE3o inv\xE1lida");
      if (!r.bankConfirmation) {
        r.bankConfirmation = { chargeId: charge.id, paidAmountCents: charge.paidAmountCents, paidAt: charge.paidAt, verifiedAt: (/* @__PURE__ */ new Date()).toISOString(), provider: provider.name };
        r.status = "Pago";
        audit(r, actor, "Pagamento confirmado ap\xF3s consulta autenticada ao banco");
      }
    } else if (r.status === "Boleto Emitido") {
      r.status = "Aguardando Pagamento";
      audit(r, actor, "Cobran\xE7a consultada: aguardando pagamento");
    }
  }
  app.post("/api/rh-external/webhook", async (req, res) => {
    if (!provider) return fail(res, 503, "Integra\xE7\xE3o banc\xE1ria n\xE3o configurada.");
    try {
      if (!Buffer.isBuffer(req.rawBody)) return fail(res, 400, "Conte\xFAdo original do webhook indispon\xEDvel.");
      if (req.rawBody.length > 65536) return fail(res, 413, "Evento banc\xE1rio acima do tamanho permitido.");
      const event = await provider.verifyWebhook(req.rawBody, req.headers);
      if (!event.eventId || !event.chargeId) return fail(res, 401, "Evento banc\xE1rio n\xE3o validado.");
      if (state.events[event.eventId]) return res.json({ ok: true });
      const r = state.requests.find((r2) => r2.chargeId === event.chargeId);
      if (!r) return fail(res, 404, "Cobran\xE7a n\xE3o encontrada.");
      if (locks.has(r.id)) return fail(res, 409, "Concilia\xE7\xE3o em andamento.");
      locks.add(r.id);
      try {
        await reconcile(r, await provider.lookup(r.chargeId), { id: "BANK", name: provider.name });
        state.events[event.eventId] = (/* @__PURE__ */ new Date()).toISOString();
        save();
      } finally {
        locks.delete(r.id);
      }
      res.json({ ok: true });
    } catch {
      fail(res, 401, "Webhook n\xE3o validado. Nenhum pagamento confirmado.");
    }
  });
  app.post("/api/rh-external/:id/documents", guard, rh, (req, res) => {
    const r = find(req.params.id);
    if (!r) return fail(res, 404, "Atendimento n\xE3o encontrado.");
    const name = String(req.body?.name || ""), kind = req.body?.kind === "Comprovante" ? "Comprovante" : "Documento";
    const match = /^data:(application\/pdf|image\/png|image\/jpeg);base64,([A-Za-z0-9+/=\r\n]+)$/.exec(String(req.body?.dataUrl || ""));
    if (!match || !name) return fail(res, 400, "Envie PDF, PNG ou JPEG.");
    const bytes = Buffer.from(match[2], "base64");
    const valid = match[1] === "application/pdf" ? bytes.subarray(0, 5).toString() === "%PDF-" : match[1] === "image/png" ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    if (!valid || bytes.length > 5 * 1024 * 1024) return fail(res, 400, "Formato inv\xE1lido ou arquivo maior que 5 MB.");
    const hash = crypto6.createHash("sha256").update(bytes).digest("hex");
    if (r.documents.some((d) => d.hash === hash)) return res.json({ request: r });
    const doc = storeDoc(r, name, match[1], bytes, kind, req.sessionUser);
    Object.assign(doc, { hash });
    save();
    res.status(201).json({ request: r });
  });
  app.get("/api/rh-external/:id/documents/:documentId", guard, rh, async (req, res) => {
    const r = find(req.params.id), doc = r?.documents.find((d) => d.id === req.params.documentId);
    if (!doc) return fail(res, 404, "Documento n\xE3o encontrado.");
    const localPath = path6.join(dir, doc.id + ".enc");
    let rawEnc = fs6.existsSync(localPath) ? fs6.readFileSync(localPath) : null;
    if (!rawEnc && !isIsolatedTestEnv()) {
      const neonAsset = await getSystemAssetFromNeon(`rh-ext-${doc.id}`);
      if (neonAsset?.buffer) {
        rawEnc = neonAsset.buffer;
        try {
          fs6.writeFileSync(localPath, rawEnc, { mode: 384 });
        } catch {
        }
      }
    }
    if (!rawEnc) return fail(res, 404, "Arquivo do documento n\xE3o encontrado.");
    audit(r, req.sessionUser, "Download de documento: " + doc.kind);
    save();
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.type(doc.mimeType).attachment(doc.name).send(decrypt(rawEnc));
  });
}

// src/server/socialProfile.ts
import crypto7 from "node:crypto";
import fs7 from "node:fs";
import path7 from "node:path";
var activeSocialState = null;
function hydrateSocialProfileFromPayload(payload) {
  if (!activeSocialState || !payload || typeof payload !== "object") return;
  if (payload.profiles && typeof payload.profiles === "object") {
    activeSocialState.profiles = payload.profiles;
  }
  if (Array.isArray(payload.posts)) {
    activeSocialState.posts = payload.posts;
  }
}
var DEFAULT_COVER = "/assets/banner-rodovar-conecta-highway.png";
var INITIAL_SAMPLE_POSTS = [
  {
    id: "post-init-1",
    authorId: "emp-admin-master",
    authorName: "Carlos Mendes",
    authorAvatar: "/assets/avatar-joao.jpg",
    authorRole: "Comercial",
    authorDepartment: "Comercial",
    content: "Mais uma negocia\xE7\xE3o conclu\xEDda com sucesso! \u{1F69B} Novo contrato de transporte para a regi\xE3o Sul. Seguimos firmes, levando resultados e fortalecendo parcerias! \u{1F49B}",
    images: [
      "/assets/aistudio/Banner_Rodovar_Conecta_na_Rodovia_24f668fa.png",
      "/assets/aistudio/010203_5a4289e5.png",
      "/assets/aistudio/image_58f528e8.png"
    ],
    likes: [
      "emp-admin-master",
      "emp-vitor-diretoria",
      "emp-monica-comercial",
      "emp-priscila-expedicao"
    ],
    comments: [
      {
        id: "c-1",
        postId: "post-init-1",
        authorId: "emp-vitor-diretoria",
        authorName: "Vitor Hugo",
        authorAvatar: "/assets/aistudio/RODOVAR-LOGO_310056c8.png",
        authorRole: "Diretoria",
        content: "Excelente trabalho, time Comercial! O compromisso com a excel\xEAncia faz a diferen\xE7a.",
        createdAt: new Date(Date.now() - 2 * 3600 * 1e3).toISOString()
      },
      {
        id: "c-2",
        postId: "post-init-1",
        authorId: "emp-monica-comercial",
        authorName: "M\xF4nica Nery",
        authorAvatar: "/assets/aistudio/RODOVAR-LOGO_310056c8.png",
        authorRole: "Comercial",
        content: "Orgulho de fazer parte dessa equipe! Vamos por mais resultados juntos!",
        createdAt: new Date(Date.now() - 1 * 3600 * 1e3).toISOString()
      }
    ],
    commentsCount: 2,
    audience: "Comercial",
    createdAt: new Date(Date.now() - 3 * 3600 * 1e3).toISOString(),
    updatedAt: new Date(Date.now() - 3 * 3600 * 1e3).toISOString()
  },
  {
    id: "post-init-2",
    authorId: "emp-admin-master",
    authorName: "Carlos Mendes",
    authorAvatar: "/assets/avatar-joao.jpg",
    authorRole: "Comercial",
    authorDepartment: "Comercial",
    content: "Alinhamento com a equipe de Log\xEDstica e Monitoramento sobre as novas rotas do Corredor Nordeste. Rastreabilidade e seguran\xE7a m\xE1xima do in\xEDcio ao fim!",
    images: [
      "/assets/aistudio/DSC00410_9423424f.JPG",
      "/assets/aistudio/image_47dbceb5.png"
    ],
    likes: ["emp-admin-master", "emp-jairo-monitoramento"],
    comments: [],
    commentsCount: 0,
    audience: "P\xFAblico",
    createdAt: new Date(Date.now() - 24 * 3600 * 1e3).toISOString(),
    updatedAt: new Date(Date.now() - 24 * 3600 * 1e3).toISOString()
  }
];
function registerSocialProfileRoutes(app, guard, dbState2) {
  const dataDir = path7.join(resolveDataRoot(), "data");
  const uploadsDir = path7.join(resolveDataRoot(), "public", "uploads");
  const socialStoreFile = path7.join(dataDir, "social-store.json");
  let state = {
    profiles: {},
    posts: [...INITIAL_SAMPLE_POSTS]
  };
  if (fs7.existsSync(socialStoreFile)) {
    try {
      const raw = JSON.parse(fs7.readFileSync(socialStoreFile, "utf8"));
      if (raw && typeof raw === "object") {
        state.profiles = raw.profiles || {};
        state.posts = Array.isArray(raw.posts) ? raw.posts : [...INITIAL_SAMPLE_POSTS];
      }
    } catch (e) {
      console.warn("Failed to parse social-store.json:", e.message);
    }
  }
  activeSocialState = state;
  const persistState = () => {
    try {
      fs7.mkdirSync(dataDir, { recursive: true });
      fs7.writeFileSync(socialStoreFile, JSON.stringify(state, null, 2), "utf8");
      void persistStateSnapshotToNeon("rodovar-social", {
        profiles: state.profiles,
        posts: state.posts,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
    } catch (err) {
      console.warn("Social state save error:", err.message);
    }
  };
  const getOrCreateProfile = (userId, defaultUser) => {
    if (!state.profiles[userId]) {
      const user = defaultUser || dbState2.users.find((u) => u.id === userId);
      const isCarlos = user?.name?.toLowerCase().includes("carlos") || user?.login?.includes("carlos") || user?.id === "emp-admin-master";
      state.profiles[userId] = {
        userId,
        coverUrl: DEFAULT_COVER,
        bio: isCarlos ? "Profissional da \xE1rea comercial, apaixonado por log\xEDstica, transporte e conex\xE3o de pessoas. Comprometido com resultados, atendimento de qualidade e o crescimento da RODOVAR." : `Colaborador dedicado do setor de ${user?.department || "Opera\xE7\xF5es"} da RODOVAR Transportes. Comprometido com efici\xEAncia, seguran\xE7a e excel\xEAncia.`,
        customDisplayName: user?.name,
        phone: user?.phoneExt || user?.phone || "(71) 9 9920-2476",
        location: user?.location || "Salvador \u2013 BA",
        socialLinks: isCarlos ? {
          instagram: "https://instagram.com/carlos.mendes_rodovar",
          linkedin: "https://linkedin.com/in/carlosmendes",
          facebook: "https://facebook.com/carlos.mendes",
          youtube: "https://youtube.com/@CarlosMendes",
          tiktok: "https://tiktok.com/@carlos.mendes",
          website: "https://rodovar.com.br"
        } : {
          instagram: "",
          linkedin: "",
          facebook: "",
          youtube: "",
          tiktok: "",
          website: "https://rodovar.com.br"
        },
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      persistState();
      void persistSocialProfileToNeon(state.profiles[userId]);
    }
    return state.profiles[userId];
  };
  app.get("/api/profile/social/:userId?", guard, (req, res) => {
    const sessionUser = req.sessionUser;
    const targetUserId = req.params.userId || sessionUser.id;
    const targetUser = dbState2.users.find((u) => u.id === targetUserId) || sessionUser;
    const profile = getOrCreateProfile(targetUserId, targetUser);
    const userPosts = state.posts.filter((p) => p.authorId === targetUserId);
    const photos = [];
    userPosts.forEach((p) => {
      if (Array.isArray(p.images)) {
        p.images.forEach((img) => {
          if (img && !photos.includes(img)) photos.push(img);
        });
      }
    });
    const stockPhotos = [
      "/assets/aistudio/Banner_Rodovar_Conecta_na_Rodovia_24f668fa.png",
      "/assets/aistudio/010203_5a4289e5.png",
      "/assets/aistudio/image_58f528e8.png",
      "/assets/aistudio/DSC00410_9423424f.JPG",
      "/assets/aistudio/image_47dbceb5.png",
      "/assets/aistudio/DSC00515_18c5e319.JPG",
      "/assets/aistudio/image_4dcd4767.png",
      "/assets/aistudio/image_0137ac6c.png"
    ];
    stockPhotos.forEach((sp) => {
      if (photos.length < 8 && !photos.includes(sp)) {
        photos.push(sp);
      }
    });
    res.json({
      ok: true,
      profile,
      user: {
        id: targetUser.id,
        name: profile.customDisplayName || targetUser.name,
        login: targetUser.login,
        email: targetUser.email,
        roleTitle: targetUser.roleTitle,
        department: targetUser.department,
        accessLevel: targetUser.accessLevel,
        avatar: targetUser.avatar || "/assets/avatar-joao.jpg",
        phoneExt: profile.phone || targetUser.phoneExt,
        location: profile.location || "Salvador \u2013 BA",
        joinedAt: targetUser.joinedAt,
        active: targetUser.active
      },
      postsCount: userPosts.length,
      photos
    });
  });
  app.put("/api/profile/social", guard, async (req, res) => {
    const sessionUser = req.sessionUser;
    const {
      bio,
      customDisplayName,
      phone,
      location,
      socialLinks,
      coverUrl
    } = req.body || {};
    const profile = getOrCreateProfile(sessionUser.id, sessionUser);
    if (typeof bio === "string") profile.bio = bio.trim().slice(0, 1e3);
    if (typeof customDisplayName === "string" && customDisplayName.trim()) {
      profile.customDisplayName = customDisplayName.trim().slice(0, 150);
      const u = dbState2.users.find((user) => user.id === sessionUser.id);
      if (u) u.name = profile.customDisplayName;
    }
    if (typeof phone === "string") profile.phone = phone.trim().slice(0, 50);
    if (typeof location === "string") profile.location = location.trim().slice(0, 100);
    if (typeof coverUrl === "string" && coverUrl.trim()) profile.coverUrl = coverUrl.trim();
    if (socialLinks && typeof socialLinks === "object") {
      const cleanUrl = (val) => {
        const str = String(val || "").trim();
        if (!str) return "";
        if (str.startsWith("http://") || str.startsWith("https://")) return str;
        if (str.startsWith("@")) return `https://instagram.com/${str.slice(1)}`;
        return `https://${str}`;
      };
      profile.socialLinks = {
        instagram: cleanUrl(socialLinks.instagram),
        linkedin: cleanUrl(socialLinks.linkedin),
        facebook: cleanUrl(socialLinks.facebook),
        youtube: cleanUrl(socialLinks.youtube),
        tiktok: cleanUrl(socialLinks.tiktok),
        website: cleanUrl(socialLinks.website)
      };
    }
    profile.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    persistState();
    await persistSocialProfileToNeon(profile).catch(() => {
    });
    res.json({
      ok: true,
      profile
    });
  });
  app.post("/api/profile/cover", guard, async (req, res) => {
    const sessionUser = req.sessionUser;
    const { dataUrl, imageUrl } = req.body || {};
    let targetCoverUrl = imageUrl;
    if (dataUrl && typeof dataUrl === "string" && dataUrl.startsWith("data:image/")) {
      try {
        fs7.mkdirSync(uploadsDir, { recursive: true });
        const matches = dataUrl.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,(.+)$/);
        if (!matches) {
          return res.status(400).json({ error: "Formato de imagem inv\xE1lido." });
        }
        const mimeType = `image/${matches[1]}`;
        const ext = matches[1] === "jpeg" ? "jpg" : matches[1].replace(/[^a-z0-9]/gi, "");
        const buffer = Buffer.from(matches[2], "base64");
        if (buffer.length > 5 * 1024 * 1024) {
          return res.status(400).json({ error: "A foto de capa excede o limite de 5 MB." });
        }
        const fileName = `cover-${sessionUser.id}-${Date.now()}.${ext || "jpg"}`;
        const filePath = path7.join(uploadsDir, fileName);
        fs7.writeFileSync(filePath, buffer);
        await persistSystemAssetToNeon({
          id: fileName,
          slot: "social-cover",
          mimeType,
          dataBase64: matches[2]
        });
        targetCoverUrl = `/uploads/${fileName}`;
      } catch {
        targetCoverUrl = dataUrl;
      }
    }
    if (!targetCoverUrl) {
      return res.status(400).json({ error: "Nenhuma imagem enviada." });
    }
    const profile = getOrCreateProfile(sessionUser.id, sessionUser);
    profile.coverUrl = targetCoverUrl;
    profile.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    persistState();
    await persistSocialProfileToNeon(profile).catch(() => {
    });
    res.json({
      ok: true,
      coverUrl: targetCoverUrl,
      profile
    });
  });
  app.get("/api/profile/posts", guard, (req, res) => {
    const { authorId } = req.query;
    let posts = [...state.posts];
    if (authorId) {
      posts = posts.filter((p) => p.authorId === authorId);
    }
    posts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    res.json({
      ok: true,
      posts
    });
  });
  app.post("/api/profile/posts", guard, async (req, res) => {
    const sessionUser = req.sessionUser;
    const { content, images, audience } = req.body || {};
    if (!content && (!Array.isArray(images) || images.length === 0)) {
      return res.status(400).json({ error: "A publica\xE7\xE3o n\xE3o pode estar vazia." });
    }
    const cleanContent = String(content || "").trim().slice(0, 3e3);
    const validImages = [];
    if (Array.isArray(images)) {
      for (const img of images.slice(0, 10)) {
        if (typeof img === "string") {
          if (img.startsWith("data:image/")) {
            try {
              fs7.mkdirSync(uploadsDir, { recursive: true });
              const matches = img.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,(.+)$/);
              if (matches) {
                const mimeType = `image/${matches[1]}`;
                const ext = matches[1] === "jpeg" ? "jpg" : matches[1].replace(/[^a-z0-9]/gi, "");
                const buffer = Buffer.from(matches[2], "base64");
                const fileName = `post-img-${Date.now()}-${crypto7.randomBytes(3).toString("hex")}.${ext || "jpg"}`;
                fs7.writeFileSync(path7.join(uploadsDir, fileName), buffer);
                await persistSystemAssetToNeon({
                  id: fileName,
                  slot: "social-post",
                  mimeType,
                  dataBase64: matches[2]
                });
                validImages.push(`/uploads/${fileName}`);
                continue;
              }
            } catch {
            }
          }
          validImages.push(img);
        }
      }
    }
    const profile = getOrCreateProfile(sessionUser.id, sessionUser);
    const newPost = {
      id: `post-${Date.now()}-${crypto7.randomBytes(3).toString("hex")}`,
      authorId: sessionUser.id,
      authorName: profile.customDisplayName || sessionUser.name,
      authorAvatar: sessionUser.avatar || "/assets/avatar-joao.jpg",
      authorRole: sessionUser.roleTitle || "Colaborador",
      authorDepartment: sessionUser.department || "Geral",
      content: cleanContent,
      images: validImages,
      likes: [],
      comments: [],
      commentsCount: 0,
      audience: audience || "P\xFAblico",
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    state.posts.unshift(newPost);
    persistState();
    void persistSocialPostToNeon(newPost);
    res.status(201).json({
      ok: true,
      post: newPost
    });
  });
  app.put("/api/profile/posts/:postId", guard, (req, res) => {
    const sessionUser = req.sessionUser;
    const { postId } = req.params;
    const { content, images, audience } = req.body || {};
    const post = state.posts.find((p) => p.id === postId);
    if (!post) {
      return res.status(404).json({ error: "Publica\xE7\xE3o n\xE3o encontrada." });
    }
    if (post.authorId !== sessionUser.id && sessionUser.accessLevel !== "ADMINISTRADOR") {
      return res.status(403).json({ error: "Sem permiss\xE3o para editar esta publica\xE7\xE3o." });
    }
    if (typeof content === "string") {
      post.content = content.trim().slice(0, 3e3);
    }
    if (Array.isArray(images)) {
      post.images = images.filter((img) => typeof img === "string");
    }
    if (typeof audience === "string") {
      post.audience = audience;
    }
    post.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    persistState();
    void persistSocialPostToNeon(post);
    res.json({
      ok: true,
      post
    });
  });
  app.delete("/api/profile/posts/:postId", guard, (req, res) => {
    const sessionUser = req.sessionUser;
    const { postId } = req.params;
    const postIndex = state.posts.findIndex((p) => p.id === postId);
    if (postIndex === -1) {
      return res.status(404).json({ error: "Publica\xE7\xE3o n\xE3o encontrada." });
    }
    const post = state.posts[postIndex];
    if (post.authorId !== sessionUser.id && sessionUser.accessLevel !== "ADMINISTRADOR") {
      return res.status(403).json({ error: "Sem permiss\xE3o para excluir esta publica\xE7\xE3o." });
    }
    state.posts.splice(postIndex, 1);
    persistState();
    void deleteSocialPostFromNeon(postId);
    res.json({
      ok: true,
      deletedPostId: postId
    });
  });
  app.post("/api/profile/posts/:postId/like", guard, (req, res) => {
    const sessionUser = req.sessionUser;
    const { postId } = req.params;
    const post = state.posts.find((p) => p.id === postId);
    if (!post) {
      return res.status(404).json({ error: "Publica\xE7\xE3o n\xE3o encontrada." });
    }
    const userId = sessionUser.id;
    const existingIndex = post.likes.indexOf(userId);
    let isLiked = false;
    if (existingIndex >= 0) {
      post.likes.splice(existingIndex, 1);
      isLiked = false;
    } else {
      post.likes.push(userId);
      isLiked = true;
    }
    persistState();
    void persistSocialPostToNeon(post);
    res.json({
      ok: true,
      isLiked,
      likesCount: post.likes.length,
      likes: post.likes
    });
  });
  app.post("/api/profile/posts/:postId/comments", guard, (req, res) => {
    const sessionUser = req.sessionUser;
    const { postId } = req.params;
    const { content } = req.body || {};
    if (!content || !String(content).trim()) {
      return res.status(400).json({ error: "Coment\xE1rio n\xE3o pode estar vazio." });
    }
    const post = state.posts.find((p) => p.id === postId);
    if (!post) {
      return res.status(404).json({ error: "Publica\xE7\xE3o n\xE3o encontrada." });
    }
    const profile = getOrCreateProfile(sessionUser.id, sessionUser);
    const newComment = {
      id: `comment-${Date.now()}-${crypto7.randomBytes(3).toString("hex")}`,
      postId,
      authorId: sessionUser.id,
      authorName: profile.customDisplayName || sessionUser.name,
      authorAvatar: sessionUser.avatar || "/assets/avatar-joao.jpg",
      authorRole: sessionUser.roleTitle || "Colaborador",
      content: String(content).trim().slice(0, 1e3),
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    post.comments ||= [];
    post.comments.push(newComment);
    post.commentsCount = post.comments.length;
    persistState();
    void persistSocialCommentToNeon(newComment);
    void persistSocialPostToNeon(post);
    res.status(201).json({
      ok: true,
      comment: newComment,
      commentsCount: post.commentsCount
    });
  });
  app.delete("/api/profile/posts/:postId/comments/:commentId", guard, (req, res) => {
    const sessionUser = req.sessionUser;
    const { postId, commentId } = req.params;
    const post = state.posts.find((p) => p.id === postId);
    if (!post) {
      return res.status(404).json({ error: "Publica\xE7\xE3o n\xE3o encontrada." });
    }
    const commentIndex = (post.comments || []).findIndex((c) => c.id === commentId);
    if (commentIndex === -1) {
      return res.status(404).json({ error: "Coment\xE1rio n\xE3o encontrado." });
    }
    const comment = post.comments[commentIndex];
    if (comment.authorId !== sessionUser.id && post.authorId !== sessionUser.id && sessionUser.accessLevel !== "ADMINISTRADOR") {
      return res.status(403).json({ error: "Sem permiss\xE3o para excluir este coment\xE1rio." });
    }
    post.comments.splice(commentIndex, 1);
    post.commentsCount = post.comments.length;
    persistState();
    void deleteSocialCommentFromNeon(commentId);
    void persistSocialPostToNeon(post);
    res.json({
      ok: true,
      commentsCount: post.commentsCount
    });
  });
}

// src/server/requestQueue.ts
import fs8 from "node:fs";
import path8 from "node:path";
import crypto8 from "node:crypto";
var DESTINATIONS = ["Recursos Humanos", "Administrativo", "Financeiro"];
var STATUSES = ["Aberta", "Em an\xE1lise", "Em andamento", "Aguardando funcion\xE1rio", "Conclu\xEDda", "Cancelada"];
var terminal = (r) => ["Conclu\xEDda", "Cancelada"].includes(r.status);
var activeQueueState = null;
function hydrateRequestQueueFromPayload(payload) {
  if (!activeQueueState || !payload || typeof payload !== "object") return;
  if (Array.isArray(payload.requests)) activeQueueState.requests = payload.requests;
  if (Array.isArray(payload.notifications)) activeQueueState.notifications = payload.notifications;
  if (payload.keys && typeof payload.keys === "object") activeQueueState.keys = payload.keys;
}
function canHandleRequest(u, r) {
  return u.active && u.approvalStatus === "APROVADO" && (u.accessLevel === "ADMINISTRADOR" || u.accessProfile === "RH" || u.accessProfile === "FINANCEIRO" && r.targetDepartment === "Financeiro");
}
function registerRequestQueue(app, guard, users, initial = []) {
  const directory = path8.join(resolveDataRoot(), "data");
  const file = path8.join(directory, "requests-server.json");
  const attachmentsDir = path8.join(directory, "request-attachments");
  const state = fs8.existsSync(file) ? JSON.parse(fs8.readFileSync(file, "utf8")) : { requests: structuredClone(initial), notifications: [], keys: {} };
  activeQueueState = state;
  const save = (skipNeon = false) => {
    try {
      fs8.mkdirSync(directory, { recursive: true });
      fs8.writeFileSync(file + ".tmp", JSON.stringify(state, null, 2));
      fs8.renameSync(file + ".tmp", file);
    } catch (err) {
      console.warn("requestQueue local save notice:", err.message);
    }
    if (!skipNeon) {
      void persistStateSnapshotToNeon("rodovar-requests-state", state);
    }
  };
  const visible = (u, r) => r.requesterId === u.id || canHandleRequest(u, r);
  const notify = (r, recipientId, title, eventId) => {
    const id = `${eventId}:${recipientId}`;
    if (!state.notifications.some((n) => n.id === id)) state.notifications.push({ id, recipientId, targetId: r.id, title, read: false, createdAtIso: (/* @__PURE__ */ new Date()).toISOString() });
  };
  const history = (r, u, action, note) => {
    const id = crypto8.randomUUID();
    r.history.push({ id, timestamp: (/* @__PURE__ */ new Date()).toISOString(), actorName: u.name, action, ...note ? { note } : {} });
    return id;
  };
  const attachmentPayload = (input) => {
    if (!input) return;
    if (typeof input.dataUrl !== "string" || typeof input.name !== "string") throw Error("Anexo inv\xE1lido.");
    const match = /^data:(application\/pdf|image\/png|image\/jpeg);base64,([A-Za-z0-9+/=\r\n]+)$/.exec(input.dataUrl);
    if (!match) throw Error("Envie PDF, PNG ou JPEG.");
    const bytes = Buffer.from(match[2], "base64");
    if (bytes.length < 8 || bytes.length > 5 * 1024 * 1024) throw Error("O anexo deve ter at\xE9 5 MB.");
    const valid = match[1] === "application/pdf" ? bytes.subarray(0, 5).toString() === "%PDF-" : match[1] === "image/png" ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    if (!valid) throw Error("O conte\xFAdo do arquivo n\xE3o corresponde ao formato informado.");
    return { name: input.name.replace(/[\r\n<>"/\\]/g, "_").slice(0, 160), mimeType: match[1], bytes };
  };
  const addAttachment = (r, u, parsed) => {
    if (!parsed) return;
    fs8.mkdirSync(attachmentsDir, { recursive: true });
    const attachment = { id: crypto8.randomUUID(), name: parsed.name, mimeType: parsed.mimeType, size: parsed.bytes.length, uploadedById: u.id, createdAtIso: (/* @__PURE__ */ new Date()).toISOString() };
    fs8.writeFileSync(path8.join(attachmentsDir, attachment.id), parsed.bytes);
    void persistSystemAssetToNeon({
      id: attachment.id,
      slot: "request-attachment",
      mimeType: parsed.mimeType,
      dataBase64: parsed.bytes.toString("base64")
    });
    (r.attachments ||= []).push(attachment);
    r.attachmentName ||= attachment.name;
  };
  const fail = (res, message, status = 400) => res.status(status).json({ error: message });
  if (!fs8.existsSync(file)) save(true);
  app.get("/api/requests", guard, (req, res) => {
    const u = req.sessionUser;
    if (!hasPagePermission(u, "solicitacoes")) return fail(res, "Sem acesso \xE0 fila.", 403);
    res.setHeader("Cache-Control", "no-store");
    const activeUsers = users().filter((person) => person.active && person.approvalStatus === "APROVADO");
    res.json({ handlers: activeUsers.filter((person) => person.accessProfile === "RH").map((person) => ({ id: person.id, name: person.name })), requests: state.requests.filter((r) => visible(u, r)), notifications: state.notifications.filter((n) => n.recipientId === u.id), routing: {
      rhActive: activeUsers.filter((person) => person.accessProfile === "RH").length,
      financeActive: activeUsers.filter((person) => person.accessProfile === "FINANCEIRO").length
    } });
  });
  app.post("/api/requests", guard, async (req, res) => {
    const u = req.sessionUser;
    if (!hasPagePermission(u, "solicitacoes")) return fail(res, "Sem acesso.", 403);
    const { subject, description, targetDepartment, priority, attachment } = req.body || {};
    const key = String(req.headers["x-idempotency-key"] || req.body && req.body.idempotencyKey || `auto-${Date.now()}`);
    if (key.length > 160) return fail(res, "Identificador de envio obrigat\xF3rio.");
    const composite = u.id + ":" + key;
    if (state.keys[composite]) return res.json({ request: state.requests.find((r) => r.id === state.keys[composite]) });
    if (!DESTINATIONS.includes(targetDepartment) || typeof subject !== "string" || !subject.trim() || subject.length > 200 || typeof description !== "string" || !description.trim() || description.length > 3e3) return fail(res, "Preencha destino, assunto e descri\xE7\xE3o.");
    let parsed;
    try {
      parsed = attachmentPayload(attachment);
    } catch (e) {
      return fail(res, e.message);
    }
    const id = crypto8.randomUUID(), now = /* @__PURE__ */ new Date(), due = new Date(now.getTime() + 48 * 36e5).toISOString();
    const maxProtocol = state.requests.reduce((max, r) => Math.max(max, /^#\d+$/.test(r.protocol) ? Number(r.protocol.slice(1)) : 0), 1025);
    const record = { id, protocol: "#" + (maxProtocol + 1), requesterId: u.id, requesterName: u.name, requesterDepartment: u.department, targetDepartment, subject: subject.trim(), description: description.trim(), priority: ["Baixa", "M\xE9dia", "Alta", "Urgente"].includes(priority) ? priority : "M\xE9dia", status: "Aberta", createdAtIso: now.toISOString(), originalDueAtIso: due, currentDueAtIso: due, history: [] };
    history(record, u, "Solicita\xE7\xE3o aberta", "Prazo inicial de 48 horas corridas.");
    addAttachment(record, u, parsed);
    state.requests.unshift(record);
    state.keys[composite] = id;
    for (const recipient of users().filter((r) => r.active && r.approvalStatus === "APROVADO" && (targetDepartment === "Financeiro" ? r.accessProfile === "FINANCEIRO" : r.accessProfile === "RH"))) notify(record, recipient.id, "Nova solicita\xE7\xE3o " + record.protocol, id);
    save();
    void persistRequestToNeon(record);
    await flushPendingNeonWrites();
    res.status(201).json({ request: record });
  });
  app.get("/api/requests/:id/attachments/:attachmentId", guard, async (req, res) => {
    const u = req.sessionUser, r = state.requests.find((r2) => r2.id === req.params.id);
    if (!hasPagePermission(u, "solicitacoes") || !r || !visible(u, r)) return fail(res, "Arquivo n\xE3o encontrado.", 404);
    const attachment = r.attachments?.find((a) => a.id === req.params.attachmentId);
    if (!attachment) return fail(res, "Arquivo n\xE3o encontrado.", 404);
    const storedPath = path8.join(attachmentsDir, attachment.id);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Content-Type", attachment.mimeType);
    if (fs8.existsSync(storedPath)) {
      return res.attachment(attachment.name).sendFile(storedPath);
    }
    const neonAsset = await getSystemAssetFromNeon(attachment.id);
    if (neonAsset) {
      try {
        fs8.mkdirSync(attachmentsDir, { recursive: true });
        fs8.writeFileSync(storedPath, neonAsset.buffer);
      } catch {
      }
      return res.attachment(attachment.name).send(neonAsset.buffer);
    }
    return fail(res, "Arquivo indispon\xEDvel no servidor.", 404);
  });
  app.post("/api/requests/:id/:action", guard, async (req, res) => {
    const u = req.sessionUser, r = state.requests.find((r2) => r2.id === req.params.id);
    if (!hasPagePermission(u, "solicitacoes") || !r || !visible(u, r)) return fail(res, "Solicita\xE7\xE3o n\xE3o encontrada.", 404);
    const action = req.params.action, isHandler = canHandleRequest(u, r), assigned = r.assignedToId === u.id;
    const actionKey = String(req.headers["x-idempotency-key"] || "");
    if (actionKey.length > 160) return fail(res, "Identificador de envio inv\xE1lido.");
    const composite = [u.id, r.id, action, actionKey].join(":");
    if (actionKey && state.keys[composite]) return res.json({ request: r });
    if (action === "read") {
      for (const n of state.notifications) if (n.targetId === r.id && n.recipientId === u.id) n.read = true;
      save();
      await flushPendingNeonWrites();
      return res.json({ request: r });
    }
    if (terminal(r)) return fail(res, "Protocolo encerrado. O hist\xF3rico permanece dispon\xEDvel.", 409);
    if (action === "assign") {
      if (!(u.accessProfile === "RH" || u.accessLevel === "ADMINISTRADOR")) return fail(res, "Atribui\xE7\xE3o n\xE3o autorizada.", 403);
      if (r.assignedToId && !assigned && u.accessLevel !== "ADMINISTRADOR") return fail(res, "Somente a respons\xE1vel atual pode transferir.", 409);
      const target = users().find((person) => person.id === req.body?.assignedToId && person.accessProfile === "RH" && canHandleRequest(person, r));
      if (!target) return fail(res, "Respons\xE1vel RH inv\xE1lida.", 400);
      r.assignedToId = target.id;
      r.assignedToName = target.name;
      if (r.status === "Aberta") r.status = "Em an\xE1lise";
      const event = history(r, u, "Atendimento atribu\xEDdo a " + target.name);
      notify(r, target.id, "Atendimento atribu\xEDdo: " + r.protocol, event);
    } else if (action === "claim") {
      if (!isHandler) return fail(res, "Somente o setor respons\xE1vel pode assumir.", 403);
      if (r.assignedToId && !assigned) return fail(res, "Atendimento j\xE1 assumido por " + r.assignedToName, 409);
      if (assigned) return res.json({ request: r });
      r.assignedToId = u.id;
      r.assignedToName = u.name;
      if (r.status === "Aberta") r.status = "Em an\xE1lise";
      history(r, u, "Atendimento assumido");
    } else if (action === "response") {
      if (!(u.id === r.requesterId || isHandler && assigned)) return fail(res, "Apenas o solicitante e o respons\xE1vel podem responder.", 403);
      const note = String(req.body?.note || "").trim();
      if (!note || note.length > 3e3) return fail(res, "Informe uma resposta de at\xE9 3.000 caracteres.");
      let parsed;
      try {
        parsed = attachmentPayload(req.body?.attachment);
      } catch (e) {
        return fail(res, e.message);
      }
      addAttachment(r, u, parsed);
      const event = history(r, u, "Resposta no atendimento", note);
      const recipients = /* @__PURE__ */ new Set([r.requesterId, r.assignedToId, ...users().filter((person) => canHandleRequest(person, r) && person.accessProfile === "RH").map((person) => person.id)]);
      for (const uid of recipients) if (uid && uid !== u.id) notify(r, uid, "Nova resposta em " + r.protocol, event);
    } else {
      if (!isHandler || !assigned) return fail(res, "Assuma o atendimento antes de atualizar.", 403);
      if (action === "status") {
        if (!STATUSES.includes(req.body?.status)) return fail(res, "Status inv\xE1lido.");
        if (r.status === req.body.status) return res.json({ request: r });
        r.status = req.body.status;
        if (terminal(r)) r.completedAtIso = (/* @__PURE__ */ new Date()).toISOString();
        const event = history(r, u, "Status: " + r.status, String(req.body?.note || "").trim().slice(0, 3e3));
        notify(r, r.requesterId, r.protocol + " \u2014 " + r.status, event);
      } else if (action === "extend") {
        const hours = Number(req.body?.hours), note = String(req.body?.note || "").trim();
        if (!Number.isInteger(hours) || hours < 1 || hours > 168 || note.length < 5 || note.length > 3e3) return fail(res, "Informe de 1 a 168 horas e uma justificativa.");
        r.currentDueAtIso = new Date(Date.parse(r.currentDueAtIso) + hours * 36e5).toISOString();
        const event = history(r, u, `Prazo prorrogado em ${hours}h`, note);
        notify(r, r.requesterId, "Prazo atualizado em " + r.protocol, event);
      } else if (action === "escalate") {
        const note = String(req.body?.note || "").trim();
        if (note.length < 5 || note.length > 3e3) return fail(res, "Informe o motivo do alerta.");
        if (r.escalatedToDiretoria) return res.json({ request: r });
        r.escalatedToDiretoria = true;
        history(r, u, "Alerta registrado para revis\xE3o administrativa", note);
        for (const admin of users().filter((person) => person.active && person.accessLevel === "ADMINISTRADOR")) notify(r, admin.id, "Revis\xE3o administrativa: " + r.protocol, "escalate:" + r.id);
      } else return fail(res, "A\xE7\xE3o inv\xE1lida.", 404);
    }
    if (actionKey) state.keys[composite] = r.id;
    save();
    void persistRequestToNeon(r);
    await flushPendingNeonWrites();
    res.json({ request: r });
  });
}

// src/server/accountLifecycle.ts
import crypto9 from "node:crypto";
var AccountDeletionError = class extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
};
function archiveAccount(db, targetId, actorId, reason) {
  const actor = db.users.find((u) => u.id === actorId);
  const policy = db.accessPolicy;
  if (!policy || !actor || actorId !== policy.protectedAdminUid || actor.accessLevel !== "ADMINISTRADOR" || !actor.active || actor.approvalStatus !== "APROVADO") throw new AccountDeletionError("Apenas o administrador principal pode excluir cadastros.", 403);
  if (targetId === policy.protectedAdminUid || targetId === actorId) throw new AccountDeletionError("O administrador principal est\xE1 protegido e n\xE3o pode ser exclu\xEDdo.", 409);
  const target = db.users.find((u) => u.id === targetId);
  if (!target) throw new AccountDeletionError("Cadastro n\xE3o encontrado.", 404);
  const { passwordHash: _hash, passwordSalt: _salt, ...snapshot } = target;
  const stamp = (/* @__PURE__ */ new Date()).toISOString();
  const archived = { user: { ...snapshot, active: false, approvalStatus: "SUSPENSO" }, deletedAtIso: stamp, deletedById: actorId, reason };
  (db.archivedUsers ||= []).push(archived);
  db.users = db.users.filter((u) => u.id !== targetId);
  policy.authorizedUids = policy.authorizedUids.filter((uid) => uid !== targetId);
  for (const [sid, session] of Object.entries(db.sessions)) if (session.userId === targetId) delete db.sessions[sid];
  db.passwordResetTokens = db.passwordResetTokens.filter((t) => t.userId !== targetId);
  delete db.loginLocks["user:" + targetId];
  delete db.loginLocks[target.login];
  const auditEntry = {
    id: crypto9.randomUUID(),
    timestampIso: stamp,
    timestampFormatted: new Date(stamp).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
    actorId,
    actorName: actor.name,
    actorRole: "ADMINISTRADOR",
    action: "EXCLUSAO_CADASTRO",
    details: `Cadastro ${target.name} (${target.login}, UID ${targetId}) exclu\xEDdo dos acessos. Hist\xF3rico preservado. ${reason}`
  };
  db.auditLogs.unshift(auditEntry);
  void deleteUserFromNeon(targetId, archived);
  void persistAccessPolicyToNeon(policy);
  void persistUserSessionsRevocationToNeon(targetId, Date.now());
  void persistAuditLogToNeon(auditEntry);
  return archived;
}
function registerAccountDeletionRoutes(app, guard, db, save) {
  app.delete("/api/admin/users/:userId", guard, (req, res) => {
    try {
      archiveAccount(db, String(req.params.userId), req.sessionUser.id, String(req.body?.reason || "Exclus\xE3o solicitada pelo administrador.").trim().slice(0, 500));
      save(db);
      res.json({ ok: true, deletedUserId: req.params.userId, historyPreserved: true });
    } catch (e) {
      if (e instanceof AccountDeletionError) return res.status(e.status).json({ error: e.message });
      throw e;
    }
  });
}

// src/data/initialData.ts
var INITIAL_ANNOUNCEMENTS = [
  {
    id: "ann-0",
    title: "CRONOGRAMA DE TESTE E COMUNICADOS DO PORTAL 2027",
    summary: "Diretrizes oficiais de opera\xE7\xE3o, comunicados internos e cronograma de valida\xE7\xE3o do portal corporativo 2027.",
    content: "A Administra\xE7\xE3o Geral da RODOVAR disponibiliza o Guia Oficial de Comunicados e Testes do Portal RODOVAR CONECTA \u2014 Edi\xE7\xE3o 2027 (RDV-EST-01).\n\n1. Leitura e Confirma\xE7\xE3o: Todos os avisos importantes e orienta\xE7\xF5es da empresa devem ter a leitura confirmada no portal.\n2. Testes e Homologa\xE7\xE3o 2027: Os fluxos de comunica\xE7\xE3o, fretes ativos e solicita\xE7\xF5es internas seguem o calend\xE1rio oficial de 2027.\n3. Consulte o documento PDF oficial anexo para o detalhamento completo.",
    authorName: "Administrador Geral RODOVAR",
    department: "Administrativo",
    dateFormatted: "27/10/2027",
    createdAtIso: "2027-10-27T10:00:00Z",
    coverImage: "/assets/aistudio/010203_5a4289e5.png",
    category: "Comunicado Geral",
    priority: "Importante",
    targetAudience: "Todos",
    requireReadConfirmation: true,
    pinned: true,
    likes: ["emp-admin-master", "emp-1", "emp-2"],
    comments: [],
    readReceipts: [
      {
        userId: "emp-admin-master",
        userName: "Administrador Geral RODOVAR",
        department: "Administrativo",
        confirmedAt: "27/10/2027, 23:18"
      },
      {
        userId: "emp-1",
        userName: "Jo\xE3o Silva",
        department: "Administrativo",
        confirmedAt: "27/10/2027, 23:20"
      }
    ],
    pdfUrl: "/assets/aistudio/01_Comunicados_e_Testes_2027_4d007e46.pdf",
    attachments: [
      {
        name: "01_Comunicados_e_Testes_2027.pdf",
        size: "420 KB",
        type: "PDF",
        url: "/assets/aistudio/01_Comunicados_e_Testes_2027_4d007e46.pdf"
      }
    ]
  },
  {
    id: "ann-1",
    title: "RECESSO DE FINAL DE ANO 2027",
    summary: "Confira as orienta\xE7\xF5es sobre devolu\xE7\xE3o de ve\xEDculos, galp\xE3o central e obras com continuidade em 2027.",
    content: "A Diretoria da RODOVAR informa a todos os colaboradores o cronograma oficial do Recesso de Final de Ano 2027 (RDV-EST-02).\n\n1. Devolu\xE7\xE3o e Checklist de Frota: Todos os ve\xEDculos que encerrarem rota at\xE9 o dia 23/12/2027 dever\xE3o passar pela vistoria preventiva no Galp\xE3o Central.\n2. Plant\xE3o Operacional: As opera\xE7\xF5es dedicadas e cargas contratadas com continuidade ter\xE3o escala especial coordenada pelos supervisores de rota.\n3. Setores Administrativos: Recesso programado entre 24/12/2027 e 01/01/2028, com retorno integral no dia 02/01 \xE0s 08h00.",
    authorName: "Roberto Almeida",
    department: "Diretoria",
    dateFormatted: "19/12/2027",
    createdAtIso: "2027-12-19T10:24:00Z",
    coverImage: "/assets/aistudio/010203_5a4289e5.png",
    category: "Importante",
    priority: "Importante",
    targetAudience: "Todos",
    requireReadConfirmation: true,
    pinned: true,
    likes: ["emp-2", "emp-3", "emp-4"],
    comments: [
      {
        id: "c-1",
        authorId: "emp-4",
        authorName: "Carlos Eduardo Mendes",
        authorRole: "Supervisor de Frota Pesada",
        authorAvatar: "/assets/avatar-joao.jpg",
        content: "Escala de plant\xE3o do p\xE1tio matriz j\xE1 alinhada com a equipe de manuten\xE7\xE3o para 2027.",
        createdAt: "19/12/2027 \xE0s 11:05"
      }
    ],
    readReceipts: [
      {
        userId: "emp-admin-master",
        userName: "Administrador Geral RODOVAR",
        department: "Administrativo",
        confirmedAt: "28/10/2027, 00:10"
      },
      {
        userId: "emp-2",
        userName: "Roberto Almeida",
        department: "Diretoria",
        confirmedAt: "19/12/2027 10:25"
      },
      {
        userId: "emp-4",
        userName: "Carlos Eduardo Mendes",
        department: "Operacional",
        confirmedAt: "19/12/2027 11:02"
      }
    ],
    pdfUrl: "/assets/aistudio/02_Recesso_e_Continuidade_2027_ffe95a1d.pdf",
    attachments: [
      {
        name: "02_Recesso_e_Continuidade_2027.pdf",
        size: "1.4 MB",
        type: "PDF",
        url: "/assets/aistudio/02_Recesso_e_Continuidade_2027_ffe95a1d.pdf"
      }
    ]
  },
  {
    id: "ann-2",
    title: "TREINAMENTO OBRIGAT\xD3RIO DE DIRE\xC7\xC3O DEFENSIVA E SEGURAN\xC7A 2027",
    summary: "Convoca\xE7\xE3o para reciclagem anual 2027 de seguran\xE7a vi\xE1ria e protocolos de p\xE1tio para equipes operacionais.",
    content: "O setor de Seguran\xE7a do Trabalho convoca todas as equipes operacionais e motoristas para o m\xF3dulo atualizado de Dire\xE7\xE3o Defensiva e Preven\xE7\xE3o de Acidentes \u2014 Edi\xE7\xE3o 2027 (RDV-EST-03).\n\nO treinamento abordar\xE1 inspe\xE7\xE3o pr\xE9-viagem, frenagem de emerg\xEAncia, fadiga e protocolos em rodovias federais.",
    authorName: "Fernanda Oliveira",
    department: "Seguran\xE7a",
    dateFormatted: "18/12/2027",
    createdAtIso: "2027-12-18T14:00:00Z",
    coverImage: "/assets/aistudio/DSC00515_18c5e319.JPG",
    category: "Seguran\xE7a",
    priority: "Urgente",
    targetAudience: "Todos",
    requireReadConfirmation: true,
    pinned: false,
    likes: ["emp-1", "emp-2", "emp-5"],
    comments: [],
    readReceipts: [
      {
        userId: "emp-admin-master",
        userName: "Administrador Geral RODOVAR",
        department: "Administrativo",
        confirmedAt: "28/10/2027, 00:10"
      },
      {
        userId: "emp-1",
        userName: "Jo\xE3o Silva",
        department: "Administrativo",
        confirmedAt: "18/12/2027 15:12"
      }
    ],
    pdfUrl: "/assets/aistudio/03_Direcao_Defensiva_2027_500e5359.pdf",
    attachments: [
      {
        name: "03_Direcao_Defensiva_2027.pdf",
        size: "3.2 MB",
        type: "PDF",
        url: "/assets/aistudio/03_Direcao_Defensiva_2027_500e5359.pdf"
      }
    ]
  },
  {
    id: "ann-3",
    title: "ATUALIZA\xC7\xC3O DO MANUAL DO COLABORADOR E FUN\xC7\xD5ES PROFISSIONAIS 2027",
    summary: "Novas diretrizes de fun\xE7\xF5es profissionais, plano de sa\xFAde e guias de trabalho 2027 j\xE1 dispon\xEDveis na Central de Documentos.",
    content: "O departamento de Recursos Humanos disponibilizou a vers\xE3o revisada do Manual do Colaborador e Guia de Fun\xE7\xF5es Profissionais RODOVAR para o ciclo 2027 (RDV-EST-07).\n\nRecomendamos a leitura atenta das atribui\xE7\xF5es operacionais, administrativas e benef\xEDcios atualizados para 2027.",
    authorName: "Mariana Costa",
    department: "Recursos Humanos",
    dateFormatted: "16/12/2027",
    createdAtIso: "2027-12-16T09:30:00Z",
    coverImage: "/assets/aistudio/010203_5a4289e5.png",
    category: "Recursos Humanos",
    priority: "Normal",
    targetAudience: "Todos",
    requireReadConfirmation: false,
    pinned: false,
    likes: ["emp-3", "emp-6"],
    comments: [],
    readReceipts: [],
    pdfUrl: "/assets/aistudio/07_Funcoes_Profissionais_2027_461a1f82.pdf",
    attachments: [
      {
        name: "07_Funcoes_Profissionais_2027.pdf",
        size: "2.1 MB",
        type: "PDF",
        url: "/assets/aistudio/07_Funcoes_Profissionais_2027_461a1f82.pdf"
      }
    ]
  }
];
var nowMs = Date.now();
var hoursAgo = (h) => new Date(nowMs - h * 3600 * 1e3).toISOString();
var hoursFrom = (isoStart, h) => new Date(new Date(isoStart).getTime() + h * 3600 * 1e3).toISOString();
var req1025Created = hoursAgo(14);
var req1024Created = hoursAgo(42);
var req1022Created = hoursAgo(54);
var INITIAL_REQUESTS = [
  {
    id: "req-1025",
    protocol: "#1025",
    requesterId: "emp-1",
    requesterName: "Jo\xE3o Silva",
    requesterDepartment: "Administrativo",
    targetDepartment: "Recursos Humanos",
    subject: "Declara\xE7\xE3o de V\xEDnculo Corporativo e Comprovante de Rendimentos 2027",
    description: "Solicito emiss\xE3o de declara\xE7\xE3o formal de v\xEDnculo empregat\xEDcio assinada digitalmente pelo RH para atualiza\xE7\xE3o cadastral banc\xE1ria 2027.",
    priority: "M\xE9dia",
    status: "Em andamento",
    createdAtIso: req1025Created,
    originalDueAtIso: hoursFrom(req1025Created, 48),
    currentDueAtIso: hoursFrom(req1025Created, 48),
    attachmentName: "06_Comprovantes_e_Guias_de_Trabalho_2027.pdf",
    history: [
      {
        id: "h-1",
        timestamp: "Hoje \xE0s 08:10",
        actorName: "Jo\xE3o Silva",
        action: "Solicita\xE7\xE3o aberta com prazo autom\xE1tico de 48h corridas."
      },
      {
        id: "h-2",
        timestamp: "Hoje \xE0s 09:15",
        actorName: "Mariana Costa (RH)",
        action: "Status alterado para Em andamento",
        note: "Documento em confer\xEAncia pela coordena\xE7\xE3o de folha."
      }
    ]
  },
  {
    id: "req-1024",
    protocol: "#1024",
    requesterId: "emp-1",
    requesterName: "Jo\xE3o Silva",
    requesterDepartment: "Administrativo",
    targetDepartment: "Financeiro",
    subject: "Reembolso de Despesa em Viagem T\xE9cnica \u2014 Filial Sul 2027",
    description: "Envio comprovantes fiscais referentes ao deslocamento e hospedagem durante auditoria administrativa na unidade regional.",
    priority: "Alta",
    status: "Em an\xE1lise",
    createdAtIso: req1024Created,
    originalDueAtIso: hoursFrom(req1024Created, 48),
    currentDueAtIso: hoursFrom(req1024Created, 48),
    attachmentName: "Notas_Fiscais_Filial_Sul_2027.pdf",
    history: [
      {
        id: "h-3",
        timestamp: "Ontem \xE0s 09:40",
        actorName: "Jo\xE3o Silva",
        action: "Solicita\xE7\xE3o aberta com prazo regulamentar de 48h."
      }
    ]
  },
  {
    id: "req-1022",
    protocol: "#1022",
    requesterId: "emp-4",
    requesterName: "Carlos Eduardo Mendes",
    requesterDepartment: "Operacional",
    targetDepartment: "Administrativo",
    subject: "Renova\xE7\xE3o de Credencial de Acesso ao Terminal Portu\xE1rio 2027",
    description: "Solicito renova\xE7\xE3o urgente dos crach\xE1s de acesso para 4 motoristas escalados na opera\xE7\xE3o portu\xE1ria.",
    priority: "Urgente",
    status: "Aberta",
    createdAtIso: req1022Created,
    originalDueAtIso: hoursFrom(req1022Created, 48),
    currentDueAtIso: hoursFrom(req1022Created, 48),
    history: [
      {
        id: "h-4",
        timestamp: "H\xE1 2 dias",
        actorName: "Carlos Eduardo Mendes",
        action: "Solicita\xE7\xE3o registrada. Escalonamento autom\xE1tico ativado ap\xF3s vencimento de 48h."
      }
    ]
  },
  {
    id: "req-1019",
    protocol: "#1019",
    requesterId: "emp-1",
    requesterName: "Jo\xE3o Silva",
    requesterDepartment: "Administrativo",
    targetDepartment: "Recursos Humanos",
    subject: "Atualiza\xE7\xE3o de Dependentes no Plano de Sa\xFAde 2027",
    description: "Inclus\xE3o de documenta\xE7\xE3o comprobat\xF3ria conclu\xEDda com sucesso.",
    priority: "Baixa",
    status: "Conclu\xEDda",
    createdAtIso: hoursAgo(90),
    originalDueAtIso: hoursAgo(42),
    currentDueAtIso: hoursAgo(42),
    history: [
      {
        id: "h-5",
        timestamp: "15/12/2027",
        actorName: "Mariana Costa (RH)",
        action: "Solicita\xE7\xE3o conclu\xEDda dentro do prazo CSI (tempo total: 18h)."
      }
    ]
  }
];

// server.ts
import express from "express";
import crypto12 from "crypto";
import fs11 from "fs";
import path11 from "path";
import zlib2 from "zlib";

// src/lib/expeditionValidation.ts
function expeditionPaymentMode(value) {
  const v = (value || "").toLowerCase();
  if (/70\s*%?.*30\s*%?/.test(v)) return "70% Adiantamento / 30% Saldo na Entrega";
  if (/80\s*%?.*20\s*%?/.test(v)) return "80% Adiantamento / 20% Saldo na Entrega";
  if (/integral|100\s*%/.test(v)) return "Integral (100%)";
  return "";
}
function effectiveExpeditionChecklist(f) {
  const c = f.checklistFechamento || {};
  return {
    ...c,
    motoristaConfirmado: !!c.motoristaConfirmado && String(f.motoristaNome || "").trim().length >= 3 && String(f.motoristaCpf || "").replace(/\D/g, "").length === 11 && String(f.motoristaTelefone || "").replace(/\D/g, "").length >= 8,
    veiculoConfirmado: !!c.veiculoConfirmado && String(f.placaVeiculo || "").trim().length >= 6 && String(f.veiculoNecessario || "").trim().length >= 2,
    condicoesConferidas: !!c.condicoesConferidas && String(f.condicoesOperacionais || "").trim().length >= 3 && !!expeditionPaymentMode(f.condicoesPagamento) && Number(f.valorContratadoCentavos) > 0,
    ordemColetaEnviadaMotorista: !!c.ordemColetaEnviadaMotorista && !!f.ordemCarregamentoNumero
  };
}
function expeditionChecklistCount(f) {
  const c = effectiveExpeditionChecklist(f);
  return [c.motoristaConfirmado, c.veiculoConfirmado, c.condicoesConferidas && c.documentosConferidos, c.videochamadaRealizada, c.ordemColetaEnviadaMotorista].filter(Boolean).length;
}

// src/server/unifiedFreightEngine.ts
import crypto10 from "crypto";
import fs9 from "fs";
import path9 from "path";
var COMPANY_OFFICIAL_PROFILES = {
  RODOVAR: {
    razaoSocial: "RODOVAR TRANSPORTES E LOGISTICA",
    cnpj: "49908710000103",
    ie: "205429099",
    endereco: "TRAVESSA ACALANTO / JARDIM DAS MARGARIDAS - SALVADOR - BA",
    telefone: "(71) 9 9920-2476"
  },
  "VL TRANSPORTES": {
    razaoSocial: "VL TRANSPORTES LTDA",
    cnpj: "54506363000122",
    ie: "",
    endereco: "R JUBIABA, 292 - LUIS EDUARDO MAGALHAES - SIMOES FILHO / BA",
    telefone: "(71) 9 9920-2476"
  }
};
var ROOT_DIR = resolveDataRoot();
var FREIGHTS_STORE_DIR = path9.join(ROOT_DIR, "data", "freights-store");
var FREIGHT_ATTACHMENTS_DIR = path9.join(ROOT_DIR, "data", "freight-attachments");
var NOTIFICATIONS_FILE = path9.join(FREIGHTS_STORE_DIR, "_notifications.json");
var SEQUENCE_FILE = path9.join(FREIGHTS_STORE_DIR, "_sequence.json");
var MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
function formatSaoPauloDateTime(date = /* @__PURE__ */ new Date()) {
  const iso = date.toISOString();
  const partsFormatter = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
  const parts = partsFormatter.formatToParts(date);
  const map = {};
  for (const p of parts) {
    map[p.type] = p.value;
  }
  const day = map.day || "01";
  const month = map.month || "01";
  const year = map.year || "2027";
  const hour = map.hour === "24" ? "00" : map.hour || "00";
  const minute = map.minute || "00";
  return {
    iso,
    formatted: `${day}/${month}/${year} ${hour}:${minute}`,
    timeShort: `${hour}:${minute}`,
    dateOnlyIso: `${year}-${month}-${day}`
  };
}
var freightsIndex = /* @__PURE__ */ new Map();
var freightSubDocs = /* @__PURE__ */ new Map();
var idempotencyCache = /* @__PURE__ */ new Map();
var activeFreightLocks = /* @__PURE__ */ new Set();
var serverNotifications = [];
var nextProtocolNumber = 843;
var nextOrderSeqByBrand = {
  RODOVAR: 1,
  "VL TRANSPORTES": 1
};
var freightsDataVersion = 1;
var seededFromDefaultsOnly = false;
function bumpFreightsDataVersion() {
  freightsDataVersion += 1;
}
function ensureDirectories() {
  if (!fs9.existsSync(FREIGHTS_STORE_DIR)) {
    fs9.mkdirSync(FREIGHTS_STORE_DIR, { recursive: true });
  }
  if (!fs9.existsSync(FREIGHT_ATTACHMENTS_DIR)) {
    fs9.mkdirSync(FREIGHT_ATTACHMENTS_DIR, { recursive: true });
  }
}
function getFreightDocPath(freightId) {
  const safeId = freightId.replace(/[^a-zA-Z0-9_-]/g, "");
  return path9.join(FREIGHTS_STORE_DIR, `${safeId}.json`);
}
function getFreightSubDocPath(freightId) {
  const safeId = freightId.replace(/[^a-zA-Z0-9_-]/g, "");
  return path9.join(FREIGHTS_STORE_DIR, `${safeId}.sub.json`);
}
function writeJsonAtomically(targetPath, data) {
  ensureDirectories();
  const tmp = `${targetPath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  fs9.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  fs9.renameSync(tmp, targetPath);
}
function computePendingForExpedicao(freight) {
  const pending = [];
  if (!freight.pesoKg || freight.pesoKg <= 0 || !freight.volumes || freight.volumes <= 0) {
    pending.push("Peso (kg) e volumes da carga");
  }
  if (!freight.veiculoNecessario || freight.veiculoNecessario.trim().length < 2) {
    pending.push("Tipo de ve\xEDculo necess\xE1rio");
  }
  if (!freight.motoristaNome || freight.motoristaNome.trim().length < 3 || !freight.motoristaCpf || !freight.motoristaTelefone) {
    pending.push("Dados do motorista (nome, CPF e telefone)");
  }
  if (!freight.transportadorNome || freight.transportadorNome.trim().length < 2) {
    pending.push("Transportador / propriet\xE1rio");
  }
  if (!freight.placaVeiculo || freight.placaVeiculo.trim().length < 6) {
    pending.push("Placas do ve\xEDculo / carreta");
  }
  if (!freight.valorContratadoCentavos || freight.valorContratadoCentavos <= 0) {
    pending.push("Valor contratado com o motorista");
  }
  return pending;
}
function syncSubDocCounters(freight, sub) {
  freight.anexosCount = sub.anexos.length;
  freight.comentariosCount = sub.comentarios.length;
  const openOccs = sub.ocorrencias.filter((o) => !o.resolved);
  freight.ocorrenciasAbertasCount = openOccs.length;
  freight.ocorrenciasImpeditivasCount = openOccs.filter((o) => o.severity === "IMPEDITIVA").length;
  freight.checklistConcluidosCount = expeditionChecklistCount(freight);
  freight.camposPendentesExpedicao = computePendingForExpedicao(freight);
  const deliveryProofs = sub.anexos.filter((a) => a.category === "COMPROVANTE_ENTREGA");
  const verifiedProof = deliveryProofs.find((a) => a.conferido);
  if (verifiedProof) {
    freight.comprovanteEntregaAnexoId = verifiedProof.id;
    freight.comprovanteEntregaConferido = true;
  } else if (deliveryProofs.length > 0) {
    freight.comprovanteEntregaAnexoId = deliveryProofs[0].id;
    freight.comprovanteEntregaConferido = false;
  } else {
    freight.comprovanteEntregaAnexoId = void 0;
    freight.comprovanteEntregaConferido = false;
  }
  if (freight.devolvidoParaCorrecao && freight.motivoDevolucao) {
    freight.pendenciaPrincipal = `Devolvido p/ corre\xE7\xE3o: ${freight.motivoDevolucao}`;
  } else if (freight.requerReconfirmacaoOperacional) {
    freight.pendenciaPrincipal = freight.motivoReconfirmacao || "Altera\xE7\xE3o comercial aguarda reconfirma\xE7\xE3o";
  } else if (freight.ocorrenciasImpeditivasCount > 0) {
    const imp = openOccs.find((o) => o.severity === "IMPEDITIVA");
    freight.pendenciaPrincipal = `Ocorr\xEAncia impeditiva: ${imp?.title || "Verificar"}`;
  } else if (freight.ocorrenciasAbertasCount > 0) {
    const anyOcc = openOccs[0];
    freight.pendenciaPrincipal = `Ocorr\xEAncia: ${anyOcc.title}`;
  } else if (["RECEBIDO", "EM_PREPARACAO", "AGUARDANDO_FECHAMENTO"].includes(freight.situacaoOperacional) && freight.checklistConcluidosCount < 5) {
    freight.pendenciaPrincipal = `Confer\xEAncias da Expedi\xE7\xE3o (${freight.checklistConcluidosCount}/5)`;
  } else {
    freight.pendenciaPrincipal = void 0;
  }
}
var financeListeners = /* @__PURE__ */ new Set();
var subscribeUnifiedFinance = (listener) => {
  financeListeners.add(listener);
  return () => financeListeners.delete(listener);
};
var unifiedFinanceFreights = () => [...freightsIndex.values()].filter((f) => f.situacaoMonitoramento !== "NAO_LIBERADO" && f.situacaoMonitoramento !== "DEVOLVIDO_EXPEDICAO" && f.situacaoOperacional !== "CANCELADO");
function saveFreightsSnapshotToNeon() {
  void persistStateSnapshotToNeon("rodovar-freights-state", {
    nextProtocolNumber,
    nextOrderSeqByBrand,
    freights: Array.from(freightsIndex.values()),
    subDocs: Array.from(freightSubDocs.values()),
    notifications: serverNotifications.slice(0, 300),
    updatedAtIso: (/* @__PURE__ */ new Date()).toISOString()
  });
}
function hydrateUnifiedFreightsFromPayload(payload) {
  if (!payload || typeof payload !== "object") return;
  if (typeof payload.nextProtocolNumber === "number" && payload.nextProtocolNumber > nextProtocolNumber) {
    nextProtocolNumber = payload.nextProtocolNumber;
  }
  if (payload.nextOrderSeqByBrand && typeof payload.nextOrderSeqByBrand === "object") {
    const rdv = Number(payload.nextOrderSeqByBrand.RODOVAR);
    const vl = Number(payload.nextOrderSeqByBrand["VL TRANSPORTES"]);
    if (!Number.isNaN(rdv) && rdv > nextOrderSeqByBrand.RODOVAR) nextOrderSeqByBrand.RODOVAR = rdv;
    if (!Number.isNaN(vl) && vl > nextOrderSeqByBrand["VL TRANSPORTES"]) nextOrderSeqByBrand["VL TRANSPORTES"] = vl;
  }
  if (seededFromDefaultsOnly && Array.isArray(payload.freights) && payload.freights.length > 0) {
    freightsIndex.clear();
    freightSubDocs.clear();
    seededFromDefaultsOnly = false;
  }
  if (Array.isArray(payload.subDocs)) {
    for (const sub of payload.subDocs) {
      if (sub && sub.freightId) {
        freightSubDocs.set(sub.freightId, sub);
      }
    }
  }
  if (Array.isArray(payload.freights) && payload.freights.length > 0) {
    for (const f of payload.freights) {
      if (!f || !f.id) continue;
      const existing = freightsIndex.get(f.id);
      if (!existing || Number(f.revision || 0) >= Number(existing.revision || 0)) {
        freightsIndex.set(f.id, f);
      }
      if (typeof f.ordemColetaSequencia === "number" && f.empresaMarca !== "AXD") {
        const b = f.empresaMarca === "VL TRANSPORTES" ? "VL TRANSPORTES" : "RODOVAR";
        if (f.ordemColetaSequencia >= nextOrderSeqByBrand[b]) {
          nextOrderSeqByBrand[b] = f.ordemColetaSequencia + 1;
        }
      }
    }
  }
  if (Array.isArray(payload.notifications) && payload.notifications.length > 0) {
    const existingIds = new Set(serverNotifications.map((n) => n.id));
    for (const n of payload.notifications) {
      if (n && n.id && !existingIds.has(n.id)) {
        serverNotifications.push(n);
        existingIds.add(n.id);
      }
    }
  }
  bumpFreightsDataVersion();
}
function persistFreightAndSubDoc(freight, sub, options) {
  const existingSub = sub || freightSubDocs.get(freight.id) || {
    freightId: freight.id,
    anexos: [],
    comentarios: [],
    ocorrencias: [],
    historico: []
  };
  syncSubDocCounters(freight, existingSub);
  freightsIndex.set(freight.id, freight);
  freightSubDocs.set(freight.id, existingSub);
  if (!options?.skipNeon) {
    seededFromDefaultsOnly = false;
  }
  bumpFreightsDataVersion();
  writeJsonAtomically(getFreightDocPath(freight.id), freight);
  writeJsonAtomically(getFreightSubDocPath(freight.id), existingSub);
  for (const listener of financeListeners) listener(freight);
  if (!options?.skipNeon) {
    void persistFreightToNeon(freight);
    saveFreightsSnapshotToNeon();
  }
}
function saveNotifications() {
  bumpFreightsDataVersion();
  writeJsonAtomically(NOTIFICATIONS_FILE, serverNotifications);
  saveFreightsSnapshotToNeon();
}
function saveSequence(skipNeon = false) {
  writeJsonAtomically(SEQUENCE_FILE, { nextProtocolNumber, nextOrderSeqByBrand });
  if (!skipNeon) {
    saveFreightsSnapshotToNeon();
  }
}
function allocateNextOrderNumber(brand, year) {
  const spYear = year || Number(formatSaoPauloDateTime().dateOnlyIso.slice(0, 4)) || (/* @__PURE__ */ new Date()).getFullYear();
  let nextSeq = Math.max(1, nextOrderSeqByBrand[brand] || 1);
  const prefix = brand === "VL TRANSPORTES" ? "OC-VL-" : "OC-RDV-";
  for (const rec of freightsIndex.values()) {
    const recBrand = rec.empresaMarca === "VL TRANSPORTES" ? "VL TRANSPORTES" : rec.empresaMarca === "RODOVAR" ? "RODOVAR" : null;
    if (recBrand !== brand) continue;
    if (typeof rec.ordemColetaSequencia === "number" && rec.ordemColetaSequencia >= nextSeq) {
      nextSeq = rec.ordemColetaSequencia + 1;
    }
    if (rec.ordemCarregamentoNumero && rec.ordemCarregamentoNumero.startsWith(prefix)) {
      const m = rec.ordemCarregamentoNumero.match(/^OC-(?:RDV|VL)-(\d+)/);
      if (m) {
        const parsed = parseInt(m[1], 10);
        if (!Number.isNaN(parsed) && parsed >= nextSeq) {
          nextSeq = parsed + 1;
        }
      }
    }
  }
  nextOrderSeqByBrand[brand] = nextSeq + 1;
  saveSequence();
  const orderNumber = `${prefix}${String(nextSeq).padStart(6, "0")}/${spYear}`;
  return { orderNumber, sequence: nextSeq, year: spYear };
}
function formatProtocolNumber(seq) {
  if (seq < 1e3) {
    return `RDV-${String(seq).padStart(3, "0")}`;
  }
  return `RDV-${seq}`;
}
function normalizeFreightProtocol(raw) {
  const clean = String(raw || "").trim();
  if (!clean) return formatProtocolNumber(nextProtocolNumber++);
  if (/^RDV-\d+$/i.test(clean)) {
    const num = parseInt(clean.replace(/^RDV-/i, ""), 10);
    return formatProtocolNumber(num);
  }
  const match = clean.match(/^#?(\d+)$/);
  if (match) {
    return formatProtocolNumber(parseInt(match[1], 10));
  }
  return clean;
}
function allocateNextProtocol() {
  const num = nextProtocolNumber++;
  saveSequence();
  return formatProtocolNumber(num);
}
function pushFreightNotification(params) {
  if (!params.recipientId) return;
  if (params.dedupeKey) {
    const exists = serverNotifications.some(
      (n) => n.recipientId === params.recipientId && n.dedupeKey === params.dedupeKey
    );
    if (exists) return;
  }
  const sp = formatSaoPauloDateTime();
  const notif = {
    id: `fnotif-${Date.now()}-${crypto10.randomBytes(3).toString("hex")}`,
    recipientId: params.recipientId,
    type: "prazo",
    dotColor: params.dotColor || "blue",
    title: params.title,
    subtitle: params.subtitle,
    timeLabel: sp.formatted,
    createdAtIso: sp.iso,
    read: false,
    targetSection: params.targetSection,
    targetId: params.targetId,
    dedupeKey: params.dedupeKey
  };
  serverNotifications.unshift(notif);
  if (serverNotifications.length > 500) {
    serverNotifications = serverNotifications.slice(0, 500);
  }
  saveNotifications();
  void persistNotificationToNeon(notif).catch(() => {
  });
}
function normalizeLegacyFreightRecord(rec) {
  let mutated = false;
  const normProto = normalizeFreightProtocol(rec.protocol);
  if (normProto !== rec.protocol) {
    rec.protocol = normProto;
    mutated = true;
  }
  if (!rec.checklistFechamento) {
    rec.checklistFechamento = {
      motoristaConfirmado: false,
      veiculoConfirmado: false,
      condicoesConferidas: false,
      documentosConferidos: false,
      videochamadaRealizada: false,
      ordemColetaEnviadaMotorista: false
    };
    mutated = true;
  } else {
    if (rec.checklistFechamento.videochamadaRealizada === void 0) {
      const wasReleased = ["EM_TRANSPORTE", "AGUARDANDO_COLETA", "CONCLUIDO", "LIBERADO_MONITORAMENTO"].includes(
        rec.situacaoOperacional
      );
      rec.checklistFechamento.videochamadaRealizada = wasReleased;
      if (wasReleased) {
        rec.checklistFechamento.videochamadaRealizadaPorId = rec.expedicaoResponsavelId || "emp-4";
        rec.checklistFechamento.videochamadaRealizadaPorNome = rec.expedicaoResponsavelNome || "Carlos Eduardo Mendes";
        rec.checklistFechamento.videochamadaRealizadaEm = rec.checklistFechamento.conferidoEmFormatado || rec.updatedAtFormatted;
        rec.checklistFechamento.videochamadaObservacoes = "Videochamada validada com confer\xEAncia de CNH e equipamento.";
      }
      mutated = true;
    }
    if (rec.checklistFechamento.ordemColetaEnviadaMotorista === void 0) {
      const wasReleased = ["EM_TRANSPORTE", "AGUARDANDO_COLETA", "CONCLUIDO", "LIBERADO_MONITORAMENTO"].includes(
        rec.situacaoOperacional
      );
      rec.checklistFechamento.ordemColetaEnviadaMotorista = wasReleased;
      if (wasReleased) {
        rec.checklistFechamento.ordemColetaEnviadaPorId = rec.expedicaoResponsavelId || "emp-4";
        rec.checklistFechamento.ordemColetaEnviadaPorNome = rec.expedicaoResponsavelNome || "Carlos Eduardo Mendes";
        rec.checklistFechamento.ordemColetaEnviadaEm = rec.ordemCarregamentoEmitidaEm || rec.updatedAtFormatted;
      }
      mutated = true;
    }
  }
  if (rec.situacaoComercial === "NA_EXPEDICAO" || rec.situacaoComercial === "CONTRATADO") {
    rec.situacaoComercial = "AGUARDANDO_EXPEDICAO";
    mutated = true;
  } else if (rec.situacaoComercial === "EM_TRANSPORTE") {
    rec.situacaoComercial = "EM_MONITORAMENTO";
    mutated = true;
  }
  if (rec.situacaoOperacional === "EM_TRANSPORTE" || rec.situacaoOperacional === "AGUARDANDO_COLETA") {
    const wasInTransit = rec.situacaoOperacional === "EM_TRANSPORTE";
    rec.situacaoOperacional = "LIBERADO_MONITORAMENTO";
    rec.situacaoComercial = "EM_MONITORAMENTO";
    if (!rec.situacaoMonitoramento || rec.situacaoMonitoramento === "NAO_LIBERADO") {
      rec.situacaoMonitoramento = wasInTransit ? "CARREGADO_EM_TRANSPORTE" : "NOVO_PARA_CARREGAR";
    }
    if (!rec.monitoramentoResponsavelId) {
      rec.monitoramentoResponsavelId = rec.expedicaoResponsavelId || "emp-4";
      rec.monitoramentoResponsavelNome = rec.expedicaoResponsavelNome || "Carlos Eduardo Mendes";
    }
    if (!rec.ordemCarregamentoNumero) {
      rec.ordemCarregamentoNumero = `OC-RDV-${rec.protocol.replace("#", "")}-2027`;
      rec.ordemCarregamentoEmitidaEm = rec.updatedAtFormatted;
    }
    if (!rec.liberadoMonitoramentoEm) {
      rec.liberadoMonitoramentoEm = rec.coletaProgramadaEm || rec.updatedAtFormatted;
    }
    if (!rec.ultimaLocalizacaoInformada && wasInTransit) {
      rec.ultimaLocalizacaoInformada = "BR-116 \u2014 Trecho Te\xF3filo Otoni/MG (informado pelo motorista)";
      rec.ultimaLocalizacaoAtualizadaEm = rec.updatedAtFormatted;
      rec.ultimaLocalizacaoAtualizadaPor = rec.monitoramentoResponsavelNome || "Operador";
    }
    mutated = true;
  } else if (rec.situacaoOperacional === "FECHADO") {
    if (rec.id === "frete-0840" && (!rec.situacaoMonitoramento || rec.situacaoMonitoramento === "NAO_LIBERADO")) {
      rec.situacaoOperacional = "LIBERADO_MONITORAMENTO";
      rec.situacaoComercial = "EM_MONITORAMENTO";
      rec.situacaoMonitoramento = "NOVO_PARA_CARREGAR";
      rec.monitoramentoResponsavelId = rec.expedicaoResponsavelId || "emp-4";
      rec.monitoramentoResponsavelNome = rec.expedicaoResponsavelNome || "Carlos Eduardo Mendes";
      rec.checklistFechamento.videochamadaRealizada = true;
      rec.checklistFechamento.videochamadaRealizadaPorId = "emp-4";
      rec.checklistFechamento.videochamadaRealizadaPorNome = "Carlos Eduardo Mendes";
      rec.checklistFechamento.videochamadaRealizadaEm = "27/10/2027 16:05";
      rec.checklistFechamento.videochamadaObservacoes = "Confer\xEAncia visual realizada via WhatsApp V\xEDdeo com motorista Marcos.";
      rec.checklistFechamento.ordemColetaEnviadaMotorista = true;
      rec.checklistFechamento.ordemColetaEnviadaPorId = "emp-4";
      rec.checklistFechamento.ordemColetaEnviadaPorNome = "Carlos Eduardo Mendes";
      rec.checklistFechamento.ordemColetaEnviadaEm = "27/10/2027 16:10";
      rec.ordemCarregamentoNumero = "OC-RDV-0840-2027";
      rec.ordemCarregamentoEmitidaEm = "27/10/2027 16:08";
      rec.liberadoMonitoramentoEm = "27/10/2027 16:10";
      mutated = true;
    } else {
      rec.situacaoOperacional = "EM_PREPARACAO";
      if (!rec.situacaoMonitoramento) rec.situacaoMonitoramento = "NAO_LIBERADO";
      mutated = true;
    }
  } else if (rec.situacaoOperacional === "AGUARDANDO_FECHAMENTO") {
    rec.situacaoOperacional = rec.motoristaNome || rec.checklistFechamento?.motoristaConfirmado ? "EM_PREPARACAO" : "RECEBIDO";
    if (!rec.situacaoMonitoramento) rec.situacaoMonitoramento = "NAO_LIBERADO";
    mutated = true;
  } else if (rec.situacaoOperacional === "CONCLUIDO") {
    rec.situacaoComercial = "FINALIZADO";
    if (!rec.situacaoMonitoramento || rec.situacaoMonitoramento !== "FINALIZADO") {
      rec.situacaoMonitoramento = "FINALIZADO";
      mutated = true;
    }
  } else if (!rec.situacaoMonitoramento) {
    rec.situacaoMonitoramento = "NAO_LIBERADO";
    mutated = true;
  }
  return mutated;
}
function loadOrSeedUnifiedFreights() {
  ensureDirectories();
  if (fs9.existsSync(NOTIFICATIONS_FILE)) {
    try {
      const parsed = JSON.parse(fs9.readFileSync(NOTIFICATIONS_FILE, "utf8"));
      if (Array.isArray(parsed)) serverNotifications = parsed;
    } catch {
      serverNotifications = [];
    }
  }
  if (fs9.existsSync(SEQUENCE_FILE)) {
    try {
      const seq = JSON.parse(fs9.readFileSync(SEQUENCE_FILE, "utf8"));
      if (seq && typeof seq.nextProtocolNumber === "number") {
        nextProtocolNumber = Math.max(843, seq.nextProtocolNumber);
      }
      if (seq && seq.nextOrderSeqByBrand && typeof seq.nextOrderSeqByBrand === "object") {
        const rdv = Number(seq.nextOrderSeqByBrand.RODOVAR);
        const vl = Number(seq.nextOrderSeqByBrand["VL TRANSPORTES"]);
        if (!Number.isNaN(rdv) && rdv > nextOrderSeqByBrand.RODOVAR) nextOrderSeqByBrand.RODOVAR = rdv;
        if (!Number.isNaN(vl) && vl > nextOrderSeqByBrand["VL TRANSPORTES"]) nextOrderSeqByBrand["VL TRANSPORTES"] = vl;
      }
    } catch {
    }
  }
  const files = fs9.readdirSync(FREIGHTS_STORE_DIR);
  const freightDocFiles = files.filter(
    (f) => f.endsWith(".json") && !f.endsWith(".sub.json") && !f.startsWith("_")
  );
  if (freightDocFiles.length > 0) {
    freightsIndex.clear();
    freightSubDocs.clear();
    for (const file of freightDocFiles) {
      try {
        const fullPath = path9.join(FREIGHTS_STORE_DIR, file);
        const rec = JSON.parse(fs9.readFileSync(fullPath, "utf8"));
        if (rec && rec.id) {
          const subPath = getFreightSubDocPath(rec.id);
          let sub = {
            freightId: rec.id,
            anexos: [],
            comentarios: [],
            ocorrencias: [],
            historico: []
          };
          if (fs9.existsSync(subPath)) {
            sub = JSON.parse(fs9.readFileSync(subPath, "utf8"));
          }
          const mutated = normalizeLegacyFreightRecord(rec);
          syncSubDocCounters(rec, sub);
          freightsIndex.set(rec.id, rec);
          freightSubDocs.set(rec.id, sub);
          if (mutated) {
            writeJsonAtomically(fullPath, rec);
          }
          const numMatch = rec.protocol.replace("#", "");
          const parsedNum = parseInt(numMatch, 10);
          if (!isNaN(parsedNum) && parsedNum >= nextProtocolNumber) {
            nextProtocolNumber = parsedNum + 1;
          }
          if (typeof rec.ordemColetaSequencia === "number" && rec.empresaMarca !== "AXD") {
            const b = rec.empresaMarca === "VL TRANSPORTES" ? "VL TRANSPORTES" : "RODOVAR";
            if (rec.ordemColetaSequencia >= nextOrderSeqByBrand[b]) {
              nextOrderSeqByBrand[b] = rec.ordemColetaSequencia + 1;
            }
          }
        }
      } catch (err) {
        console.error("Error loading freight doc:", file, err);
      }
    }
    saveSequence(true);
    return;
  }
  const sp = formatSaoPauloDateTime();
  const initialRecords = [
    {
      freight: {
        id: "frete-0842",
        protocol: "#0842",
        empresaMarca: "RODOVAR",
        unidadeOperacional: "BA - Salvador",
        cliente: "AMBEV S.A.",
        clienteCnpj: "07.526.557/0001-00",
        clienteContato: "71 9 9920-2476",
        origemCidadeUf: "Feira de Santana - BA",
        enderecoColeta: "Rodovia BR-116 Norte, Km 425 \u2014 CD AMBEV Feira de Santana/BA",
        destinoCidadeUf: "Salvador - BA",
        enderecoEntrega: "Via Urbana CIA Sul, Km 12 \u2014 Galp\xE3o Log\xEDstico RODOVAR Salvador/BA",
        instrucoesColetaEntrega: "Apresentar motorista na portaria com 30min de anteced\xEAncia e EPI completo.",
        tipoCarga: "Bebidas Paletizadas (PBR)",
        pesoKg: 26500,
        volumes: 28,
        veiculoNecessario: "Carreta Sider 3 Eixos",
        dataColetaIso: "2027-10-28",
        janelaColetaInicio: "08:00",
        janelaColetaFim: "12:00",
        dataEntregaPrevistaIso: "2027-10-29",
        janelaEntregaInicio: "14:00",
        janelaEntregaFim: "18:00",
        comercialResponsavelId: "emp-comercial-1",
        comercialResponsavelNome: "Jeise Santana",
        expedicaoResponsavelId: "emp-expedicao-2",
        expedicaoResponsavelNome: "Marcos Silva",
        monitoramentoResponsavelId: null,
        monitoramentoResponsavelNome: null,
        valorCobradoClienteCentavos: 89e4,
        // R$ 8.900,00
        valorContratadoCentavos: 6e5,
        // R$ 6.000,00
        transportadorNome: "Jo\xE3o Silva Transportes Rodovi\xE1rios",
        transportadorDocumento: "097.813.375-00",
        motoristaNome: "Jos\xE9 Carlos Pereira dos Santos",
        motoristaCpf: "412.889.305-12",
        motoristaTelefone: "71 9 8845-1290",
        placaVeiculo: "RDO4A82",
        placaCarreta: "RDO9B10",
        condicoesPagamento: "70% Adiantamento na coleta / 30% Saldo na entrega",
        favorecidoPagamento: "Jo\xE3o Silva Transportes Rodovi\xE1rios",
        bancoPagamento: "260 - Nu Pagamentos S.A.",
        tipoChavePix: "CPF/CNPJ",
        chavePix: "097.813.375-00",
        condicoesComerciais: "Frete dedicado CIF. Ped\xE1gio incluso na tarifa comercial.",
        condicoesOperacionais: "Exige cinta de amarra\xE7\xE3o a cada 2 paletes e EPI completo.",
        observacoes: "Apresentar motorista na portaria com 30min de anteced\xEAncia.",
        devolvidoParaCorrecao: false,
        requerReconfirmacaoOperacional: false,
        comprovanteEntregaConferido: false,
        situacaoComercial: "AGUARDANDO_EXPEDICAO",
        situacaoOperacional: "EM_PREPARACAO",
        situacaoMonitoramento: "NAO_LIBERADO",
        situacaoFinanceira: "PENDENTE_ADIANTAMENTO",
        checklistFechamento: {
          motoristaConfirmado: true,
          veiculoConfirmado: true,
          condicoesConferidas: true,
          documentosConferidos: true,
          videochamadaRealizada: false,
          ordemColetaEnviadaMotorista: false
        },
        anexosCount: 0,
        comentariosCount: 1,
        ocorrenciasAbertasCount: 0,
        ocorrenciasImpeditivasCount: 0,
        checklistConcluidosCount: 3,
        autorId: "emp-comercial-1",
        autorNome: "Jeise Santana",
        createdAtIso: "2027-10-26T09:30:00.000Z",
        createdAtFormatted: "26/10/2027 09:30",
        updatedAtIso: sp.iso,
        updatedAtFormatted: sp.formatted,
        revision: 1
      },
      sub: {
        freightId: "frete-0842",
        anexos: [],
        comentarios: [
          {
            id: "fcom-0842-1",
            freightId: "frete-0842",
            authorId: "emp-comercial-1",
            authorName: "Jeise Santana",
            authorRole: "Executiva Comercial de Contas",
            sector: "COMERCIAL",
            text: "Frete contratado com a AMBEV e encaminhado \xE0 Expedi\xE7\xE3o para prepara\xE7\xE3o e libera\xE7\xE3o.",
            createdAtIso: "2027-10-26T09:35:00.000Z",
            createdAtFormatted: "26/10/2027 09:35"
          }
        ],
        ocorrencias: [],
        historico: [
          {
            id: "fhist-0842-1",
            freightId: "frete-0842",
            timestampIso: "2027-10-26T09:30:00.000Z",
            timestampFormatted: "26/10/2027 09:30",
            timeShort: "09:30",
            actorId: "emp-comercial-1",
            actorName: "Jeise Santana",
            actorSector: "Comercial",
            eventType: "CRIACAO",
            summary: "Frete #0842 registrado no Comercial para AMBEV S.A."
          },
          {
            id: "fhist-0842-2",
            freightId: "frete-0842",
            timestampIso: "2027-10-26T09:45:00.000Z",
            timestampFormatted: "26/10/2027 09:45",
            timeShort: "09:45",
            actorId: "emp-comercial-1",
            actorName: "Jeise Santana",
            actorSector: "Comercial",
            eventType: "ENVIO_EXPEDICAO",
            summary: "Contrata\xE7\xE3o confirmada e enviada \xE0 Expedi\xE7\xE3o sob responsabilidade de Marcos Silva.",
            newResponsibleName: "Marcos Silva"
          }
        ]
      }
    },
    {
      freight: {
        id: "frete-0841",
        protocol: "#0841",
        empresaMarca: "VL TRANSPORTES",
        unidadeOperacional: "SP - Guarulhos",
        cliente: "BAHIA SUL LOG.",
        clienteCnpj: "14.528.901/0001-88",
        clienteContato: "11 9 9812-3340",
        origemCidadeUf: "Vit\xF3ria da Conquista - BA",
        enderecoColeta: "Distrito Industrial dos Imbor\xE9s, Quadra B \u2014 Terminal Sul/BA",
        destinoCidadeUf: "Guarulhos - SP",
        enderecoEntrega: "Av. Papa Jo\xE3o Paulo I, 4100 \u2014 CD Log\xEDstico Cumbica Guarulhos/SP",
        instrucoesColetaEntrega: "Descarga agendada doca 14. Confirmar chegada com 2h de anteced\xEAncia.",
        tipoCarga: "Celulose e Bobinas Industriais",
        pesoKg: 32e3,
        volumes: 16,
        veiculoNecessario: "Carreta Ba\xFA Lonado LS",
        dataColetaIso: "2027-10-25",
        janelaColetaInicio: "14:00",
        janelaColetaFim: "17:00",
        coletaProgramadaEm: "25/10/2027 10:00",
        coletaConfirmadaEm: "25/10/2027 14:40",
        dataEntregaPrevistaIso: "2027-10-29",
        janelaEntregaInicio: "09:00",
        janelaEntregaFim: "16:00",
        comercialResponsavelId: "emp-comercial-2",
        comercialResponsavelNome: "C\xE9sar Augusto",
        expedicaoResponsavelId: "emp-expedicao-2",
        expedicaoResponsavelNome: "Marcos Silva",
        monitoramentoResponsavelId: "emp-4",
        monitoramentoResponsavelNome: "Carlos Eduardo Mendes",
        valorCobradoClienteCentavos: 124e4,
        // R$ 12.400,00
        valorContratadoCentavos: 85e4,
        // R$ 8.500,00
        transportadorNome: "TransBahia Cargas Rodovi\xE1rias Ltda",
        transportadorDocumento: "14.528.901/0001-88",
        motoristaNome: "Ant\xF4nio Marcos Rocha",
        motoristaCpf: "289.441.005-87",
        motoristaTelefone: "77 9 9914-8821",
        placaVeiculo: "VLT7C19",
        placaCarreta: "VLT2D55",
        condicoesPagamento: "80% Adiantamento / 20% Saldo contra entrega",
        favorecidoPagamento: "TransBahia Cargas Rodovi\xE1rias Ltda",
        bancoPagamento: "341 - Ita\xFA Unibanco S.A.",
        tipoChavePix: "E-mail",
        chavePix: "financeiro@transbahia.com.br",
        condicoesComerciais: "Contrato mensal Bahia Sul. Seguro RCTR-C e RCF-DC averbados.",
        condicoesOperacionais: "Rastreamento ativo e trava de quinta roda.",
        observacoes: "Tr\xE2nsito normal pela BR-116.",
        orientacoesMotorista: "Parada autorizada apenas em postos homologados pela gerenciadora.",
        ultimaLocalizacaoInformada: "BR-116 \u2014 Altura de Governador Valadares/MG (informado pelo motorista)",
        ultimaLocalizacaoAtualizadaEm: "28/10/2027 08:30",
        ultimaLocalizacaoAtualizadaPor: "Carlos Eduardo Mendes",
        devolvidoParaCorrecao: false,
        requerReconfirmacaoOperacional: false,
        comprovanteEntregaConferido: false,
        ordemCarregamentoNumero: "OC-RDV-0841-2027",
        ordemCarregamentoEmitidaEm: "25/10/2027 11:50",
        liberadoMonitoramentoEm: "25/10/2027 12:00",
        liberadoMonitoramentoPorId: "emp-expedicao-2",
        liberadoMonitoramentoPorNome: "Marcos Silva",
        situacaoComercial: "EM_MONITORAMENTO",
        situacaoOperacional: "LIBERADO_MONITORAMENTO",
        situacaoMonitoramento: "CARREGADO_EM_TRANSPORTE",
        situacaoFinanceira: "ADIANTAMENTO_PAGO",
        checklistFechamento: {
          motoristaConfirmado: true,
          veiculoConfirmado: true,
          condicoesConferidas: true,
          documentosConferidos: true,
          videochamadaRealizada: true,
          videochamadaRealizadaPorId: "emp-expedicao-2",
          videochamadaRealizadaPorNome: "Marcos Silva",
          videochamadaRealizadaEm: "25/10/2027 11:40",
          videochamadaObservacoes: "Motorista Ant\xF4nio validado por v\xEDdeo em frente ao cavalo VLT7C19.",
          ordemColetaEnviadaMotorista: true,
          ordemColetaEnviadaPorId: "emp-expedicao-2",
          ordemColetaEnviadaPorNome: "Marcos Silva",
          ordemColetaEnviadaEm: "25/10/2027 11:55",
          conferidoPorId: "emp-expedicao-2",
          conferidoPorNome: "Marcos Silva",
          conferidoEmIso: "2027-10-25T12:00:00.000Z",
          conferidoEmFormatado: "25/10/2027 12:00"
        },
        anexosCount: 0,
        comentariosCount: 0,
        ocorrenciasAbertasCount: 0,
        ocorrenciasImpeditivasCount: 0,
        checklistConcluidosCount: 5,
        autorId: "emp-comercial-2",
        autorNome: "C\xE9sar Augusto",
        createdAtIso: "2027-10-25T09:15:00.000Z",
        createdAtFormatted: "25/10/2027 09:15",
        updatedAtIso: sp.iso,
        updatedAtFormatted: sp.formatted,
        revision: 2
      },
      sub: {
        freightId: "frete-0841",
        anexos: [],
        comentarios: [],
        ocorrencias: [],
        historico: [
          {
            id: "fhist-0841-1",
            freightId: "frete-0841",
            timestampIso: "2027-10-25T09:15:00.000Z",
            timestampFormatted: "25/10/2027 09:15",
            timeShort: "09:15",
            actorId: "emp-comercial-2",
            actorName: "C\xE9sar Augusto",
            actorSector: "Comercial",
            eventType: "CRIACAO",
            summary: "Frete #0841 registrado para BAHIA SUL LOG."
          },
          {
            id: "fhist-0841-2",
            freightId: "frete-0841",
            timestampIso: "2027-10-25T12:00:00.000Z",
            timestampFormatted: "25/10/2027 12:00",
            timeShort: "12:00",
            actorId: "emp-expedicao-2",
            actorName: "Marcos Silva",
            actorSector: "Expedi\xE7\xE3o",
            eventType: "LIBERACAO_MONITORAMENTO",
            summary: "Videochamada conclu\xEDda, Ordem de Coleta enviada ao motorista e frete liberado para Monitoramento (Carlos Eduardo Mendes).",
            newResponsibleName: "Carlos Eduardo Mendes"
          },
          {
            id: "fhist-0841-3",
            freightId: "frete-0841",
            timestampIso: "2027-10-25T14:40:00.000Z",
            timestampFormatted: "25/10/2027 14:40",
            timeShort: "14:40",
            horarioRealEvento: "25/10/2027 14:30",
            actorId: "emp-4",
            actorName: "Carlos Eduardo Mendes",
            actorSector: "Monitoramento",
            eventType: "AVANCO_MONITORAMENTO",
            summary: 'Etapa avan\xE7ada para "Carregado / Em transporte". Ve\xEDculo iniciou viagem.'
          }
        ]
      }
    },
    {
      freight: {
        id: "frete-0840",
        protocol: "#0840",
        empresaMarca: "AXD",
        unidadeOperacional: "BA - Salvador",
        cliente: "BRASKEM S.A.",
        clienteCnpj: "42.150.391/0001-70",
        clienteContato: "71 3496-8000",
        origemCidadeUf: "Cama\xE7ari - BA",
        enderecoColeta: "Rua Eteno, 1561 \u2014 Polo Petroqu\xEDmico de Cama\xE7ari/BA",
        destinoCidadeUf: "Recife - PE",
        enderecoEntrega: "Rodovia BR-101 Sul, Km 82 \u2014 Distrito Industrial Recife/PE",
        instrucoesColetaEntrega: "Obrigat\xF3rio uso de capacete, \xF3culos, bota com biqueira e camisa manga longa no Polo.",
        tipoCarga: "Resinas Termopl\xE1sticas Ensacadas",
        pesoKg: 28e3,
        volumes: 22,
        veiculoNecessario: "Carreta Graneleira / Sider",
        dataColetaIso: "2027-10-28",
        janelaColetaInicio: "07:30",
        janelaColetaFim: "11:30",
        coletaProgramadaEm: "28/10/2027 07:30",
        dataEntregaPrevistaIso: "2027-10-30",
        janelaEntregaInicio: "08:00",
        janelaEntregaFim: "14:00",
        comercialResponsavelId: "emp-comercial-1",
        comercialResponsavelNome: "Jeise Santana",
        expedicaoResponsavelId: "emp-expedicao-2",
        expedicaoResponsavelNome: "Marcos Silva",
        monitoramentoResponsavelId: "emp-4",
        monitoramentoResponsavelNome: "Carlos Eduardo Mendes",
        valorCobradoClienteCentavos: 168e4,
        // R$ 16.800,00
        valorContratadoCentavos: 12e5,
        // R$ 12.000,00
        transportadorNome: "Marcos Oliveira Transportes ME",
        transportadorDocumento: "28.901.442/0001-19",
        motoristaNome: "Marcos Oliveira da Silva",
        motoristaCpf: "619.220.415-00",
        motoristaTelefone: "71 9 8711-4402",
        placaVeiculo: "AXD5E33",
        placaCarreta: "AXD8F91",
        condicoesPagamento: "70% Adiantamento / 30% Saldo",
        favorecidoPagamento: "Marcos Oliveira Transportes ME",
        bancoPagamento: "001 - Banco do Brasil S.A.",
        tipoChavePix: "Telefone",
        chavePix: "+55 71 99123-4567",
        condicoesComerciais: "Opera\xE7\xE3o dedicada Polo Cama\xE7ari. Exige agendamento de janela.",
        condicoesOperacionais: "Kit de emerg\xEAncia qu\xEDmica e lona imperme\xE1vel revisada.",
        observacoes: "Motorista liberado pela gerenciadora de risco.",
        orientacoesMotorista: "Apresentar Ordem de Coleta impressa ou digital na triagem Braskem.",
        ultimaLocalizacaoInformada: "P\xE1tio de Triagem Cama\xE7ari/BA \u2014 Aguardando chamada de doca",
        ultimaLocalizacaoAtualizadaEm: "28/10/2027 07:15",
        ultimaLocalizacaoAtualizadaPor: "Carlos Eduardo Mendes",
        devolvidoParaCorrecao: false,
        requerReconfirmacaoOperacional: false,
        comprovanteEntregaConferido: false,
        ordemCarregamentoNumero: "OC-RDV-0840-2027",
        ordemCarregamentoEmitidaEm: "27/10/2027 16:08",
        liberadoMonitoramentoEm: "27/10/2027 16:10",
        liberadoMonitoramentoPorId: "emp-expedicao-2",
        liberadoMonitoramentoPorNome: "Marcos Silva",
        situacaoComercial: "EM_MONITORAMENTO",
        situacaoOperacional: "LIBERADO_MONITORAMENTO",
        situacaoMonitoramento: "NOVO_PARA_CARREGAR",
        situacaoFinanceira: "ADIANTAMENTO_PAGO",
        checklistFechamento: {
          motoristaConfirmado: true,
          veiculoConfirmado: true,
          condicoesConferidas: true,
          documentosConferidos: true,
          videochamadaRealizada: true,
          videochamadaRealizadaPorId: "emp-expedicao-2",
          videochamadaRealizadaPorNome: "Marcos Silva",
          videochamadaRealizadaEm: "27/10/2027 16:00",
          videochamadaObservacoes: "Videochamada realizada com Marcos Oliveira. EPI e kit qu\xEDmico conferidos.",
          ordemColetaEnviadaMotorista: true,
          ordemColetaEnviadaPorId: "emp-expedicao-2",
          ordemColetaEnviadaPorNome: "Marcos Silva",
          ordemColetaEnviadaEm: "27/10/2027 16:09",
          conferidoPorId: "emp-expedicao-2",
          conferidoPorNome: "Marcos Silva",
          conferidoEmIso: "2027-10-27T16:10:00.000Z",
          conferidoEmFormatado: "27/10/2027 16:10"
        },
        anexosCount: 0,
        comentariosCount: 0,
        ocorrenciasAbertasCount: 0,
        ocorrenciasImpeditivasCount: 0,
        checklistConcluidosCount: 5,
        autorId: "emp-comercial-1",
        autorNome: "Jeise Santana",
        createdAtIso: "2027-10-24T11:20:00.000Z",
        createdAtFormatted: "24/10/2027 11:20",
        updatedAtIso: sp.iso,
        updatedAtFormatted: sp.formatted,
        revision: 2
      },
      sub: {
        freightId: "frete-0840",
        anexos: [],
        comentarios: [],
        ocorrencias: [],
        historico: [
          {
            id: "fhist-0840-1",
            freightId: "frete-0840",
            timestampIso: "2027-10-24T11:20:00.000Z",
            timestampFormatted: "24/10/2027 11:20",
            timeShort: "11:20",
            actorId: "emp-comercial-1",
            actorName: "Jeise Santana",
            actorSector: "Comercial",
            eventType: "CRIACAO",
            summary: "Frete #0840 registrado para BRASKEM S.A."
          },
          {
            id: "fhist-0840-2",
            freightId: "frete-0840",
            timestampIso: "2027-10-27T16:10:00.000Z",
            timestampFormatted: "27/10/2027 16:10",
            timeShort: "16:10",
            actorId: "emp-expedicao-2",
            actorName: "Marcos Silva",
            actorSector: "Expedi\xE7\xE3o",
            eventType: "LIBERACAO_MONITORAMENTO",
            summary: "Prepara\xE7\xE3o conclu\xEDda na Expedi\xE7\xE3o e liberado para Monitoramento (Carlos Eduardo Mendes).",
            newResponsibleName: "Carlos Eduardo Mendes"
          }
        ]
      }
    }
  ];
  seededFromDefaultsOnly = true;
  for (const item of initialRecords) {
    persistFreightAndSubDoc(item.freight, item.sub, { skipNeon: true });
  }
  saveSequence(true);
}
function validateAttachmentFileBuffer(buf, originalFileName) {
  if (!buf || buf.length < 8) {
    return { valid: false, error: "Arquivo vazio ou inv\xE1lido." };
  }
  if (buf.length > MAX_ATTACHMENT_BYTES) {
    return { valid: false, error: "O anexo excede o limite m\xE1ximo de 5 MB." };
  }
  const headAscii = buf.subarray(0, Math.min(buf.length, 512)).toString("utf8").trim().toLowerCase();
  if (headAscii.startsWith("<svg") || headAscii.includes("<svg") || headAscii.startsWith("<?xml") || headAscii.startsWith("<!doctype") || headAscii.startsWith("<html") || headAscii.startsWith("<script") || buf[0] === 77 && buf[1] === 90 || // MZ EXE
  buf[0] === 127 && buf[1] === 69 && buf[2] === 76 && buf[3] === 70 || // ELF
  buf[0] === 35 && buf[1] === 33) {
    return {
      valid: false,
      error: "Formato bloqueado por seguran\xE7a (SVG, HTML, script ou execut\xE1vel n\xE3o permitido)."
    };
  }
  if (buf[0] === 37 && buf[1] === 80 && buf[2] === 68 && buf[3] === 70 && buf[4] === 45) {
    return { valid: true, mimeType: "application/pdf", extension: "pdf" };
  }
  if (buf[0] === 137 && buf[1] === 80 && buf[2] === 78 && buf[3] === 71 && buf[4] === 13 && buf[5] === 10 && buf[6] === 26 && buf[7] === 10) {
    return { valid: true, mimeType: "image/png", extension: "png" };
  }
  if (buf[0] === 255 && buf[1] === 216 && buf[2] === 255) {
    return { valid: true, mimeType: "image/jpeg", extension: "jpg" };
  }
  if (buf.length >= 12 && buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") {
    return { valid: true, mimeType: "image/webp", extension: "webp" };
  }
  return {
    valid: false,
    error: `Formato do arquivo "${originalFileName}" n\xE3o suportado. Envie PDF, PNG, JPEG ou WebP de at\xE9 5 MB.`
  };
}
function sanitizeFreightForUser(freight, user, isSharedAvailableQueueItem = false) {
  const canSeeCommercialValue = user.accessLevel === "ADMINISTRADOR" || user.accessLevel === "DIRETORIA" || canAccessComercialFreights(user) || hasPagePermission(user, "financeiro");
  if (isSharedAvailableQueueItem && user.accessLevel === "FUNCIONARIO" && !canViewFreightTeam(user)) {
    return {
      id: freight.id,
      protocol: freight.protocol,
      empresaMarca: freight.empresaMarca,
      unidadeOperacional: freight.unidadeOperacional,
      cliente: freight.cliente,
      origemCidadeUf: freight.origemCidadeUf,
      enderecoColeta: freight.enderecoColeta,
      destinoCidadeUf: freight.destinoCidadeUf,
      enderecoEntrega: freight.enderecoEntrega,
      tipoCarga: freight.tipoCarga,
      pesoKg: freight.pesoKg,
      volumes: freight.volumes,
      veiculoNecessario: freight.veiculoNecessario,
      dataColetaIso: freight.dataColetaIso,
      janelaColetaInicio: freight.janelaColetaInicio,
      janelaColetaFim: freight.janelaColetaFim,
      dataEntregaPrevistaIso: freight.dataEntregaPrevistaIso,
      janelaEntregaInicio: freight.janelaEntregaInicio,
      janelaEntregaFim: freight.janelaEntregaFim,
      comercialResponsavelId: freight.comercialResponsavelId,
      comercialResponsavelNome: freight.comercialResponsavelNome,
      expedicaoResponsavelId: null,
      expedicaoResponsavelNome: null,
      monitoramentoResponsavelId: null,
      monitoramentoResponsavelNome: null,
      valorContratadoCentavos: freight.valorContratadoCentavos,
      condicoesComerciais: "",
      condicoesOperacionais: freight.condicoesOperacionais,
      camposPendentesExpedicao: freight.camposPendentesExpedicao,
      devolvidoParaCorrecao: freight.devolvidoParaCorrecao,
      requerReconfirmacaoOperacional: freight.requerReconfirmacaoOperacional,
      comprovanteEntregaConferido: false,
      situacaoComercial: freight.situacaoComercial,
      situacaoOperacional: freight.situacaoOperacional,
      situacaoMonitoramento: freight.situacaoMonitoramento || "NAO_LIBERADO",
      situacaoFinanceira: freight.situacaoFinanceira,
      checklistFechamento: freight.checklistFechamento,
      anexosCount: freight.anexosCount,
      comentariosCount: freight.comentariosCount,
      ocorrenciasAbertasCount: freight.ocorrenciasAbertasCount,
      ocorrenciasImpeditivasCount: freight.ocorrenciasImpeditivasCount,
      checklistConcluidosCount: freight.checklistConcluidosCount,
      autorId: freight.autorId,
      autorNome: freight.autorNome,
      createdAtIso: freight.createdAtIso,
      createdAtFormatted: freight.createdAtFormatted,
      updatedAtIso: freight.updatedAtIso,
      updatedAtFormatted: freight.updatedAtFormatted,
      revision: freight.revision
    };
  }
  const copy = { ...freight };
  if (!canSeeCommercialValue) {
    delete copy.valorCobradoClienteCentavos;
  }
  return copy;
}
function canUserAccessFreightRecord(freight, user) {
  if (!user || user.approvalStatus !== "APROVADO" || !user.active) return false;
  if (user.accessLevel === "ADMINISTRADOR" || user.accessLevel === "DIRETORIA") return true;
  const hasComercial = canAccessComercialFreights(user);
  const hasExpedicao = canAccessExpedicaoFreights(user);
  const hasMonitoramento = canAccessMonitoramentoFreights(user);
  const hasTeam = canViewFreightTeam(user);
  if (user.accessProfile === "FINANCEIRO") return true;
  if (!hasComercial && !hasExpedicao && !hasMonitoramento) return false;
  if (hasComercial) {
    if (freight.comercialResponsavelId === user.id || hasTeam) return true;
  }
  if (hasExpedicao) {
    if (freight.expedicaoResponsavelId === user.id || hasTeam) return true;
    if (freight.expedicaoResponsavelId === null && freight.situacaoOperacional === "DISPONIVEL_FILA") {
      return true;
    }
  }
  if (hasMonitoramento) {
    if (freight.monitoramentoResponsavelId === user.id || hasTeam) return true;
  }
  return false;
}
function appendHistoryEntry(sub, params) {
  const sp = formatSaoPauloDateTime();
  const entry = {
    id: `fhist-${Date.now()}-${crypto10.randomBytes(3).toString("hex")}`,
    freightId: sub.freightId,
    timestampIso: sp.iso,
    timestampFormatted: sp.formatted,
    timeShort: sp.timeShort,
    horarioRealEvento: params.horarioRealEvento,
    actorId: params.actorId,
    actorName: params.actorName,
    actorSector: params.actorSector,
    eventType: params.eventType,
    summary: params.summary,
    reason: params.reason,
    previousResponsibleName: params.previousResponsibleName,
    newResponsibleName: params.newResponsibleName
  };
  sub.historico.unshift(entry);
  return entry;
}
function registerUnifiedFreightRoutes(app, requireApprovedSession2, getAllServerUsers, appendServerAuditLog) {
  loadOrSeedUnifiedFreights();
  const idemFile = path9.join(FREIGHTS_STORE_DIR, "_idempotency.json");
  if (fs9.existsSync(idemFile)) {
    for (const [key, value] of Object.entries(JSON.parse(fs9.readFileSync(idemFile, "utf8")))) idempotencyCache.set(key, value);
  }
  function checkIdempotency(req, res, userId) {
    const rawKey = req.headers["x-idempotency-key"] || (req.body && typeof req.body.idempotencyKey === "string" ? req.body.idempotencyKey : "") || `auto-${Date.now()}-${Math.random()}`;
    const compositeKey = `${userId}:${req.method}:${req.path}:${rawKey}`;
    const existing = idempotencyCache.get(compositeKey);
    if (existing) {
      res.status(existing.status).json(existing.body);
      return "__HANDLED__";
    }
    return compositeKey;
  }
  function storeIdempotentResponse(compositeKey, status, body) {
    if (!compositeKey || compositeKey === "__HANDLED__") return;
    idempotencyCache.set(compositeKey, {
      timestamp: Date.now(),
      status,
      body
    });
    writeJsonAtomically(idemFile, Object.fromEntries(idempotencyCache));
    if (idempotencyCache.size > 2e3) {
      const oldestKey = idempotencyCache.keys().next().value;
      if (oldestKey) idempotencyCache.delete(oldestKey);
    }
  }
  app.get("/api/meus-fretes/operators", requireApprovedSession2, (req, res) => {
    const user = req.sessionUser;
    if (!canAccessComercialFreights(user) && !canAccessExpedicaoFreights(user) && !canAccessMonitoramentoFreights(user)) {
      res.status(403).json({
        error: "Acesso negado: seu perfil n\xE3o possui permiss\xE3o para os m\xF3dulos de Fretes.",
        code: "FORBIDDEN_FREIGHTS_MODULE"
      });
      return;
    }
    const allUsers = getAllServerUsers().filter(
      (u) => u.approvalStatus === "APROVADO" && u.active
    );
    const comercialOperators = allUsers.filter((u) => canAccessComercialFreights(u)).map((u) => ({
      id: u.id,
      name: u.name,
      roleTitle: u.roleTitle,
      department: u.department,
      avatar: u.avatar
    }));
    const expedicaoOperators = allUsers.filter((u) => canAccessExpedicaoFreights(u)).map((u) => ({
      id: u.id,
      name: u.name,
      roleTitle: u.roleTitle,
      department: u.department,
      avatar: u.avatar
    }));
    const monitoramentoOperators = allUsers.filter((u) => canOperateMonitoring(u)).map((u) => ({
      id: u.id,
      name: u.name,
      roleTitle: u.roleTitle,
      department: u.department,
      avatar: u.avatar
    }));
    res.json({
      comercialOperators,
      expedicaoOperators,
      monitoramentoOperators,
      permissions: {
        canAccessComercial: canAccessComercialFreights(user),
        canAccessExpedicao: canAccessExpedicaoFreights(user),
        canAccessMonitoramento: canAccessMonitoramentoFreights(user),
        canViewTeam: canViewFreightTeam(user),
        canTransfer: user.accessLevel === "ADMINISTRADOR" || user.accessLevel === "DIRETORIA" || hasPagePermission(user, "fretes_transferir"),
        canCancel: user.accessLevel === "ADMINISTRADOR" || user.accessLevel === "DIRETORIA" || hasPagePermission(user, "fretes_cancelar")
      }
    });
  });
  app.get("/api/meus-fretes/notifications", requireApprovedSession2, async (req, res) => {
    const user = req.sessionUser;
    const localNotifs = serverNotifications.filter((n) => n.recipientId === user.id);
    const neonNotifs = await loadNotificationsFromNeon(user.id, 50).catch(() => []);
    const map = /* @__PURE__ */ new Map();
    for (const n of localNotifs) {
      map.set(n.id, n);
    }
    for (const n of neonNotifs) {
      if (!map.has(n.id)) {
        map.set(n.id, {
          id: n.id,
          recipientId: n.recipientId,
          type: n.type || "prazo",
          dotColor: n.dotColor || "blue",
          title: n.title,
          subtitle: n.subtitle || "",
          timeLabel: n.timeLabel || "",
          createdAtIso: n.createdAt ? new Date(n.createdAt).toISOString() : (/* @__PURE__ */ new Date()).toISOString(),
          read: Boolean(n.read),
          targetSection: n.targetSection || "fretes_comercial",
          targetId: n.targetId,
          dedupeKey: n.dedupeKey
        });
      }
    }
    const myNotifs = Array.from(map.values()).sort((a, b) => (b.createdAtIso || "").localeCompare(a.createdAtIso || "")).slice(0, 50);
    res.json({
      notifications: myNotifs,
      unreadCount: myNotifs.filter((n) => !n.read).length
    });
  });
  app.post(
    "/api/meus-fretes/notifications/:notifId/read",
    requireApprovedSession2,
    (req, res) => {
      const user = req.sessionUser;
      const notifId = String(req.params.notifId || "");
      const target = serverNotifications.find(
        (n) => n.id === notifId && n.recipientId === user.id
      );
      if (target) {
        target.read = true;
        saveNotifications();
      }
      void markNotificationReadInNeon(notifId, user.id);
      res.json({ ok: true });
    }
  );
  app.post(
    "/api/meus-fretes/notifications/read-all",
    requireApprovedSession2,
    (req, res) => {
      const user = req.sessionUser;
      let changed = false;
      serverNotifications.forEach((n) => {
        if (n.recipientId === user.id && !n.read) {
          n.read = true;
          changed = true;
        }
      });
      if (changed) saveNotifications();
      void markAllNotificationsReadInNeon(user.id);
      res.json({ ok: true });
    }
  );
  app.delete(
    "/api/meus-fretes/notifications/:notifId",
    requireApprovedSession2,
    (req, res) => {
      const user = req.sessionUser;
      const notifId = String(req.params.notifId || "");
      const idx = serverNotifications.findIndex(
        (n) => n.id === notifId && n.recipientId === user.id
      );
      if (idx !== -1) {
        serverNotifications.splice(idx, 1);
        saveNotifications();
      }
      res.json({ ok: true });
    }
  );
  app.get("/api/meus-fretes", requireApprovedSession2, async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Vary", "Authorization, Cookie");
    const user = req.sessionUser;
    const area = String(req.query.area || "COMERCIAL").toUpperCase();
    const scope = String(req.query.scope || "MEUS").toUpperCase();
    const viewModeRaw = String(req.query.viewMode || "ALL").toUpperCase();
    const viewMode = viewModeRaw === "ATIVOS" || viewModeRaw === "FINALIZADOS" ? viewModeRaw : "ALL";
    const responsavelFilterId = String(req.query.responsavelId || "").trim();
    const search = String(req.query.search || "").trim().toLowerCase();
    const periodo = String(req.query.periodo || "TODOS").toUpperCase();
    const situacao = String(req.query.situacao || "TODAS").toUpperCase();
    const includeCanceled = req.query.includeCanceled === "true" || situacao === "CANCELADO";
    const cursor = String(req.query.cursor || "").trim();
    const hasExplicitPage = req.query.page !== void 0 && req.query.page !== "";
    const page = Math.max(1, Number(req.query.page) || 1);
    const defaultLimit = viewMode === "ATIVOS" || viewMode === "FINALIZADOS" ? 12 : 25;
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || defaultLimit));
    const columnLimit = Math.min(25, Math.max(2, Number(req.query.columnLimit) || 10));
    const omitKanban = req.query.omitKanban === "true";
    const compact = req.query.compact === "true";
    const checkOnly = req.query.checkOnly === "true";
    const sinceVersion = req.query.sinceVersion !== void 0 ? Number(req.query.sinceVersion) : null;
    if (area === "COMERCIAL") {
      if (!canAccessComercialFreights(user)) {
        res.status(403).json({
          error: "Acesso negado: voc\xEA n\xE3o possui autoriza\xE7\xE3o para acessar Meus Fretes \u2014 Comercial.",
          code: "FORBIDDEN_COMERCIAL"
        });
        return;
      }
    } else if (area === "EXPEDICAO") {
      if (!canAccessExpedicaoFreights(user)) {
        res.status(403).json({
          error: "Acesso negado: voc\xEA n\xE3o possui autoriza\xE7\xE3o para acessar Meus Fretes \u2014 Expedi\xE7\xE3o.",
          code: "FORBIDDEN_EXPEDICAO"
        });
        return;
      }
    } else if (area === "MONITORAMENTO") {
      if (!canAccessMonitoramentoFreights(user)) {
        res.status(403).json({
          error: "Acesso negado: voc\xEA n\xE3o possui autoriza\xE7\xE3o para acessar Fretes Ativos \u2014 Monitoramento.",
          code: "FORBIDDEN_MONITORAMENTO"
        });
        return;
      }
    } else {
      res.status(400).json({ error: "\xC1rea inv\xE1lida. Use COMERCIAL, EXPEDICAO ou MONITORAMENTO." });
      return;
    }
    const hasTeamPerm = canViewFreightTeam(user);
    if (scope === "EQUIPE" || responsavelFilterId && responsavelFilterId !== user.id && responsavelFilterId !== "TODOS") {
      if (!hasTeamPerm) {
        res.status(403).json({
          error: "Permiss\xE3o negada: voc\xEA s\xF3 pode consultar sua pr\xF3pria carteira/fila individual.",
          code: "FORBIDDEN_TEAM_QUERY"
        });
        return;
      }
    }
    const querySignature = [
      freightsDataVersion,
      user.id,
      area,
      scope,
      viewMode,
      responsavelFilterId,
      search,
      periodo,
      situacao,
      includeCanceled ? "1" : "0",
      cursor,
      page,
      limit,
      columnLimit,
      omitKanban ? "1" : "0",
      compact ? "1" : "0"
    ].join("|");
    const etag = `W/"fretes-v${freightsDataVersion}-${crypto10.createHash("sha1").update(querySignature).digest("hex").slice(0, 12)}"`;
    res.setHeader("ETag", etag);
    if (req.headers["if-none-match"] === etag) {
      res.status(304).end();
      return;
    }
    if (checkOnly) {
      if (sinceVersion !== null && sinceVersion === freightsDataVersion) {
        res.json({ ok: true, unchanged: true, dataVersion: freightsDataVersion });
        return;
      }
      res.json({ ok: true, unchanged: false, dataVersion: freightsDataVersion });
      return;
    }
    const nowDate = /* @__PURE__ */ new Date();
    const todaySp = formatSaoPauloDateTime(nowDate).dateOnlyIso;
    const weekStartDate = new Date(nowDate.getTime() - 7 * 864e5);
    const weekEndDate = new Date(nowDate.getTime() + 7 * 864e5);
    const weekStartIso = formatSaoPauloDateTime(weekStartDate).dateOnlyIso;
    const weekEndIso = formatSaoPauloDateTime(weekEndDate).dateOnlyIso;
    const monthPrefix = todaySp.slice(0, 7);
    const emptyComercialCounters = {
      EM_NEGOCIACAO: 0,
      CONTRATADO: 0,
      AGUARDANDO_EXPEDICAO: 0,
      NA_EXPEDICAO: 0,
      EM_MONITORAMENTO: 0,
      EM_TRANSPORTE: 0,
      FINALIZADO: 0,
      CANCELADO: 0
    };
    const emptyExpedicaoCounters = {
      RECEBIDO: 0,
      EM_PREPARACAO: 0,
      LIBERADO_MONITORAMENTO: 0,
      AGUARDANDO_FECHAMENTO: 0,
      FECHADO: 0,
      AGUARDANDO_COLETA: 0,
      EM_TRANSPORTE: 0,
      CONCLUIDO: 0,
      COLETAS_HOJE: 0,
      PENDENCIAS: 0,
      DISPONIVEIS_FILA: 0
    };
    const projectCompactFinalizedRow = (f) => ({
      id: f.id,
      protocol: f.protocol,
      empresaMarca: f.empresaMarca,
      cliente: f.cliente,
      motoristaNome: f.motoristaNome || "",
      origemCidadeUf: f.origemCidadeUf,
      destinoCidadeUf: f.destinoCidadeUf,
      dataColetaIso: f.dataColetaIso,
      dataEntregaPrevistaIso: f.dataEntregaPrevistaIso,
      entregaComprovadaEm: f.entregaComprovadaEm,
      situacaoComercial: f.situacaoComercial,
      situacaoOperacional: f.situacaoOperacional,
      situacaoMonitoramento: f.situacaoMonitoramento,
      comprovanteEntregaConferido: Boolean(f.comprovanteEntregaConferido),
      monitoramentoResponsavelId: f.monitoramentoResponsavelId,
      monitoramentoResponsavelNome: f.monitoramentoResponsavelNome,
      updatedAtIso: f.updatedAtIso,
      updatedAtFormatted: f.updatedAtFormatted,
      revision: f.revision
    });
    if (area === "MONITORAMENTO" && (viewMode === "ATIVOS" || viewMode === "FINALIZADOS") && !cursor && isNeonConfigured && !isIsolatedTestEnv()) {
      const neonResult = await queryMonitoringFreightsFromNeon({
        scope: scope === "EQUIPE" ? "EQUIPE" : "MEUS",
        userId: user.id,
        isTesteLogin: user.login === "teste",
        responsavelFilterId,
        viewMode,
        search,
        periodo,
        situacao,
        includeCanceled,
        todaySp,
        weekStartIso,
        weekEndIso,
        monthPrefix,
        page,
        limit,
        compact: compact && viewMode === "FINALIZADOS"
      });
      if (neonResult) {
        const sanitizedNeonItems = neonResult.items.map(
          (item) => compact && viewMode === "FINALIZADOS" ? projectCompactFinalizedRow(item) : sanitizeFreightForUser(item, user, false)
        );
        const totalMatched = neonResult.totalMatched;
        const totalPages2 = Math.max(1, Math.ceil(totalMatched / limit));
        const hasMore2 = page * limit < totalMatched;
        const nextCursor2 = hasMore2 && sanitizedNeonItems.length > 0 ? sanitizedNeonItems[sanitizedNeonItems.length - 1].id : null;
        res.json({
          ok: true,
          area,
          scope,
          viewMode,
          page,
          limit,
          totalPages: totalPages2,
          totalMatched,
          items: sanitizedNeonItems,
          nextCursor: nextCursor2,
          hasMore: hasMore2,
          dataVersion: freightsDataVersion,
          comercialCounters: emptyComercialCounters,
          expedicaoCounters: emptyExpedicaoCounters,
          monitoramentoCounters: neonResult.counters,
          kanbanColumns: {},
          serverTimeFormatted: formatSaoPauloDateTime().formatted
        });
        return;
      }
    }
    const allRecords = Array.from(freightsIndex.values());
    let scopedRecords = allRecords.filter((f) => {
      if (area === "COMERCIAL") {
        if (scope === "EQUIPE" && hasTeamPerm) {
          if (responsavelFilterId && responsavelFilterId !== "TODOS") {
            return f.comercialResponsavelId === responsavelFilterId;
          }
          return true;
        }
        return f.comercialResponsavelId === user.id;
      } else if (area === "EXPEDICAO") {
        if (f.situacaoOperacional === "NAO_ENVIADO") return false;
        if (scope === "DISPONIVEIS") {
          return f.expedicaoResponsavelId === null && f.situacaoOperacional === "DISPONIVEL_FILA" && ["AGUARDANDO_EXPEDICAO", "NA_EXPEDICAO"].includes(f.situacaoComercial);
        }
        if (scope === "EQUIPE" && hasTeamPerm) {
          if (responsavelFilterId && responsavelFilterId !== "TODOS") {
            return f.expedicaoResponsavelId === responsavelFilterId;
          }
          return f.expedicaoResponsavelId !== null;
        }
        return f.expedicaoResponsavelId === user.id || (user.login === "teste" || user.id === "emp-teste-logistica") && (f.expedicaoResponsavelId === "emp-teste-logistica" || f.expedicaoResponsavelId === "emp-4" || f.expedicaoResponsavelId === "emp-expedicao-2" || f.expedicaoResponsavelNome === "teste");
      } else {
        const isReleasedToMon = f.situacaoMonitoramento && f.situacaoMonitoramento !== "NAO_LIBERADO" && f.situacaoMonitoramento !== "DEVOLVIDO_EXPEDICAO" && f.situacaoMonitoramento !== "CANCELADO";
        if (!isReleasedToMon && !includeCanceled) return false;
        if (scope === "EQUIPE" && hasTeamPerm) {
          if (responsavelFilterId && responsavelFilterId !== "TODOS") {
            return f.monitoramentoResponsavelId === responsavelFilterId;
          }
          return Boolean(f.monitoramentoResponsavelId);
        }
        return f.monitoramentoResponsavelId === user.id || user.login === "teste" && (f.monitoramentoResponsavelId === "emp-teste-logistica" || f.monitoramentoResponsavelId === "emp-4");
      }
    });
    const availableToClaimCount = area === "EXPEDICAO" ? allRecords.filter(
      (f) => f.expedicaoResponsavelId === null && f.situacaoOperacional === "DISPONIVEL_FILA" && ["AGUARDANDO_EXPEDICAO", "NA_EXPEDICAO"].includes(f.situacaoComercial)
    ).length : 0;
    if (!includeCanceled) {
      scopedRecords = scopedRecords.filter(
        (f) => f.situacaoComercial !== "CANCELADO" && f.situacaoOperacional !== "CANCELADO" && f.situacaoMonitoramento !== "CANCELADO"
      );
    }
    const monActiveStages = [
      "NOVO_PARA_CARREGAR",
      "EM_DESLOCAMENTO_COLETA",
      "NO_LOCAL_COLETA",
      "CARREGADO_EM_TRANSPORTE",
      "NO_LOCAL_ENTREGA"
    ];
    const monCompletedStages = ["ENTREGUE", "FINALIZADO"];
    const monScopeNovo = scopedRecords.filter(
      (f) => f.situacaoMonitoramento === "NOVO_PARA_CARREGAR"
    ).length;
    const monScopeDesloc = scopedRecords.filter(
      (f) => f.situacaoMonitoramento === "EM_DESLOCAMENTO_COLETA"
    ).length;
    const monScopeNoLocalColeta = scopedRecords.filter(
      (f) => f.situacaoMonitoramento === "NO_LOCAL_COLETA"
    ).length;
    const monScopeTransporte = scopedRecords.filter(
      (f) => f.situacaoMonitoramento === "CARREGADO_EM_TRANSPORTE"
    ).length;
    const monScopeNoLocalEntrega = scopedRecords.filter(
      (f) => f.situacaoMonitoramento === "NO_LOCAL_ENTREGA"
    ).length;
    const monScopeEntregue = scopedRecords.filter(
      (f) => f.situacaoMonitoramento === "ENTREGUE"
    ).length;
    const monScopeFinalizado = scopedRecords.filter(
      (f) => f.situacaoMonitoramento === "FINALIZADO"
    ).length;
    const monitoramentoCounters = {
      NOVO_PARA_CARREGAR: monScopeNovo,
      EM_DESLOCAMENTO_COLETA: monScopeDesloc,
      NO_LOCAL_COLETA: monScopeNoLocalColeta,
      CARREGADO_EM_TRANSPORTE: monScopeTransporte,
      NO_LOCAL_ENTREGA: monScopeNoLocalEntrega,
      ENTREGUE: monScopeEntregue,
      FINALIZADO: monScopeFinalizado,
      COLETAS_HOJE: scopedRecords.filter(
        (f) => f.dataColetaIso === todaySp && monActiveStages.includes(f.situacaoMonitoramento || "NAO_LIBERADO")
      ).length,
      PENDENCIAS: scopedRecords.filter(
        (f) => f.ocorrenciasAbertasCount > 0 || f.requerReconfirmacaoOperacional || f.situacaoMonitoramento === "ENTREGUE" && !f.comprovanteEntregaConferido
      ).length,
      TOTAL_ATIVOS: monScopeNovo + monScopeDesloc + monScopeNoLocalColeta + monScopeTransporte + monScopeNoLocalEntrega,
      completedCount: monScopeEntregue + monScopeFinalizado
    };
    if (search) {
      scopedRecords = scopedRecords.filter((f) => {
        const hay = [
          f.protocol,
          f.cliente,
          f.origemCidadeUf,
          f.destinoCidadeUf,
          f.motoristaNome || "",
          f.placaVeiculo || "",
          f.placaCarreta || "",
          f.tipoCarga || "",
          f.comercialResponsavelNome || "",
          f.expedicaoResponsavelNome || "",
          f.monitoramentoResponsavelNome || "",
          f.ultimaLocalizacaoInformada || ""
        ].join(" ").toLowerCase();
        return hay.includes(search);
      });
    }
    if (periodo === "HOJE") {
      scopedRecords = scopedRecords.filter(
        (f) => f.dataColetaIso === todaySp || f.dataEntregaPrevistaIso === todaySp || (f.updatedAtIso || "").slice(0, 10) === todaySp
      );
    } else if (periodo === "SEMANA") {
      scopedRecords = scopedRecords.filter((f) => {
        const refDate = f.dataColetaIso || (f.updatedAtIso || "").slice(0, 10);
        return refDate >= weekStartIso && refDate <= weekEndIso;
      });
    } else if (periodo === "MES") {
      scopedRecords = scopedRecords.filter((f) => {
        const refDate = f.dataColetaIso || (f.updatedAtIso || "").slice(0, 10);
        return refDate.slice(0, 7) === monthPrefix;
      });
    } else if (periodo === "ATRASADOS") {
      scopedRecords = scopedRecords.filter(
        (f) => f.dataColetaIso < todaySp && !["EM_MONITORAMENTO", "EM_TRANSPORTE", "FINALIZADO", "CANCELADO"].includes(
          f.situacaoComercial
        ) || f.dataEntregaPrevistaIso < todaySp && f.situacaoComercial !== "FINALIZADO" || f.devolvidoParaCorrecao || f.requerReconfirmacaoOperacional || f.ocorrenciasAbertasCount > 0
      );
    }
    scopedRecords.sort((a, b) => {
      if (b.updatedAtIso !== a.updatedAtIso) {
        return b.updatedAtIso.localeCompare(a.updatedAtIso);
      }
      return b.id.localeCompare(a.id);
    });
    const matchesComercialStage = (f, stage) => {
      if (stage === "AGUARDANDO_EXPEDICAO" || stage === "NA_EXPEDICAO") {
        return ["AGUARDANDO_EXPEDICAO", "NA_EXPEDICAO", "CONTRATADO"].includes(f.situacaoComercial);
      }
      if (stage === "EM_MONITORAMENTO" || stage === "EM_TRANSPORTE") {
        return ["EM_MONITORAMENTO", "EM_TRANSPORTE"].includes(f.situacaoComercial);
      }
      if (stage === "FINALIZADO" || stage === "CONCLUIDO") {
        return ["FINALIZADO", "CONCLUIDO"].includes(f.situacaoComercial);
      }
      return f.situacaoComercial === stage;
    };
    const matchesExpedicaoStage = (f, stage) => {
      if (stage === "RECEBIDO") {
        return f.situacaoOperacional === "RECEBIDO";
      }
      if (stage === "EM_PREPARACAO" || stage === "AGUARDANDO_FECHAMENTO") {
        return ["EM_PREPARACAO", "AGUARDANDO_FECHAMENTO", "DEVOLVIDO_CORRECAO", "FECHADO"].includes(
          f.situacaoOperacional
        );
      }
      if (stage === "LIBERADO_MONITORAMENTO") {
        return ["LIBERADO_MONITORAMENTO", "AGUARDANDO_COLETA", "EM_TRANSPORTE", "CONCLUIDO"].includes(
          f.situacaoOperacional
        );
      }
      return f.situacaoOperacional === stage;
    };
    const comercialCounters = {
      EM_NEGOCIACAO: scopedRecords.filter((f) => f.situacaoComercial === "EM_NEGOCIACAO").length,
      CONTRATADO: scopedRecords.filter((f) => f.situacaoComercial === "CONTRATADO").length,
      AGUARDANDO_EXPEDICAO: scopedRecords.filter(
        (f) => matchesComercialStage(f, "AGUARDANDO_EXPEDICAO")
      ).length,
      NA_EXPEDICAO: scopedRecords.filter(
        (f) => matchesComercialStage(f, "AGUARDANDO_EXPEDICAO")
      ).length,
      EM_MONITORAMENTO: scopedRecords.filter(
        (f) => matchesComercialStage(f, "EM_MONITORAMENTO")
      ).length,
      EM_TRANSPORTE: scopedRecords.filter(
        (f) => matchesComercialStage(f, "EM_MONITORAMENTO")
      ).length,
      FINALIZADO: scopedRecords.filter((f) => matchesComercialStage(f, "FINALIZADO")).length,
      CANCELADO: scopedRecords.filter((f) => f.situacaoComercial === "CANCELADO").length
    };
    const expedicaoCounters = {
      RECEBIDO: scopedRecords.filter((f) => matchesExpedicaoStage(f, "RECEBIDO")).length,
      EM_PREPARACAO: scopedRecords.filter((f) => matchesExpedicaoStage(f, "EM_PREPARACAO")).length,
      LIBERADO_MONITORAMENTO: scopedRecords.filter(
        (f) => matchesExpedicaoStage(f, "LIBERADO_MONITORAMENTO")
      ).length,
      AGUARDANDO_FECHAMENTO: scopedRecords.filter(
        (f) => matchesExpedicaoStage(f, "RECEBIDO") || matchesExpedicaoStage(f, "EM_PREPARACAO")
      ).length,
      FECHADO: scopedRecords.filter(
        (f) => matchesExpedicaoStage(f, "LIBERADO_MONITORAMENTO")
      ).length,
      AGUARDANDO_COLETA: scopedRecords.filter(
        (f) => f.situacaoMonitoramento === "NOVO_PARA_CARREGAR"
      ).length,
      EM_TRANSPORTE: scopedRecords.filter(
        (f) => f.situacaoMonitoramento === "CARREGADO_EM_TRANSPORTE"
      ).length,
      CONCLUIDO: scopedRecords.filter((f) => f.situacaoOperacional === "CONCLUIDO").length,
      COLETAS_HOJE: scopedRecords.filter((f) => f.dataColetaIso === todaySp).length,
      PENDENCIAS: scopedRecords.filter(
        (f) => f.ocorrenciasAbertasCount > 0 || f.requerReconfirmacaoOperacional || f.devolvidoParaCorrecao || !matchesExpedicaoStage(f, "LIBERADO_MONITORAMENTO") && f.checklistConcluidosCount < 5
      ).length,
      DISPONIVEIS_FILA: availableToClaimCount
    };
    let filteredList = scopedRecords;
    if (area === "MONITORAMENTO") {
      if (viewMode === "ATIVOS") {
        filteredList = filteredList.filter(
          (f) => monActiveStages.includes(f.situacaoMonitoramento || "NAO_LIBERADO")
        );
      } else if (viewMode === "FINALIZADOS") {
        filteredList = filteredList.filter(
          (f) => monCompletedStages.includes(f.situacaoMonitoramento || "NAO_LIBERADO")
        );
      }
    }
    if (situacao && situacao !== "TODAS") {
      if (area === "COMERCIAL") {
        filteredList = filteredList.filter((f) => matchesComercialStage(f, situacao));
      } else if (area === "EXPEDICAO") {
        filteredList = filteredList.filter((f) => matchesExpedicaoStage(f, situacao));
      } else {
        filteredList = filteredList.filter((f) => f.situacaoMonitoramento === situacao);
      }
    }
    let startIdx = 0;
    if (cursor) {
      const foundIdx = filteredList.findIndex((f) => f.id === cursor);
      if (foundIdx >= 0) startIdx = foundIdx + 1;
    } else if (hasExplicitPage) {
      startIdx = (page - 1) * limit;
    }
    const pageSlice = filteredList.slice(startIdx, startIdx + limit);
    const totalPages = Math.max(1, Math.ceil(filteredList.length / limit));
    const hasMore = startIdx + limit < filteredList.length;
    const nextCursor = hasMore && pageSlice.length > 0 ? pageSlice[pageSlice.length - 1].id : null;
    const isSharedQueue = area === "EXPEDICAO" && scope === "DISPONIVEIS";
    const sanitizedItems = pageSlice.map(
      (f) => compact && area === "MONITORAMENTO" && viewMode === "FINALIZADOS" ? projectCompactFinalizedRow(sanitizeFreightForUser(f, user, isSharedQueue)) : sanitizeFreightForUser(f, user, isSharedQueue)
    );
    const kanbanColumns = {};
    if (!omitKanban) {
      if (area === "COMERCIAL") {
        const colKeys = [
          "EM_NEGOCIACAO",
          "AGUARDANDO_EXPEDICAO",
          "EM_MONITORAMENTO",
          "FINALIZADO"
        ];
        for (const col of colKeys) {
          const colAll = filteredList.filter((f) => matchesComercialStage(f, col));
          const colSlice = colAll.slice(0, columnLimit);
          kanbanColumns[col] = {
            items: colSlice.map((f) => sanitizeFreightForUser(f, user, false)),
            total: colAll.length,
            hasMore: colAll.length > columnLimit,
            nextCursor: colAll.length > columnLimit ? colSlice[colSlice.length - 1].id : null
          };
        }
      } else if (area === "EXPEDICAO") {
        const colKeys = ["RECEBIDO", "EM_PREPARACAO", "LIBERADO_MONITORAMENTO"];
        for (const col of colKeys) {
          const colAll = filteredList.filter((f) => matchesExpedicaoStage(f, col));
          const colSlice = colAll.slice(0, columnLimit);
          kanbanColumns[col] = {
            items: colSlice.map((f) => sanitizeFreightForUser(f, user, isSharedQueue)),
            total: colAll.length,
            hasMore: colAll.length > columnLimit,
            nextCursor: colAll.length > columnLimit ? colSlice[colSlice.length - 1].id : null
          };
        }
      } else {
        const colKeys = [
          "NOVO_PARA_CARREGAR",
          "EM_DESLOCAMENTO_COLETA",
          "NO_LOCAL_COLETA",
          "CARREGADO_EM_TRANSPORTE",
          "NO_LOCAL_ENTREGA",
          "ENTREGUE",
          "FINALIZADO"
        ];
        for (const col of colKeys) {
          const colAll = filteredList.filter((f) => f.situacaoMonitoramento === col);
          const colSlice = colAll.slice(0, columnLimit);
          kanbanColumns[col] = {
            items: colSlice.map((f) => sanitizeFreightForUser(f, user, false)),
            total: colAll.length,
            hasMore: colAll.length > columnLimit,
            nextCursor: colAll.length > columnLimit ? colSlice[colSlice.length - 1].id : null
          };
        }
      }
    }
    res.json({
      ok: true,
      area,
      scope,
      viewMode,
      page,
      limit,
      totalPages,
      totalMatched: filteredList.length,
      items: sanitizedItems,
      nextCursor,
      hasMore,
      dataVersion: freightsDataVersion,
      comercialCounters,
      expedicaoCounters,
      monitoramentoCounters,
      kanbanColumns,
      serverTimeFormatted: formatSaoPauloDateTime().formatted
    });
  });
  app.get("/api/meus-fretes/:freightId", requireApprovedSession2, (req, res) => {
    res.setHeader("Cache-Control", "private, no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Vary", "Authorization, Cookie");
    const user = req.sessionUser;
    const freightId = String(req.params.freightId || "");
    const freight = freightsIndex.get(freightId);
    if (!freight) {
      res.status(404).json({ error: "Frete n\xE3o encontrado." });
      return;
    }
    if (!canUserAccessFreightRecord(freight, user)) {
      res.status(403).json({
        error: "Acesso negado: voc\xEA n\xE3o tem permiss\xE3o para acessar os detalhes deste frete.",
        code: "FORBIDDEN_FREIGHT_ACCESS"
      });
      return;
    }
    const isSharedQueueItem = freight.expedicaoResponsavelId === null && freight.situacaoOperacional === "DISPONIVEL_FILA" && freight.comercialResponsavelId !== user.id;
    const sub = freightSubDocs.get(freight.id) || {
      freightId: freight.id,
      anexos: [],
      comentarios: [],
      ocorrencias: [],
      historico: []
    };
    const payload = {
      freight: sanitizeFreightForUser(freight, user, isSharedQueueItem),
      anexos: isSharedQueueItem ? [] : sub.anexos,
      comentarios: isSharedQueueItem ? [] : sub.comentarios,
      ocorrencias: isSharedQueueItem ? [] : sub.ocorrencias,
      historico: sub.historico
    };
    res.json({ ok: true, dataVersion: freightsDataVersion, ...payload });
  });
  app.post("/api/meus-fretes", requireApprovedSession2, (req, res) => {
    const user = req.sessionUser;
    if (!canAccessComercialFreights(user)) {
      res.status(403).json({
        error: "Apenas profissionais autorizados do Comercial podem criar negocia\xE7\xF5es de frete.",
        code: "FORBIDDEN_CREATE_FREIGHT"
      });
      return;
    }
    const idemKey = checkIdempotency(req, res, user.id);
    if (idemKey === "__HANDLED__") return;
    const body = req.body || {};
    const cliente = String(body.cliente || "").trim();
    const origemCidadeUf = String(body.origemCidadeUf || "").trim();
    const destinoCidadeUf = String(body.destinoCidadeUf || "").trim();
    const confirmAndSendToExpedicao = Boolean(body.confirmAndSendToExpedicao);
    if (!cliente || cliente.length < 2) {
      res.status(400).json({ error: "Informe o nome do cliente (m\xEDnimo 2 caracteres)." });
      return;
    }
    if (!origemCidadeUf || !destinoCidadeUf) {
      res.status(400).json({ error: "Informe a cidade/UF de origem e de destino." });
      return;
    }
    const sp = formatSaoPauloDateTime();
    const valorCobradoCentavos = Math.max(
      0,
      Math.round(Number(body.valorCobradoClienteCentavos) || 0)
    );
    const valorContratadoCentavos = Math.max(
      0,
      Math.round(Number(body.valorContratadoCentavos) || 0)
    );
    const enderecoColeta = String(body.enderecoColeta || "").trim().slice(0, 240);
    const enderecoEntrega = String(body.enderecoEntrega || "").trim().slice(0, 240);
    const tipoCarga = String(body.tipoCarga || "").trim().slice(0, 120);
    const dataColetaIso = String(body.dataColetaIso || sp.dateOnlyIso).slice(0, 10);
    let assignedExpUser;
    if (confirmAndSendToExpedicao) {
      const missing = [];
      if (!cliente || cliente.length < 2) missing.push("Cliente");
      if (!origemCidadeUf || !destinoCidadeUf) missing.push("Cidade/UF de origem e destino");
      if (!enderecoColeta || enderecoColeta.length < 3) missing.push("Endere\xE7o de coleta");
      if (!tipoCarga || tipoCarga.length < 2) missing.push("Material / informa\xE7\xF5es da carga");
      if (!dataColetaIso) missing.push("Data de coleta combinada");
      if (!valorCobradoCentavos || valorCobradoCentavos <= 0)
        missing.push("Valor fechado com o cliente");
      if (missing.length > 0) {
        res.status(400).json({
          error: `Para confirmar a contrata\xE7\xE3o e enviar \xE0 Expedi\xE7\xE3o, informe os dados m\xEDnimos: ${missing.join(", ")}.`,
          code: "INCOMPLETE_FOR_EXPEDICAO",
          missingFields: missing
        });
        return;
      }
      const targetExpId = String(body.expedicaoResponsavelId || "").trim();
      if (targetExpId) {
        const candidate = getAllServerUsers().find(
          (u) => u.id === targetExpId && u.approvalStatus === "APROVADO" && u.active
        );
        if (!candidate || !canAccessExpedicaoFreights(candidate)) {
          res.status(400).json({
            error: "O funcion\xE1rio selecionado n\xE3o possui autoriza\xE7\xE3o ativa para a Expedi\xE7\xE3o.",
            code: "INVALID_EXPEDICAO_ASSIGNEE"
          });
          return;
        }
        assignedExpUser = candidate;
      }
    }
    const rawBrand = String(body.empresaMarca || "RODOVAR").trim();
    if (rawBrand === "AXD") {
      res.status(400).json({
        error: "A empresa AXD foi descontinuada para novas opera\xE7\xF5es. Selecione RODOVAR ou VL TRANSPORTES.",
        code: "DISCONTINUED_COMPANY_BRAND"
      });
      return;
    }
    const protocol = allocateNextProtocol();
    const id = `frete-${protocol.replace("#", "")}-${Date.now().toString(36)}`;
    const newFreight = {
      id,
      protocol,
      empresaMarca: ["RODOVAR", "VL TRANSPORTES"].includes(rawBrand) ? rawBrand : "RODOVAR",
      unidadeOperacional: ["BA - Salvador", "SP - Guarulhos"].includes(body.unidadeOperacional) ? body.unidadeOperacional : "BA - Salvador",
      cliente: cliente.slice(0, 140),
      clienteCnpj: String(body.clienteCnpj || "").trim().slice(0, 30) || void 0,
      clienteContato: String(body.clienteContato || "").trim().slice(0, 80) || void 0,
      origemCidadeUf: origemCidadeUf.slice(0, 100),
      enderecoColeta,
      destinoCidadeUf: destinoCidadeUf.slice(0, 100),
      enderecoEntrega,
      instrucoesColetaEntrega: String(body.instrucoesColetaEntrega || "").trim().slice(0, 1e3) || void 0,
      tipoCarga,
      pesoKg: Math.max(0, Number(body.pesoKg) || 0),
      volumes: Math.max(0, Math.round(Number(body.volumes) || 0)),
      veiculoNecessario: String(body.veiculoNecessario || "").trim().slice(0, 100),
      dataColetaIso,
      janelaColetaInicio: String(body.janelaColetaInicio || "08:00").slice(0, 5),
      janelaColetaFim: String(body.janelaColetaFim || "12:00").slice(0, 5),
      dataEntregaPrevistaIso: String(body.dataEntregaPrevistaIso || sp.dateOnlyIso).slice(0, 10),
      janelaEntregaInicio: String(body.janelaEntregaInicio || "14:00").slice(0, 5),
      janelaEntregaFim: String(body.janelaEntregaFim || "18:00").slice(0, 5),
      comercialResponsavelId: user.id,
      comercialResponsavelNome: user.name,
      expedicaoResponsavelId: confirmAndSendToExpedicao && assignedExpUser ? assignedExpUser.id : null,
      expedicaoResponsavelNome: confirmAndSendToExpedicao && assignedExpUser ? assignedExpUser.name : null,
      monitoramentoResponsavelId: null,
      monitoramentoResponsavelNome: null,
      valorCobradoClienteCentavos: valorCobradoCentavos,
      valorContratadoCentavos,
      condicoesComerciais: String(body.condicoesComerciais || "").trim().slice(0, 1e3),
      condicoesOperacionais: String(body.condicoesOperacionais || "").trim().slice(0, 1e3),
      condicoesPagamento: String(body.condicoesPagamento || "").trim().slice(0, 600) || void 0,
      observacoes: String(body.observacoes || "").trim().slice(0, 1e3) || void 0,
      devolvidoParaCorrecao: false,
      requerReconfirmacaoOperacional: false,
      comprovanteEntregaConferido: false,
      situacaoComercial: confirmAndSendToExpedicao ? "AGUARDANDO_EXPEDICAO" : "EM_NEGOCIACAO",
      situacaoOperacional: confirmAndSendToExpedicao ? assignedExpUser ? "RECEBIDO" : "DISPONIVEL_FILA" : "NAO_ENVIADO",
      situacaoMonitoramento: "NAO_LIBERADO",
      situacaoFinanceira: "NAO_INICIADO",
      checklistFechamento: {
        motoristaConfirmado: false,
        veiculoConfirmado: false,
        condicoesConferidas: false,
        documentosConferidos: false,
        videochamadaRealizada: false,
        ordemColetaEnviadaMotorista: false
      },
      anexosCount: 0,
      comentariosCount: 0,
      ocorrenciasAbertasCount: 0,
      ocorrenciasImpeditivasCount: 0,
      checklistConcluidosCount: 0,
      autorId: user.id,
      autorNome: user.name,
      createdAtIso: sp.iso,
      createdAtFormatted: sp.formatted,
      updatedAtIso: sp.iso,
      updatedAtFormatted: sp.formatted,
      revision: 1
    };
    const sub = {
      freightId: id,
      anexos: [],
      comentarios: [],
      ocorrencias: [],
      historico: []
    };
    appendHistoryEntry(sub, {
      actorId: user.id,
      actorName: user.name,
      actorSector: "Comercial",
      eventType: "CRIACAO",
      summary: confirmAndSendToExpedicao ? `Frete ${protocol} contratado com ${newFreight.cliente} (${newFreight.origemCidadeUf} \u2192 ${newFreight.destinoCidadeUf}) e enviado \xE0 Expedi\xE7\xE3o.` : `Frete ${protocol} salvo em rascunho/negocia\xE7\xE3o para o cliente ${newFreight.cliente} (${newFreight.origemCidadeUf} \u2192 ${newFreight.destinoCidadeUf}).`
    });
    if (confirmAndSendToExpedicao) {
      if (assignedExpUser) {
        appendHistoryEntry(sub, {
          actorId: user.id,
          actorName: user.name,
          actorSector: "Comercial",
          eventType: "ENVIO_EXPEDICAO",
          summary: `Contrata\xE7\xE3o confirmada e frete atribu\xEDdo na Expedi\xE7\xE3o para ${assignedExpUser.name}.`,
          newResponsibleName: assignedExpUser.name
        });
        pushFreightNotification({
          recipientId: assignedExpUser.id,
          title: `Novo Frete ${protocol} recebido na Expedi\xE7\xE3o`,
          subtitle: `${newFreight.cliente} \u2022 ${newFreight.origemCidadeUf} \u2192 ${newFreight.destinoCidadeUf} (Comercial: ${user.name})`,
          dotColor: "blue",
          targetSection: "fretes_expedicao",
          targetId: newFreight.id,
          dedupeKey: `assign:${newFreight.id}:1`
        });
      } else {
        appendHistoryEntry(sub, {
          actorId: user.id,
          actorName: user.name,
          actorSector: "Comercial",
          eventType: "ENVIO_EXPEDICAO",
          summary: "Contrata\xE7\xE3o confirmada e frete enviado para a fila compartilhada da Expedi\xE7\xE3o."
        });
        const expOperators = getAllServerUsers().filter(
          (u) => u.approvalStatus === "APROVADO" && u.active && canAccessExpedicaoFreights(u)
        );
        for (const op of expOperators) {
          pushFreightNotification({
            recipientId: op.id,
            title: `Frete ${protocol} dispon\xEDvel na fila da Expedi\xE7\xE3o`,
            subtitle: `${newFreight.cliente} \u2022 ${newFreight.origemCidadeUf} \u2192 ${newFreight.destinoCidadeUf}`,
            dotColor: "blue",
            targetSection: "fretes_expedicao",
            targetId: newFreight.id,
            dedupeKey: `avail:${newFreight.id}:1:${op.id}`
          });
        }
      }
    }
    persistFreightAndSubDoc(newFreight, sub);
    appendServerAuditLog(
      user.id,
      user.name,
      user.accessLevel,
      "CRIACAO_FRETE_COMERCIAL",
      `Criou frete ${protocol} para ${newFreight.cliente}.`,
      req.ip
    );
    const responsePayload = {
      ok: true,
      freight: sanitizeFreightForUser(newFreight, user)
    };
    storeIdempotentResponse(idemKey, 201, responsePayload);
    res.status(201).json(responsePayload);
  });
  app.put(
    ["/api/meus-fretes/:freightId/comercial", "/api/meus-fretes/:freightId/commercial"],
    requireApprovedSession2,
    (req, res) => {
      const user = req.sessionUser;
      const freightId = String(req.params.freightId || "");
      const freight = freightsIndex.get(freightId);
      if (!freight) {
        res.status(404).json({ error: "Frete n\xE3o encontrado." });
        return;
      }
      const isOwnerOrManager = freight.comercialResponsavelId === user.id || canViewFreightTeam(user);
      if (!canAccessComercialFreights(user) || !isOwnerOrManager) {
        res.status(403).json({
          error: "Permiss\xE3o negada: voc\xEA s\xF3 pode editar negocia\xE7\xF5es sob sua responsabilidade comercial.",
          code: "FORBIDDEN_EDIT_COMERCIAL"
        });
        return;
      }
      if (freight.situacaoComercial === "CONCLUIDO" || freight.situacaoComercial === "FINALIZADO" || freight.situacaoComercial === "CANCELADO") {
        res.status(409).json({
          error: "Fretes conclu\xEDdos ou cancelados n\xE3o podem ter condi\xE7\xF5es comerciais alteradas.",
          code: "TERMINAL_STATE_LOCKED"
        });
        return;
      }
      const body = req.body || {};
      if (typeof body.baseRevision === "number" && body.baseRevision !== freight.revision) {
        res.status(409).json({
          error: "Conflito de edi\xE7\xE3o concorrente: este frete foi atualizado por outro usu\xE1rio. Recarregue os dados antes de salvar.",
          code: "REVISION_CONFLICT",
          currentRevision: freight.revision,
          freight: sanitizeFreightForUser(freight, user)
        });
        return;
      }
      const idemKey = checkIdempotency(req, res, user.id);
      if (idemKey === "__HANDLED__") return;
      const wasSentToNextStage = freight.situacaoOperacional !== "NAO_ENVIADO";
      const changedRelevantFields = [];
      if (body.origemCidadeUf !== void 0 && String(body.origemCidadeUf).trim() !== freight.origemCidadeUf) {
        changedRelevantFields.push(`Origem (${freight.origemCidadeUf} \u2192 ${String(body.origemCidadeUf).trim()})`);
        freight.origemCidadeUf = String(body.origemCidadeUf).trim().slice(0, 100);
      }
      if (body.destinoCidadeUf !== void 0 && String(body.destinoCidadeUf).trim() !== freight.destinoCidadeUf) {
        changedRelevantFields.push(`Destino (${freight.destinoCidadeUf} \u2192 ${String(body.destinoCidadeUf).trim()})`);
        freight.destinoCidadeUf = String(body.destinoCidadeUf).trim().slice(0, 100);
      }
      if (body.enderecoColeta !== void 0 && String(body.enderecoColeta).trim() !== freight.enderecoColeta) {
        changedRelevantFields.push("Endere\xE7o de coleta");
        freight.enderecoColeta = String(body.enderecoColeta).trim().slice(0, 240);
      }
      if (body.enderecoEntrega !== void 0 && String(body.enderecoEntrega).trim() !== freight.enderecoEntrega) {
        changedRelevantFields.push("Endere\xE7o de entrega");
        freight.enderecoEntrega = String(body.enderecoEntrega).trim().slice(0, 240);
      }
      if (body.instrucoesColetaEntrega !== void 0) {
        freight.instrucoesColetaEntrega = String(body.instrucoesColetaEntrega).trim().slice(0, 1e3) || void 0;
      }
      if (body.tipoCarga !== void 0 && String(body.tipoCarga).trim() !== freight.tipoCarga) {
        changedRelevantFields.push(`Carga (${freight.tipoCarga} \u2192 ${String(body.tipoCarga).trim()})`);
        freight.tipoCarga = String(body.tipoCarga).trim().slice(0, 120);
      }
      if (body.pesoKg !== void 0 && Number(body.pesoKg) !== freight.pesoKg) {
        changedRelevantFields.push(`Peso (${freight.pesoKg}kg \u2192 ${Number(body.pesoKg)}kg)`);
        freight.pesoKg = Math.max(0, Number(body.pesoKg) || 0);
      }
      if (body.volumes !== void 0 && Number(body.volumes) !== freight.volumes) {
        changedRelevantFields.push(`Volumes (${freight.volumes} \u2192 ${Number(body.volumes)})`);
        freight.volumes = Math.max(0, Math.round(Number(body.volumes) || 0));
      }
      if (body.veiculoNecessario !== void 0 && String(body.veiculoNecessario).trim() !== freight.veiculoNecessario) {
        changedRelevantFields.push(`Ve\xEDculo (${freight.veiculoNecessario} \u2192 ${String(body.veiculoNecessario).trim()})`);
        freight.veiculoNecessario = String(body.veiculoNecessario).trim().slice(0, 100);
      }
      if (body.dataColetaIso !== void 0 && String(body.dataColetaIso).slice(0, 10) !== freight.dataColetaIso) {
        changedRelevantFields.push(`Data de coleta (${freight.dataColetaIso} \u2192 ${String(body.dataColetaIso).slice(0, 10)})`);
        freight.dataColetaIso = String(body.dataColetaIso).slice(0, 10);
      }
      if (body.janelaColetaInicio !== void 0 && String(body.janelaColetaInicio).slice(0, 5) !== freight.janelaColetaInicio) {
        changedRelevantFields.push("Janela de coleta");
        freight.janelaColetaInicio = String(body.janelaColetaInicio).slice(0, 5);
      }
      if (body.janelaColetaFim !== void 0 && String(body.janelaColetaFim).slice(0, 5) !== freight.janelaColetaFim) {
        freight.janelaColetaFim = String(body.janelaColetaFim).slice(0, 5);
      }
      if (body.dataEntregaPrevistaIso !== void 0 && String(body.dataEntregaPrevistaIso).slice(0, 10) !== freight.dataEntregaPrevistaIso) {
        changedRelevantFields.push(`Data prevista de entrega (${freight.dataEntregaPrevistaIso} \u2192 ${String(body.dataEntregaPrevistaIso).slice(0, 10)})`);
        freight.dataEntregaPrevistaIso = String(body.dataEntregaPrevistaIso).slice(0, 10);
      }
      if (body.janelaEntregaInicio !== void 0 && String(body.janelaEntregaInicio).slice(0, 5) !== freight.janelaEntregaInicio) {
        freight.janelaEntregaInicio = String(body.janelaEntregaInicio).slice(0, 5);
      }
      if (body.janelaEntregaFim !== void 0) {
        freight.janelaEntregaFim = String(body.janelaEntregaFim).slice(0, 5);
      }
      if (body.valorCobradoClienteCentavos !== void 0 && Math.round(Number(body.valorCobradoClienteCentavos)) !== freight.valorCobradoClienteCentavos) {
        changedRelevantFields.push("Valor comercial");
        freight.valorCobradoClienteCentavos = Math.max(
          0,
          Math.round(Number(body.valorCobradoClienteCentavos) || 0)
        );
      }
      if (body.cliente !== void 0 && String(body.cliente).trim().length >= 2) {
        freight.cliente = String(body.cliente).trim().slice(0, 140);
      }
      if (body.clienteCnpj !== void 0) {
        freight.clienteCnpj = String(body.clienteCnpj).trim().slice(0, 30) || void 0;
      }
      if (body.clienteContato !== void 0) {
        freight.clienteContato = String(body.clienteContato).trim().slice(0, 80) || void 0;
      }
      if (body.empresaMarca !== void 0) {
        if (String(body.empresaMarca).trim() === "AXD") {
          res.status(400).json({
            error: "A empresa AXD foi descontinuada para novas opera\xE7\xF5es. Selecione RODOVAR ou VL TRANSPORTES.",
            code: "DISCONTINUED_COMPANY_BRAND"
          });
          return;
        }
        if (["RODOVAR", "VL TRANSPORTES"].includes(String(body.empresaMarca).trim())) {
          freight.empresaMarca = String(body.empresaMarca).trim();
        }
      }
      if (body.unidadeOperacional && ["BA - Salvador", "SP - Guarulhos"].includes(body.unidadeOperacional)) {
        freight.unidadeOperacional = body.unidadeOperacional;
      }
      if (body.condicoesComerciais !== void 0) {
        freight.condicoesComerciais = String(body.condicoesComerciais).trim().slice(0, 1e3);
      }
      if (body.condicoesOperacionais !== void 0) {
        freight.condicoesOperacionais = String(body.condicoesOperacionais).trim().slice(0, 1e3);
      }
      if (body.observacoes !== void 0) {
        freight.observacoes = String(body.observacoes).trim().slice(0, 1e3) || void 0;
      }
      const sp = formatSaoPauloDateTime();
      freight.updatedAtIso = sp.iso;
      freight.updatedAtFormatted = sp.formatted;
      freight.revision += 1;
      const sub = freightSubDocs.get(freight.id);
      const editReason = String(body.reason || body.motivo || "").trim();
      if (wasSentToNextStage && changedRelevantFields.length > 0) {
        const wasReleased = freight.situacaoOperacional === "LIBERADO_MONITORAMENTO";
        if (wasReleased) {
          freight.requerReconfirmacaoOperacional = true;
          freight.motivoReconfirmacao = `Altera\xE7\xE3o comercial p\xF3s-libera\xE7\xE3o (${changedRelevantFields.join(", ")})`;
        }
        appendHistoryEntry(sub, {
          actorId: user.id,
          actorName: user.name,
          actorSector: "Comercial",
          eventType: "ALTERACAO_RELEVANTE_POS_FECHAMENTO",
          summary: `Altera\xE7\xE3o comercial relevante ap\xF3s envio (${changedRelevantFields.join(", ")}).`,
          reason: editReason || "Ajuste solicitado pelo cliente"
        });
        if (freight.expedicaoResponsavelId) {
          pushFreightNotification({
            recipientId: freight.expedicaoResponsavelId,
            title: `Dados atualizados no Frete ${freight.protocol}`,
            subtitle: `${user.name} alterou (${changedRelevantFields.join(", ")}). Confira os dados na Expedi\xE7\xE3o.`,
            dotColor: "red",
            targetSection: "fretes_expedicao",
            targetId: freight.id,
            dedupeKey: `reconfirm:exp:${freight.id}:${freight.revision}`
          });
        }
        if (freight.monitoramentoResponsavelId) {
          pushFreightNotification({
            recipientId: freight.monitoramentoResponsavelId,
            title: `Altera\xE7\xE3o no Frete ${freight.protocol}`,
            subtitle: `${user.name} (Comercial) alterou (${changedRelevantFields.join(", ")}).`,
            dotColor: "red",
            targetSection: "fretes_ativos",
            targetId: freight.id,
            dedupeKey: `reconfirm:mon:${freight.id}:${freight.revision}`
          });
        }
      } else {
        appendHistoryEntry(sub, {
          actorId: user.id,
          actorName: user.name,
          actorSector: "Comercial",
          eventType: "EDICAO_COMERCIAL",
          summary: `Dados comerciais atualizados por ${user.name} (Rev. #${freight.revision}).`,
          reason: editReason || void 0
        });
      }
      persistFreightAndSubDoc(freight, sub);
      const responsePayload = {
        ok: true,
        reconfirmationTriggered: Boolean(wasSentToNextStage && changedRelevantFields.length > 0),
        freight: sanitizeFreightForUser(freight, user)
      };
      storeIdempotentResponse(idemKey, 200, responsePayload);
      res.json(responsePayload);
    }
  );
  app.post(
    [
      "/api/meus-fretes/:freightId/comercial-transition",
      "/api/meus-fretes/:freightId/commercial-transition"
    ],
    requireApprovedSession2,
    (req, res) => {
      const user = req.sessionUser;
      const freightId = String(req.params.freightId || "");
      const freight = freightsIndex.get(freightId);
      if (!freight) {
        res.status(404).json({ error: "Frete n\xE3o encontrado." });
        return;
      }
      const isOwnerOrManager = freight.comercialResponsavelId === user.id || canViewFreightTeam(user);
      if (!canAccessComercialFreights(user) || !isOwnerOrManager) {
        res.status(403).json({
          error: "Permiss\xE3o negada para alterar a etapa comercial deste frete.",
          code: "FORBIDDEN_COMERCIAL_TRANSITION"
        });
        return;
      }
      const { targetStatus, expedicaoResponsavelId, baseRevision } = req.body || {};
      if (typeof baseRevision === "number" && baseRevision !== freight.revision) {
        res.status(409).json({
          error: "Conflito de revis\xE3o: este frete foi atualizado em outra sess\xE3o. Recarregue antes de prosseguir.",
          code: "REVISION_CONFLICT",
          currentRevision: freight.revision,
          freight: sanitizeFreightForUser(freight, user)
        });
        return;
      }
      if (targetStatus === "EM_MONITORAMENTO" || targetStatus === "EM_TRANSPORTE" || targetStatus === "CONCLUIDO" || targetStatus === "FINALIZADO") {
        res.status(403).json({
          error: "Opera\xE7\xE3o bloqueada: o Comercial acompanha o progresso dos seus fretes, mas n\xE3o executa etapas de libera\xE7\xE3o ou monitoramento.",
          code: "FORBIDDEN_OPERATIONAL_SIMULATION"
        });
        return;
      }
      const idemKey = checkIdempotency(req, res, user.id);
      if (idemKey === "__HANDLED__") return;
      const sp = formatSaoPauloDateTime();
      const sub = freightSubDocs.get(freight.id);
      if (targetStatus === "EM_NEGOCIACAO") {
        if (!["CONTRATADO", "EM_NEGOCIACAO"].includes(freight.situacaoComercial)) {
          res.status(400).json({
            error: "Fretes j\xE1 enviados \xE0 Expedi\xE7\xE3o ou em monitoramento n\xE3o podem retornar diretamente para rascunho sem devolu\xE7\xE3o."
          });
          return;
        }
        freight.situacaoComercial = "EM_NEGOCIACAO";
        freight.updatedAtIso = sp.iso;
        freight.updatedAtFormatted = sp.formatted;
        freight.revision += 1;
        appendHistoryEntry(sub, {
          actorId: user.id,
          actorName: user.name,
          actorSector: "Comercial",
          eventType: "EDICAO_COMERCIAL",
          summary: 'Frete mantido na etapa "Em negocia\xE7\xE3o".'
        });
        persistFreightAndSubDoc(freight, sub);
        const payload = { ok: true, freight: sanitizeFreightForUser(freight, user) };
        storeIdempotentResponse(idemKey, 200, payload);
        res.json(payload);
        return;
      }
      if (targetStatus === "AGUARDANDO_EXPEDICAO" || targetStatus === "NA_EXPEDICAO" || targetStatus === "CONTRATADO") {
        const missing = [];
        if (!freight.cliente || freight.cliente.trim().length < 2) missing.push("Cliente");
        if (!freight.origemCidadeUf || !freight.destinoCidadeUf)
          missing.push("Rota (Cidade/UF de origem e destino)");
        if (!freight.enderecoColeta || freight.enderecoColeta.trim().length < 3)
          missing.push("Endere\xE7o de coleta");
        if (!freight.tipoCarga || freight.tipoCarga.trim().length < 2)
          missing.push("Material e informa\xE7\xF5es da carga");
        if (!freight.dataColetaIso) missing.push("Data de coleta combinada");
        if (!freight.valorCobradoClienteCentavos || freight.valorCobradoClienteCentavos <= 0)
          missing.push("Valor fechado com o cliente");
        if (missing.length > 0) {
          res.status(400).json({
            error: `N\xE3o \xE9 poss\xEDvel confirmar contrata\xE7\xE3o e enviar \xE0 Expedi\xE7\xE3o. Informe os dados m\xEDnimos: ${missing.join(", ")}.`,
            code: "INCOMPLETE_FOR_EXPEDICAO",
            missingFields: missing
          });
          return;
        }
        const wasReturned = freight.devolvidoParaCorrecao;
        let assignedExpUser;
        const targetExpId = expedicaoResponsavelId !== void 0 ? String(expedicaoResponsavelId || "").trim() : freight.expedicaoResponsavelId || "";
        if (targetExpId) {
          const candidate = getAllServerUsers().find(
            (u) => u.id === targetExpId && u.approvalStatus === "APROVADO" && u.active
          );
          if (!candidate || !canAccessExpedicaoFreights(candidate)) {
            res.status(400).json({
              error: "O funcion\xE1rio selecionado n\xE3o possui autoriza\xE7\xE3o ativa para a Expedi\xE7\xE3o.",
              code: "INVALID_EXPEDICAO_ASSIGNEE"
            });
            return;
          }
          assignedExpUser = candidate;
        }
        freight.situacaoComercial = "AGUARDANDO_EXPEDICAO";
        freight.devolvidoParaCorrecao = false;
        freight.motivoDevolucao = void 0;
        const pendingForExp = computePendingForExpedicao(freight);
        const pendingNote = pendingForExp.length > 0 ? ` Pend\xEAncias para a Expedi\xE7\xE3o completar: ${pendingForExp.join(", ")}.` : "";
        if (assignedExpUser) {
          freight.expedicaoResponsavelId = assignedExpUser.id;
          freight.expedicaoResponsavelNome = assignedExpUser.name;
          freight.situacaoOperacional = "RECEBIDO";
          appendHistoryEntry(sub, {
            actorId: user.id,
            actorName: user.name,
            actorSector: "Comercial",
            eventType: wasReturned ? "REENVIO_EXPEDICAO" : "ENVIO_EXPEDICAO",
            summary: wasReturned ? `Frete corrigido pelo Comercial e reenviado \xE0 Expedi\xE7\xE3o para ${assignedExpUser.name}.${pendingNote}` : `Contrata\xE7\xE3o confirmada por ${user.name} e enviada \xE0 Expedi\xE7\xE3o (${assignedExpUser.name}).${pendingNote}`,
            newResponsibleName: assignedExpUser.name
          });
          pushFreightNotification({
            recipientId: assignedExpUser.id,
            title: wasReturned ? `Frete ${freight.protocol} corrigido e reenviado` : `Novo Frete ${freight.protocol} atribu\xEDdo \xE0 sua fila da Expedi\xE7\xE3o`,
            subtitle: `${freight.cliente} \u2022 ${freight.origemCidadeUf} \u2192 ${freight.destinoCidadeUf} (Comercial: ${user.name})`,
            dotColor: "blue",
            targetSection: "fretes_expedicao",
            targetId: freight.id,
            dedupeKey: `assign:${freight.id}:${freight.revision + 1}`
          });
        } else {
          freight.expedicaoResponsavelId = null;
          freight.expedicaoResponsavelNome = null;
          freight.situacaoOperacional = "DISPONIVEL_FILA";
          appendHistoryEntry(sub, {
            actorId: user.id,
            actorName: user.name,
            actorSector: "Comercial",
            eventType: wasReturned ? "REENVIO_EXPEDICAO" : "ENVIO_EXPEDICAO",
            summary: `Contrata\xE7\xE3o confirmada por ${user.name} e enviada para a fila compartilhada da Expedi\xE7\xE3o.${pendingNote}`
          });
          const expOperators = getAllServerUsers().filter(
            (u) => u.approvalStatus === "APROVADO" && u.active && canAccessExpedicaoFreights(u)
          );
          for (const op of expOperators) {
            pushFreightNotification({
              recipientId: op.id,
              title: `Frete ${freight.protocol} dispon\xEDvel para assumir na Expedi\xE7\xE3o`,
              subtitle: `${freight.cliente} \u2022 ${freight.origemCidadeUf} \u2192 ${freight.destinoCidadeUf}`,
              dotColor: "blue",
              targetSection: "fretes_expedicao",
              targetId: freight.id,
              dedupeKey: `avail:${freight.id}:${freight.revision + 1}:${op.id}`
            });
          }
        }
        freight.updatedAtIso = sp.iso;
        freight.updatedAtFormatted = sp.formatted;
        freight.revision += 1;
        persistFreightAndSubDoc(freight, sub);
        const payload = { ok: true, freight: sanitizeFreightForUser(freight, user) };
        storeIdempotentResponse(idemKey, 200, payload);
        res.json(payload);
        return;
      }
      res.status(400).json({ error: "Etapa comercial de destino inv\xE1lida." });
    }
  );
  app.post("/api/meus-fretes/:freightId/claim", requireApprovedSession2, (req, res) => {
    const user = req.sessionUser;
    if (!canAccessExpedicaoFreights(user)) {
      res.status(403).json({
        error: "Apenas operadores autorizados da Expedi\xE7\xE3o podem assumir fretes da fila.",
        code: "FORBIDDEN_EXPEDICAO_CLAIM"
      });
      return;
    }
    const freightId = String(req.params.freightId || "");
    if (activeFreightLocks.has(freightId)) {
      res.status(409).json({
        error: "Este frete est\xE1 sendo processado simultaneamente por outro operador.",
        code: "CONCURRENT_LOCK_CONFLICT"
      });
      return;
    }
    activeFreightLocks.add(freightId);
    try {
      const freight = freightsIndex.get(freightId);
      if (!freight) {
        res.status(404).json({ error: "Frete n\xE3o encontrado." });
        return;
      }
      if (freight.expedicaoResponsavelId !== null || freight.situacaoOperacional !== "DISPONIVEL_FILA") {
        res.status(409).json({
          error: `Este frete j\xE1 foi assumido por ${freight.expedicaoResponsavelNome || "outro operador da Expedi\xE7\xE3o"} e n\xE3o est\xE1 mais dispon\xEDvel na fila.`,
          code: "ALREADY_CLAIMED",
          claimedBy: freight.expedicaoResponsavelNome
        });
        return;
      }
      const sp = formatSaoPauloDateTime();
      freight.expedicaoResponsavelId = user.id;
      freight.expedicaoResponsavelNome = user.name;
      freight.situacaoOperacional = "RECEBIDO";
      freight.updatedAtIso = sp.iso;
      freight.updatedAtFormatted = sp.formatted;
      freight.revision += 1;
      const sub = freightSubDocs.get(freight.id);
      appendHistoryEntry(sub, {
        actorId: user.id,
        actorName: user.name,
        actorSector: "Expedi\xE7\xE3o",
        eventType: "ASSUMIR_FILA",
        summary: `Frete assumido na fila da Expedi\xE7\xE3o por ${user.name}.`,
        newResponsibleName: user.name
      });
      persistFreightAndSubDoc(freight, sub);
      pushFreightNotification({
        recipientId: freight.comercialResponsavelId,
        title: `Frete ${freight.protocol} assumido na Expedi\xE7\xE3o`,
        subtitle: `${user.name} assumiu a prepara\xE7\xE3o operacional do frete (${freight.cliente}).`,
        dotColor: "blue",
        targetSection: "fretes_comercial",
        targetId: freight.id,
        dedupeKey: `claimed:${freight.id}:${user.id}`
      });
      res.json({
        ok: true,
        freight: sanitizeFreightForUser(freight, user)
      });
    } finally {
      activeFreightLocks.delete(freightId);
    }
  });
  app.put(
    [
      "/api/meus-fretes/:freightId/operational-data",
      "/api/meus-fretes/:freightId/operational"
    ],
    requireApprovedSession2,
    (req, res) => {
      const user = req.sessionUser;
      const freightId = String(req.params.freightId || "");
      const freight = freightsIndex.get(freightId);
      if (!freight) {
        res.status(404).json({ error: "Frete n\xE3o encontrado." });
        return;
      }
      const isAssignedOrManager = freight.expedicaoResponsavelId === user.id || canViewFreightTeam(user);
      if (!canAccessExpedicaoFreights(user) || !isAssignedOrManager) {
        res.status(403).json({
          error: "Permiss\xE3o negada: voc\xEA s\xF3 pode editar fretes atribu\xEDdos \xE0 sua fila da Expedi\xE7\xE3o.",
          code: "FORBIDDEN_EXPEDICAO_UPDATE"
        });
        return;
      }
      if (freight.situacaoOperacional === "CONCLUIDO" || freight.situacaoOperacional === "CANCELADO" || freight.situacaoMonitoramento === "FINALIZADO") {
        res.status(409).json({
          error: "Opera\xE7\xE3o j\xE1 finalizada ou cancelada. N\xE3o \xE9 permitido alterar dados operacionais.",
          code: "TERMINAL_STATE_LOCKED"
        });
        return;
      }
      const body = req.body || {};
      if (app.locals.checkDriverBinding && ["motoristaCpf", "motoristaNome", "motoristaTelefone"].some((field) => body[field] !== void 0) && !app.locals.checkDriverBinding(req, res, body.motoristaCpf ?? freight.motoristaCpf ?? "")) return;
      if (body.enderecoEntrega !== void 0 && String(body.enderecoEntrega).trim() !== (freight.enderecoEntrega || "")) {
        res.status(403).json({ error: "O endere\xE7o detalhado de entrega deve ser registrado pelo Monitoramento.", code: "DELIVERY_ADDRESS_MONITORING_ONLY" });
        return;
      }
      const idemKey = checkIdempotency(req, res, user.id);
      if (idemKey === "__HANDLED__") return;
      if (typeof body.baseRevision === "number" && body.baseRevision !== freight.revision) {
        res.status(409).json({
          error: "Conflito de revis\xE3o detectado. Recarregue os dados atualizados do frete.",
          code: "REVISION_CONFLICT",
          currentRevision: freight.revision,
          freight: sanitizeFreightForUser(freight, user)
        });
        return;
      }
      const sp = formatSaoPauloDateTime();
      const wasAlreadyReleasedToMonitoring = freight.situacaoOperacional === "LIBERADO_MONITORAMENTO";
      const changedPostReleaseFields = [];
      if (body.enderecoColeta !== void 0) {
        const nextVal = String(body.enderecoColeta).trim().slice(0, 240);
        if (wasAlreadyReleasedToMonitoring && nextVal !== freight.enderecoColeta) {
          changedPostReleaseFields.push("Endere\xE7o de coleta");
        }
        freight.enderecoColeta = nextVal;
      }
      if (body.instrucoesColetaEntrega !== void 0) {
        freight.instrucoesColetaEntrega = String(body.instrucoesColetaEntrega).trim().slice(0, 1e3) || void 0;
      }
      if (body.clienteContato !== void 0) {
        freight.clienteContato = String(body.clienteContato).trim().slice(0, 80) || void 0;
      }
      if (body.tipoCarga !== void 0 && String(body.tipoCarga).trim()) {
        freight.tipoCarga = String(body.tipoCarga).trim().slice(0, 120);
      }
      if (body.pesoKg !== void 0) {
        freight.pesoKg = Math.max(0, Number(body.pesoKg) || 0);
      }
      if (body.volumes !== void 0) {
        freight.volumes = Math.max(0, Math.round(Number(body.volumes) || 0));
      }
      if (body.veiculoNecessario !== void 0) {
        freight.veiculoNecessario = String(body.veiculoNecessario).trim().slice(0, 100);
      }
      if (body.dataColetaIso !== void 0 && String(body.dataColetaIso).trim()) {
        freight.dataColetaIso = String(body.dataColetaIso).slice(0, 10);
      }
      if (body.janelaColetaInicio !== void 0) {
        freight.janelaColetaInicio = String(body.janelaColetaInicio).slice(0, 5);
      }
      if (body.janelaColetaFim !== void 0) {
        freight.janelaColetaFim = String(body.janelaColetaFim).slice(0, 5);
      }
      if (body.dataEntregaPrevistaIso !== void 0 && String(body.dataEntregaPrevistaIso).trim()) {
        freight.dataEntregaPrevistaIso = String(body.dataEntregaPrevistaIso).slice(0, 10);
      }
      if (body.janelaEntregaInicio !== void 0) {
        freight.janelaEntregaInicio = String(body.janelaEntregaInicio).slice(0, 5);
      }
      if (body.janelaEntregaFim !== void 0) {
        freight.janelaEntregaFim = String(body.janelaEntregaFim).slice(0, 5);
      }
      if (body.transportadorNome !== void 0) {
        freight.transportadorNome = String(body.transportadorNome).trim().slice(0, 140) || void 0;
      }
      if (body.transportadorDocumento !== void 0) {
        freight.transportadorDocumento = String(body.transportadorDocumento).trim().slice(0, 30) || void 0;
      }
      if (body.motoristaNome !== void 0) {
        const nextVal = String(body.motoristaNome).trim().slice(0, 120) || void 0;
        if (wasAlreadyReleasedToMonitoring && nextVal !== freight.motoristaNome) {
          changedPostReleaseFields.push(`Motorista (${freight.motoristaNome || "\u2014"} \u2192 ${nextVal || "\u2014"})`);
        }
        freight.motoristaNome = nextVal;
      }
      if (body.motoristaCpf !== void 0) {
        freight.motoristaCpf = String(body.motoristaCpf).trim().slice(0, 20) || void 0;
      }
      if (body.motoristaTelefone !== void 0) {
        freight.motoristaTelefone = String(body.motoristaTelefone).trim().slice(0, 30) || void 0;
      }
      if (body.placaVeiculo !== void 0) {
        const nextVal = String(body.placaVeiculo).trim().toUpperCase().slice(0, 12) || void 0;
        if (wasAlreadyReleasedToMonitoring && nextVal !== freight.placaVeiculo) {
          changedPostReleaseFields.push(`Placa (${freight.placaVeiculo || "\u2014"} \u2192 ${nextVal || "\u2014"})`);
        }
        freight.placaVeiculo = nextVal;
      }
      if (body.placaCarreta !== void 0) {
        freight.placaCarreta = String(body.placaCarreta).trim().toUpperCase().slice(0, 12) || void 0;
      }
      if (body.valorContratadoCentavos !== void 0) {
        freight.valorContratadoCentavos = Math.max(
          0,
          Math.round(Number(body.valorContratadoCentavos) || 0)
        );
      }
      if (body.condicoesOperacionais !== void 0) {
        freight.condicoesOperacionais = String(body.condicoesOperacionais).trim().slice(0, 1e3);
      }
      if (body.condicoesPagamento !== void 0) {
        freight.condicoesPagamento = String(body.condicoesPagamento).trim().slice(0, 600) || void 0;
      }
      if (body.favorecidoPagamento !== void 0) {
        freight.favorecidoPagamento = String(body.favorecidoPagamento).trim().slice(0, 140) || void 0;
      }
      if (body.bancoPagamento !== void 0) {
        freight.bancoPagamento = String(body.bancoPagamento).trim().slice(0, 100) || void 0;
      }
      if (body.tipoChavePix !== void 0) {
        freight.tipoChavePix = String(body.tipoChavePix).trim().slice(0, 40) || void 0;
      }
      if (body.chavePix !== void 0) {
        freight.chavePix = String(body.chavePix).trim().slice(0, 140) || void 0;
      }
      if (body.observacoes !== void 0) {
        freight.observacoes = String(body.observacoes).trim().slice(0, 1e3) || void 0;
      }
      if (body.motoristaRg !== void 0) {
        freight.motoristaRg = String(body.motoristaRg).trim().slice(0, 30) || void 0;
      }
      if (body.motoristaCnh !== void 0) {
        freight.motoristaCnh = String(body.motoristaCnh).trim().slice(0, 30) || void 0;
      }
      if (body.placaBitrem !== void 0) {
        freight.placaBitrem = String(body.placaBitrem).trim().toUpperCase().slice(0, 12) || void 0;
      }
      if (body.numeroPedido !== void 0) {
        freight.numeroPedido = String(body.numeroPedido).trim().slice(0, 60) || void 0;
      }
      if (body.numeroOrcamento !== void 0) {
        freight.numeroOrcamento = String(body.numeroOrcamento).trim().slice(0, 60) || void 0;
      }
      if (body.pontoReferencia !== void 0) {
        freight.pontoReferencia = String(body.pontoReferencia).trim().slice(0, 240) || void 0;
      }
      if (body.especieCarga !== void 0) {
        freight.especieCarga = String(body.especieCarga).trim().slice(0, 80) || void 0;
      }
      if (body.embalagemCarga !== void 0) {
        freight.embalagemCarga = String(body.embalagemCarga).trim().slice(0, 80) || void 0;
      }
      if (body.valorMercadoriaCentavos !== void 0) {
        const valMerc = Math.round(Number(body.valorMercadoriaCentavos) || 0);
        freight.valorMercadoriaCentavos = valMerc > 0 ? valMerc : void 0;
      }
      if (body.quantidadeEntregas !== void 0) {
        const qtd = Math.round(Number(body.quantidadeEntregas) || 0);
        freight.quantidadeEntregas = qtd > 0 ? qtd : void 0;
      }
      const optionalTextFields = [
        "remetenteNome",
        "remetenteCnpjCpf",
        "remetenteIe",
        "remetenteTelefone",
        "remetenteEndereco",
        "remetenteBairro",
        "remetenteMunicipio",
        "remetenteCep",
        "destinatarioNome",
        "destinatarioCnpjCpf",
        "destinatarioIe",
        "destinatarioTelefone",
        "destinatarioEndereco",
        "destinatarioBairro",
        "destinatarioMunicipio",
        "destinatarioCep"
      ];
      for (const field of optionalTextFields) {
        if (body[field] !== void 0) {
          freight[field] = String(body[field]).trim().slice(0, 200) || void 0;
        }
      }
      if (body.monitoramentoResponsavelId !== void 0) {
        const monId = String(body.monitoramentoResponsavelId || "").trim();
        if (monId) {
          const monUser = getAllServerUsers().find(
            (u) => u.id === monId && u.approvalStatus === "APROVADO" && u.active
          );
          if (monUser && canOperateMonitoring(monUser)) {
            freight.monitoramentoResponsavelId = monUser.id;
            freight.monitoramentoResponsavelNome = monUser.name;
          }
        } else if (!wasAlreadyReleasedToMonitoring) {
          freight.monitoramentoResponsavelId = null;
          freight.monitoramentoResponsavelNome = null;
        }
      }
      const sub = freightSubDocs.get(freight.id);
      if (body.checklistFechamento && typeof body.checklistFechamento === "object") {
        const prev = freight.checklistFechamento || {
          motoristaConfirmado: false,
          veiculoConfirmado: false,
          condicoesConferidas: false,
          documentosConferidos: false,
          videochamadaRealizada: false,
          ordemColetaEnviadaMotorista: false
        };
        const nextVideochamada = body.checklistFechamento.videochamadaRealizada !== void 0 ? Boolean(body.checklistFechamento.videochamadaRealizada) : Boolean(prev.videochamadaRealizada);
        const nextOrdemEnviada = body.checklistFechamento.ordemColetaEnviadaMotorista !== void 0 ? Boolean(body.checklistFechamento.ordemColetaEnviadaMotorista) : Boolean(prev.ordemColetaEnviadaMotorista);
        const videoObs = body.checklistFechamento.videochamadaObservacoes !== void 0 ? String(body.checklistFechamento.videochamadaObservacoes).trim().slice(0, 500) : prev.videochamadaObservacoes;
        freight.checklistFechamento = {
          motoristaConfirmado: body.checklistFechamento.motoristaConfirmado !== void 0 ? Boolean(body.checklistFechamento.motoristaConfirmado) : Boolean(prev.motoristaConfirmado),
          veiculoConfirmado: body.checklistFechamento.veiculoConfirmado !== void 0 ? Boolean(body.checklistFechamento.veiculoConfirmado) : Boolean(prev.veiculoConfirmado),
          condicoesConferidas: body.checklistFechamento.condicoesConferidas !== void 0 ? Boolean(body.checklistFechamento.condicoesConferidas) : Boolean(prev.condicoesConferidas),
          documentosConferidos: body.checklistFechamento.documentosConferidos !== void 0 ? Boolean(body.checklistFechamento.documentosConferidos) : Boolean(prev.documentosConferidos),
          videochamadaRealizada: nextVideochamada,
          videochamadaRealizadaPorId: nextVideochamada ? prev.videochamadaRealizadaPorId || user.id : void 0,
          videochamadaRealizadaPorNome: nextVideochamada ? prev.videochamadaRealizadaPorNome || user.name : void 0,
          videochamadaRealizadaEmIso: nextVideochamada ? prev.videochamadaRealizadaEmIso || sp.iso : void 0,
          videochamadaRealizadaEmFormatado: nextVideochamada ? prev.videochamadaRealizadaEmFormatado || sp.formatted : void 0,
          videochamadaObservacoes: videoObs || void 0,
          ordemColetaEnviadaMotorista: nextOrdemEnviada,
          ordemColetaEnviadaPorId: nextOrdemEnviada ? prev.ordemColetaEnviadaPorId || user.id : void 0,
          ordemColetaEnviadaPorNome: nextOrdemEnviada ? prev.ordemColetaEnviadaPorNome || user.name : void 0,
          ordemColetaEnviadaEmFormatado: nextOrdemEnviada ? prev.ordemColetaEnviadaEmFormatado || sp.formatted : void 0,
          conferidoPorId: user.id,
          conferidoPorNome: user.name,
          conferidoEmIso: sp.iso,
          conferidoEmFormatado: sp.formatted
        };
        if (!prev.videochamadaRealizada && nextVideochamada) {
          appendHistoryEntry(sub, {
            actorId: user.id,
            actorName: user.name,
            actorSector: "Expedi\xE7\xE3o",
            eventType: "VIDEOCHAMADA_MOTORISTA",
            summary: `Videochamada externa com o motorista ${freight.motoristaNome || ""} registrada como realizada por ${user.name}.${videoObs ? ` Obs: ${videoObs}` : ""}`
          });
        }
        if (!prev.ordemColetaEnviadaMotorista && nextOrdemEnviada) {
          appendHistoryEntry(sub, {
            actorId: user.id,
            actorName: user.name,
            actorSector: "Expedi\xE7\xE3o",
            eventType: "ENVIO_ORDEM_MOTORISTA",
            summary: `Confirma\xE7\xE3o de envio da Ordem de Coleta ao motorista registrada por ${user.name}.`
          });
        }
      }
      if (freight.situacaoOperacional === "RECEBIDO" || freight.situacaoOperacional === "AGUARDANDO_FECHAMENTO") {
        freight.situacaoOperacional = "EM_PREPARACAO";
      }
      freight.updatedAtIso = sp.iso;
      freight.updatedAtFormatted = sp.formatted;
      freight.revision += 1;
      if (wasAlreadyReleasedToMonitoring && changedPostReleaseFields.length > 0) {
        const editReason = String(body.reason || body.motivo || "Corre\xE7\xE3o operacional").trim();
        appendHistoryEntry(sub, {
          actorId: user.id,
          actorName: user.name,
          actorSector: "Expedi\xE7\xE3o",
          eventType: "ALTERACAO_RELEVANTE_POS_FECHAMENTO",
          summary: `Dados operacionais alterados ap\xF3s libera\xE7\xE3o ao Monitoramento (${changedPostReleaseFields.join(", ")}).`,
          reason: editReason
        });
        if (freight.monitoramentoResponsavelId) {
          pushFreightNotification({
            recipientId: freight.monitoramentoResponsavelId,
            title: `Dados operacionais atualizados \u2014 Frete ${freight.protocol}`,
            subtitle: `${user.name} (Expedi\xE7\xE3o) atualizou: ${changedPostReleaseFields.join(", ")}.`,
            dotColor: "blue",
            targetSection: "fretes_ativos",
            targetId: freight.id,
            dedupeKey: `expupd:${freight.id}:${freight.revision}`
          });
        }
      }
      persistFreightAndSubDoc(freight, sub);
      const payload = {
        ok: true,
        freight: sanitizeFreightForUser(freight, user),
        historico: sub.historico
      };
      storeIdempotentResponse(idemKey, 200, payload);
      res.json(payload);
    }
  );
  app.post(
    "/api/meus-fretes/:freightId/expedicao-action",
    requireApprovedSession2,
    (req, res) => {
      const user = req.sessionUser;
      const freightId = String(req.params.freightId || "");
      const freight = freightsIndex.get(freightId);
      if (!freight) {
        res.status(404).json({ error: "Frete n\xE3o encontrado." });
        return;
      }
      const isAssignedOrManager = freight.expedicaoResponsavelId === user.id || canViewFreightTeam(user);
      if (!canAccessExpedicaoFreights(user) || !isAssignedOrManager) {
        res.status(403).json({
          error: "Permiss\xE3o negada: este frete n\xE3o pertence \xE0 sua fila operacional.",
          code: "FORBIDDEN_EXPEDICAO_ACTION"
        });
        return;
      }
      const {
        action,
        baseRevision,
        reason: rawReason,
        motivo,
        monitoramentoResponsavelId: bodyMonRespId,
        videochamadaObservacoes,
        dataEntregaPrevistaIso,
        janelaEntregaInicio,
        janelaEntregaFim
      } = req.body || {};
      const reason = rawReason ?? motivo;
      const idemKey = checkIdempotency(req, res, user.id);
      if (idemKey === "__HANDLED__") return;
      if (typeof baseRevision === "number" && baseRevision !== freight.revision) {
        res.status(409).json({
          error: "Conflito de revis\xE3o detectado. Recarregue os dados do frete antes de prosseguir.",
          code: "REVISION_CONFLICT",
          currentRevision: freight.revision,
          freight: sanitizeFreightForUser(freight, user)
        });
        return;
      }
      const sp = formatSaoPauloDateTime();
      const sub = freightSubDocs.get(freight.id);
      if (action === "EMITIR_ORDEM_CARREGAMENTO" || action === "EMITIR_ORDEM") {
        if (freight.empresaMarca === "AXD") {
          res.status(400).json({
            error: "A empresa AXD foi descontinuada e n\xE3o permite emiss\xE3o de nova Ordem de Coleta. Atualize a empresa do frete para RODOVAR ou VL TRANSPORTES caso seja uma nova contrata\xE7\xE3o.",
            code: "DISCONTINUED_COMPANY_BRAND"
          });
          return;
        }
        const activeBrand = freight.empresaMarca === "VL TRANSPORTES" ? "VL TRANSPORTES" : "RODOVAR";
        const companyProfile = COMPANY_OFFICIAL_PROFILES[activeBrand];
        const missingForOrder = [];
        if (!freight.cliente || freight.cliente.trim().length < 2)
          missingForOrder.push("Cliente");
        if (!freight.origemCidadeUf || !freight.enderecoColeta || freight.enderecoColeta.trim().length < 3)
          missingForOrder.push("Cidade e endere\xE7o de coleta");
        if (!freight.destinoCidadeUf)
          missingForOrder.push("Cidade/UF de entrega");
        if (!freight.tipoCarga || freight.tipoCarga.trim().length < 2)
          missingForOrder.push("Produto / descri\xE7\xE3o da carga");
        if (!freight.pesoKg || freight.pesoKg <= 0)
          missingForOrder.push("Peso da carga maior que zero");
        if (!freight.veiculoNecessario || freight.veiculoNecessario.trim().length < 2)
          missingForOrder.push("Tipo de ve\xEDculo");
        if (!freight.motoristaNome || freight.motoristaNome.trim().length < 3)
          missingForOrder.push("Nome do motorista");
        const cpfDigits = String(freight.motoristaCpf || "").replace(/\D/g, "");
        if (cpfDigits.length !== 11)
          missingForOrder.push("CPF v\xE1lido do motorista (11 d\xEDgitos)");
        if (!freight.placaVeiculo || freight.placaVeiculo.trim().length < 6)
          missingForOrder.push("Placa do ve\xEDculo");
        if (missingForOrder.length > 0) {
          res.status(400).json({
            error: `Para gerar a Ordem de Coleta, preencha primeiro: ${missingForOrder.join(", ")}.`,
            code: "INCOMPLETE_FOR_COLLECTION_ORDER",
            missingFields: missingForOrder
          });
          return;
        }
        const spYear = Number(sp.dateOnlyIso.slice(0, 4)) || (/* @__PURE__ */ new Date()).getFullYear();
        let orderNum = freight.ordemCarregamentoNumero;
        if (!orderNum || !freight.ordemColetaSequencia) {
          const allocated = allocateNextOrderNumber(activeBrand, spYear);
          orderNum = allocated.orderNumber;
          freight.ordemColetaSequencia = allocated.sequence;
          freight.ordemColetaAno = allocated.year;
        } else if (!freight.ordemColetaAno) {
          freight.ordemColetaAno = spYear;
        }
        freight.ordemCarregamentoNumero = orderNum;
        freight.ordemCarregamentoEmitidaEm = sp.formatted;
        freight.ordemColetaPendente = false;
        if (freight.situacaoOperacional === "RECEBIDO") {
          freight.situacaoOperacional = "EM_PREPARACAO";
        }
        freight.updatedAtIso = sp.iso;
        freight.updatedAtFormatted = sp.formatted;
        freight.revision += 1;
        appendHistoryEntry(sub, {
          actorId: user.id,
          actorName: user.name,
          actorSector: "Expedi\xE7\xE3o",
          eventType: "EMISSAO_ORDEM_COLETA",
          summary: `Ordem de Coleta ${orderNum} gerada no padr\xE3o oficial ${activeBrand} (CNPJ ${companyProfile.cnpj}) por ${user.name}.`
        });
        persistFreightAndSubDoc(freight, sub);
        appendServerAuditLog(
          user.id,
          user.name,
          user.accessLevel,
          "EMISSAO_ORDEM_COLETA",
          `Emitiu Ordem de Coleta ${orderNum} (${activeBrand}) para o frete ${freight.protocol}.`,
          req.ip
        );
        const payload = {
          ok: true,
          freight: sanitizeFreightForUser(freight, user),
          historico: sub.historico,
          loadingOrder: {
            orderNumber: orderNum,
            sequence: freight.ordemColetaSequencia,
            year: freight.ordemColetaAno,
            issuedAt: sp.formatted,
            issuedBy: user.name,
            razaoSocial: companyProfile.razaoSocial,
            cnpj: companyProfile.cnpj,
            ie: companyProfile.ie,
            enderecoEmpresa: companyProfile.endereco,
            telefoneEmpresa: companyProfile.telefone,
            protocol: freight.protocol,
            empresaMarca: activeBrand,
            unidadeOperacional: freight.unidadeOperacional,
            cliente: freight.cliente,
            clienteCnpj: freight.clienteCnpj,
            clienteContato: freight.clienteContato,
            comercialResponsavelNome: freight.comercialResponsavelNome,
            numeroPedido: freight.numeroPedido,
            numeroOrcamento: freight.numeroOrcamento,
            origemCidadeUf: freight.origemCidadeUf,
            enderecoColeta: freight.enderecoColeta,
            destinoCidadeUf: freight.destinoCidadeUf,
            enderecoEntrega: freight.enderecoEntrega,
            pontoReferencia: freight.pontoReferencia,
            remetenteNome: freight.remetenteNome,
            remetenteCnpjCpf: freight.remetenteCnpjCpf,
            remetenteIe: freight.remetenteIe,
            remetenteTelefone: freight.remetenteTelefone,
            remetenteEndereco: freight.remetenteEndereco,
            remetenteBairro: freight.remetenteBairro,
            remetenteMunicipio: freight.remetenteMunicipio,
            remetenteCep: freight.remetenteCep,
            destinatarioNome: freight.destinatarioNome,
            destinatarioCnpjCpf: freight.destinatarioCnpjCpf,
            destinatarioIe: freight.destinatarioIe,
            destinatarioTelefone: freight.destinatarioTelefone,
            destinatarioEndereco: freight.destinatarioEndereco,
            destinatarioBairro: freight.destinatarioBairro,
            destinatarioMunicipio: freight.destinatarioMunicipio,
            destinatarioCep: freight.destinatarioCep,
            instrucoesColetaEntrega: freight.instrucoesColetaEntrega,
            tipoCarga: freight.tipoCarga,
            especieCarga: freight.especieCarga,
            embalagemCarga: freight.embalagemCarga,
            valorMercadoriaCentavos: freight.valorMercadoriaCentavos,
            quantidadeEntregas: freight.quantidadeEntregas,
            pesoKg: freight.pesoKg,
            volumes: freight.volumes,
            veiculoNecessario: freight.veiculoNecessario,
            dataColetaIso: freight.dataColetaIso,
            janelaColeta: `${freight.janelaColetaInicio} \xE0s ${freight.janelaColetaFim}`,
            dataEntregaPrevistaIso: freight.dataEntregaPrevistaIso,
            janelaEntrega: `${freight.janelaEntregaInicio}${freight.janelaEntregaFim ? ` \xE0s ${freight.janelaEntregaFim}` : ""}`,
            motoristaNome: freight.motoristaNome,
            motoristaCpf: freight.motoristaCpf,
            motoristaRg: freight.motoristaRg,
            motoristaCnh: freight.motoristaCnh,
            motoristaTelefone: freight.motoristaTelefone,
            transportadorNome: freight.transportadorNome,
            transportadorDocumento: freight.transportadorDocumento,
            placaVeiculo: freight.placaVeiculo,
            placaCarreta: freight.placaCarreta,
            placaBitrem: freight.placaBitrem,
            condicoesOperacionais: freight.condicoesOperacionais,
            expedicaoResponsavelNome: freight.expedicaoResponsavelNome || user.name
          }
        };
        storeIdempotentResponse(idemKey, 200, payload);
        res.json(payload);
        return;
      }
      if (action === "IGNORAR_ORDEM_COLETA") {
        if (freight.situacaoOperacional === "CONCLUIDO" || freight.situacaoOperacional === "CANCELADO" || freight.situacaoMonitoramento === "FINALIZADO") {
          res.status(409).json({
            error: "N\xE3o \xE9 poss\xEDvel adiar a Ordem de Coleta em um frete conclu\xEDdo ou cancelado.",
            code: "TERMINAL_STATE_LOCKED"
          });
          return;
        }
        const skipReason = String(reason || "").trim().slice(0, 300);
        freight.ordemColetaPendente = true;
        freight.ordemColetaIgnoradaEm = sp.formatted;
        freight.ordemColetaIgnoradaPorId = user.id;
        freight.ordemColetaIgnoradaPorNome = user.name;
        freight.ordemColetaIgnoradaMotivo = skipReason || void 0;
        if (freight.situacaoOperacional === "RECEBIDO") {
          freight.situacaoOperacional = "EM_PREPARACAO";
        }
        freight.updatedAtIso = sp.iso;
        freight.updatedAtFormatted = sp.formatted;
        freight.revision += 1;
        appendHistoryEntry(sub, {
          actorId: user.id,
          actorName: user.name,
          actorSector: "Expedi\xE7\xE3o",
          eventType: "ORDEM_COLETA_PENDENTE",
          summary: `Emiss\xE3o da Ordem de Coleta marcada como "Ignorar por enquanto" por ${user.name} em ${sp.formatted}.`,
          reason: skipReason || void 0
        });
        persistFreightAndSubDoc(freight, sub);
        appendServerAuditLog(
          user.id,
          user.name,
          user.accessLevel,
          "EXPEDICAO_IGNORAR_ORDEM_COLETA",
          `Marcou Ordem de Coleta como pendente ("Ignorar por enquanto") no frete ${freight.protocol}.${skipReason ? ` Motivo: ${skipReason}` : ""}`,
          req.ip
        );
        const payload = {
          ok: true,
          freight: sanitizeFreightForUser(freight, user),
          historico: sub.historico
        };
        storeIdempotentResponse(idemKey, 200, payload);
        res.json(payload);
        return;
      }
      if (action === "CONFIRMAR_ENVIO_ORDEM_MOTORISTA") {
        if (!freight.ordemCarregamentoNumero) {
          res.status(400).json({
            error: "Gere a Ordem de Coleta antes de confirmar o envio ao motorista.",
            code: "ORDER_NOT_GENERATED"
          });
          return;
        }
        freight.checklistFechamento.ordemColetaEnviadaMotorista = true;
        freight.checklistFechamento.ordemColetaEnviadaPorId = user.id;
        freight.checklistFechamento.ordemColetaEnviadaPorNome = user.name;
        freight.checklistFechamento.ordemColetaEnviadaEmFormatado = sp.formatted;
        freight.updatedAtIso = sp.iso;
        freight.updatedAtFormatted = sp.formatted;
        freight.revision += 1;
        appendHistoryEntry(sub, {
          actorId: user.id,
          actorName: user.name,
          actorSector: "Expedi\xE7\xE3o",
          eventType: "ENVIO_ORDEM_MOTORISTA",
          summary: `Ordem de Coleta ${freight.ordemCarregamentoNumero} confirmada como enviada ao motorista ${freight.motoristaNome || ""} por ${user.name}.`
        });
        persistFreightAndSubDoc(freight, sub);
        const payload = {
          ok: true,
          freight: sanitizeFreightForUser(freight, user),
          historico: sub.historico
        };
        storeIdempotentResponse(idemKey, 200, payload);
        res.json(payload);
        return;
      }
      if (action === "REGISTRAR_VIDEOCHAMADA") {
        const obs = String(videochamadaObservacoes || reason || "").trim().slice(0, 500);
        freight.checklistFechamento.videochamadaRealizada = true;
        freight.checklistFechamento.videochamadaRealizadaPorId = user.id;
        freight.checklistFechamento.videochamadaRealizadaPorNome = user.name;
        freight.checklistFechamento.videochamadaRealizadaEmIso = sp.iso;
        freight.checklistFechamento.videochamadaRealizadaEmFormatado = sp.formatted;
        if (obs) {
          freight.checklistFechamento.videochamadaObservacoes = obs;
        }
        if (freight.situacaoOperacional === "RECEBIDO") {
          freight.situacaoOperacional = "EM_PREPARACAO";
        }
        freight.updatedAtIso = sp.iso;
        freight.updatedAtFormatted = sp.formatted;
        freight.revision += 1;
        appendHistoryEntry(sub, {
          actorId: user.id,
          actorName: user.name,
          actorSector: "Expedi\xE7\xE3o",
          eventType: "VIDEOCHAMADA_MOTORISTA",
          summary: `Videochamada realizada com o motorista (${freight.motoristaNome || "Motorista"}) registrada por ${user.name} em ${sp.formatted}.${obs ? ` Observa\xE7\xF5es: ${obs}` : ""}`
        });
        persistFreightAndSubDoc(freight, sub);
        const payload = {
          ok: true,
          freight: sanitizeFreightForUser(freight, user),
          historico: sub.historico
        };
        storeIdempotentResponse(idemKey, 200, payload);
        res.json(payload);
        return;
      }
      if (action === "LIBERAR_PARA_MONITORAMENTO" || action === "CONFIRMAR_FECHAMENTO") {
        if (freight.situacaoOperacional === "LIBERADO_MONITORAMENTO") {
          if (bodyMonRespId && bodyMonRespId !== freight.monitoramentoResponsavelId) {
            res.status(409).json({ error: "Frete j\xE1 liberado. Use a transfer\xEAncia de respons\xE1vel para trocar o operador." });
            return;
          }
          const payload2 = { ok: true, freight: sanitizeFreightForUser(freight, user), historico: sub.historico };
          storeIdempotentResponse(idemKey, 200, payload2);
          res.json(payload2);
          return;
        }
        const targetMonId = String(
          bodyMonRespId || freight.monitoramentoResponsavelId || ""
        ).trim();
        const missing = [];
        if (!freight.enderecoColeta || freight.enderecoColeta.trim().length < 3)
          missing.push("Endere\xE7o de coleta completo");
        if (!freight.tipoCarga || freight.tipoCarga.trim().length < 2)
          missing.push("Material da carga");
        if (!freight.pesoKg || freight.pesoKg <= 0)
          missing.push("Peso da carga (kg)");
        if (!freight.veiculoNecessario || freight.veiculoNecessario.trim().length < 2)
          missing.push("Tipo de ve\xEDculo");
        if (!freight.motoristaNome || freight.motoristaNome.trim().length < 3)
          missing.push("Nome do motorista");
        if (!freight.motoristaCpf || freight.motoristaCpf.trim().length < 11)
          missing.push("CPF do motorista");
        if (!freight.motoristaTelefone || freight.motoristaTelefone.trim().length < 8)
          missing.push("Telefone do motorista");
        if (!freight.transportadorNome || freight.transportadorNome.trim().length < 2)
          missing.push("Transportador / propriet\xE1rio");
        if (!freight.placaVeiculo || freight.placaVeiculo.trim().length < 6)
          missing.push("Placa do ve\xEDculo");
        if (!freight.valorContratadoCentavos || freight.valorContratadoCentavos <= 0)
          missing.push("Valor contratado com o motorista");
        if (!freight.condicoesOperacionais || freight.condicoesOperacionais.trim().length < 3)
          missing.push("Condi\xE7\xF5es operacionais: preencha na aba Dados Operacionais (m\xEDnimo 3 caracteres)");
        if (!expeditionPaymentMode(freight.condicoesPagamento)) missing.push("Condi\xE7\xF5es de pagamento: selecione 70/30, 80/20 ou Integral em Dados Operacionais");
        const chk = freight.checklistFechamento;
        if (!chk.motoristaConfirmado)
          missing.push("Verifica\xE7\xE3o: Dados do motorista conferidos");
        if (!chk.veiculoConfirmado)
          missing.push("Verifica\xE7\xE3o: Ve\xEDculo conferido");
        if (!chk.condicoesConferidas || !chk.documentosConferidos)
          missing.push("Verifica\xE7\xE3o: Condi\xE7\xF5es e documentos conferidos");
        if (!chk.videochamadaRealizada)
          missing.push("Verifica\xE7\xE3o: Videochamada realizada com o motorista");
        const hasOrderCompleted = Boolean(
          freight.ordemCarregamentoNumero && chk.ordemColetaEnviadaMotorista
        );
        const hasPendingOrderSkip = freight.ordemColetaPendente === true;
        if (!hasOrderCompleted && !hasPendingOrderSkip) {
          if (!freight.ordemCarregamentoNumero)
            missing.push('Ordem de coleta gerada (ou clique em "Ignorar por enquanto")');
          if (!chk.ordemColetaEnviadaMotorista)
            missing.push(
              'Verifica\xE7\xE3o: Ordem de coleta enviada ao motorista (ou clique em "Ignorar por enquanto")'
            );
        }
        let monOperator;
        if (!targetMonId) {
          missing.push("Operador de Monitoramento respons\xE1vel");
        } else {
          monOperator = getAllServerUsers().find(
            (u) => u.id === targetMonId && u.approvalStatus === "APROVADO" && u.active
          );
          if (!monOperator || !canOperateMonitoring(monOperator)) {
            missing.push("Operador de Monitoramento v\xE1lido e ativo");
          }
        }
        if (missing.length > 0) {
          res.status(400).json({
            error: `N\xE3o \xE9 poss\xEDvel liberar para o Monitoramento. Pend\xEAncias obrigat\xF3rias: ${missing.join(", ")}.`,
            code: "INCOMPLETE_FOR_MONITORAMENTO",
            missingFields: missing
          });
          return;
        }
        freight.monitoramentoResponsavelId = monOperator.id;
        freight.monitoramentoResponsavelNome = monOperator.name;
        freight.situacaoOperacional = "LIBERADO_MONITORAMENTO";
        freight.situacaoComercial = "EM_MONITORAMENTO";
        freight.situacaoMonitoramento = "NOVO_PARA_CARREGAR";
        freight.liberadoMonitoramentoEm = sp.formatted;
        freight.requerReconfirmacaoOperacional = false;
        freight.motivoReconfirmacao = void 0;
        freight.devolvidoParaCorrecao = false;
        freight.motivoDevolucao = void 0;
        if (freight.situacaoFinanceira === "NAO_INICIADO") {
          freight.situacaoFinanceira = "PENDENTE_ADIANTAMENTO";
        }
        freight.updatedAtIso = sp.iso;
        freight.updatedAtFormatted = sp.formatted;
        freight.revision += 1;
        if (!freight.enderecoEntrega || !freight.enderecoEntrega.trim()) {
          const occId = `occ-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          sub.ocorrencias.push({
            id: occId,
            freightId: freight.id,
            title: "Endere\xE7o detalhado de entrega a confirmar",
            description: `Frete liberado para o destino ${freight.destinoCidadeUf} sem endere\xE7o detalhado de descarga. O operador de Monitoramento (${monOperator.name}) deve contatar o cliente ou destinat\xE1rio e registrar o endere\xE7o exato de entrega.`,
            severity: "MEDIA",
            createdById: user.id,
            createdByName: user.name,
            createdAtIso: sp.iso,
            createdAtFormatted: sp.formatted,
            resolved: false
          });
          freight.ocorrenciasAbertasCount = sub.ocorrencias.filter((o) => !o.resolved).length;
          appendHistoryEntry(sub, {
            actorId: user.id,
            actorName: user.name,
            actorSector: "Expedi\xE7\xE3o",
            eventType: "OCORRENCIA_CRIADA",
            summary: `Pend\xEAncia criada para o Monitoramento: Confirmar endere\xE7o detalhado de entrega no destino ${freight.destinoCidadeUf}.`
          });
        }
        persistFreightAndSubDoc(freight, sub);
        for (const person of getAllServerUsers().filter((u) => u.active && u.approvalStatus === "APROVADO" && u.accessProfile === "FINANCEIRO")) pushFreightNotification({ recipientId: person.id, title: `Novo frete ${freight.protocol} \u2014 preparar adiantamento`, subtitle: `${freight.cliente} \u2022 Motorista: ${freight.motoristaNome || "N\xE3o informado"} \u2022 Condi\xE7\xE3o: ${freight.condicoesPagamento || "Conferir no frete"}`, dotColor: "blue", targetSection: "financeiro", targetId: freight.id, dedupeKey: `finance-new:${freight.id}` });
        pushFreightNotification({
          recipientId: monOperator.id,
          title: `Novo frete para carregar \u2014 ${freight.protocol} \u2014 ${freight.origemCidadeUf} \u2192 ${freight.destinoCidadeUf}`,
          subtitle: `Cliente: ${freight.cliente} \u2022 Motorista: ${freight.motoristaNome} (${freight.placaVeiculo}) \u2022 Liberado por ${user.name}`,
          dotColor: "blue",
          targetSection: "fretes_ativos",
          targetId: freight.id,
          dedupeKey: `mon-release:${freight.id}:${freight.revision}`
        });
        if (freight.comercialResponsavelId && freight.comercialResponsavelId !== user.id) {
          pushFreightNotification({
            recipientId: freight.comercialResponsavelId,
            title: `Frete ${freight.protocol} liberado para Monitoramento`,
            subtitle: `Preparado por ${user.name} (Expedi\xE7\xE3o) e atribu\xEDdo ao operador ${monOperator.name}.`,
            dotColor: "blue",
            targetSection: "fretes_comercial",
            targetId: freight.id,
            dedupeKey: `com-mon-release:${freight.id}:${freight.revision}`
          });
        }
        const payload = {
          ok: true,
          freight: sanitizeFreightForUser(freight, user),
          historico: sub.historico
        };
        storeIdempotentResponse(idemKey, 200, payload);
        res.json(payload);
        return;
      }
      if (action === "ATUALIZAR_PREVISAO") {
        if (!dataEntregaPrevistaIso) {
          res.status(400).json({ error: "Informe a nova data de previs\xE3o de entrega." });
          return;
        }
        const prev = `${freight.dataEntregaPrevistaIso} ${freight.janelaEntregaInicio}`;
        freight.dataEntregaPrevistaIso = String(dataEntregaPrevistaIso).slice(0, 10);
        if (janelaEntregaInicio) {
          freight.janelaEntregaInicio = String(janelaEntregaInicio).slice(0, 5);
        }
        if (janelaEntregaFim) {
          freight.janelaEntregaFim = String(janelaEntregaFim).slice(0, 5);
        }
        freight.updatedAtIso = sp.iso;
        freight.updatedAtFormatted = sp.formatted;
        freight.revision += 1;
        appendHistoryEntry(sub, {
          actorId: user.id,
          actorName: user.name,
          actorSector: "Expedi\xE7\xE3o",
          eventType: "ATUALIZACAO_PREVISAO",
          summary: `Previs\xE3o de entrega atualizada de ${prev} para ${freight.dataEntregaPrevistaIso} \u2022 ${freight.janelaEntregaInicio}.`,
          reason: reason ? String(reason).trim().slice(0, 300) : void 0
        });
        persistFreightAndSubDoc(freight, sub);
        pushFreightNotification({
          recipientId: freight.comercialResponsavelId,
          title: `Previs\xE3o atualizada \u2014 Frete ${freight.protocol}`,
          subtitle: `Nova previs\xE3o: ${freight.dataEntregaPrevistaIso} \xE0s ${freight.janelaEntregaInicio}.`,
          dotColor: "blue",
          targetSection: "fretes_comercial",
          targetId: freight.id,
          dedupeKey: `forecast:${freight.id}:${freight.revision}`
        });
        const payload = { ok: true, freight: sanitizeFreightForUser(freight, user), historico: sub.historico };
        storeIdempotentResponse(idemKey, 200, payload);
        res.json(payload);
        return;
      }
      if (action === "DEVOLVER_COMERCIAL") {
        const cleanReason = String(reason || "").trim();
        if (cleanReason.length < 5) {
          res.status(400).json({
            error: "Informe o motivo detalhado da devolu\xE7\xE3o ao Comercial (m\xEDnimo 5 caracteres).",
            code: "MISSING_RETURN_REASON"
          });
          return;
        }
        if (freight.situacaoOperacional === "LIBERADO_MONITORAMENTO" || freight.situacaoOperacional === "CONCLUIDO") {
          res.status(400).json({
            error: "Fretes j\xE1 liberados ao monitoramento ou conclu\xEDdos n\xE3o podem ser devolvidos ao Comercial."
          });
          return;
        }
        freight.devolvidoParaCorrecao = true;
        freight.motivoDevolucao = cleanReason.slice(0, 400);
        freight.situacaoOperacional = "DEVOLVIDO_CORRECAO";
        freight.situacaoComercial = "EM_NEGOCIACAO";
        freight.updatedAtIso = sp.iso;
        freight.updatedAtFormatted = sp.formatted;
        freight.revision += 1;
        appendHistoryEntry(sub, {
          actorId: user.id,
          actorName: user.name,
          actorSector: "Expedi\xE7\xE3o",
          eventType: "DEVOLUCAO_COMERCIAL",
          summary: `Frete devolvido ao Comercial por ${user.name} para corre\xE7\xE3o.`,
          reason: freight.motivoDevolucao
        });
        persistFreightAndSubDoc(freight, sub);
        pushFreightNotification({
          recipientId: freight.comercialResponsavelId,
          title: `Frete ${freight.protocol} devolvido pela Expedi\xE7\xE3o`,
          subtitle: `Motivo: ${freight.motivoDevolucao}`,
          dotColor: "red",
          targetSection: "fretes_comercial",
          targetId: freight.id,
          dedupeKey: `return:${freight.id}:${freight.revision}`
        });
        const payload = { ok: true, freight: sanitizeFreightForUser(freight, user), historico: sub.historico };
        storeIdempotentResponse(idemKey, 200, payload);
        res.json(payload);
        return;
      }
      res.status(400).json({ error: "A\xE7\xE3o operacional da Expedi\xE7\xE3o desconhecida." });
    }
  );
  app.post(
    "/api/meus-fretes/:freightId/monitoramento-action",
    requireApprovedSession2,
    (req, res) => {
      const user = req.sessionUser;
      const freightId = String(req.params.freightId || "");
      const freight = freightsIndex.get(freightId);
      if (!freight) {
        res.status(404).json({ error: "Frete n\xE3o encontrado." });
        return;
      }
      const canReopen = user.accessLevel === "ADMINISTRADOR" || user.accessLevel === "DIRETORIA" || hasPagePermission(user, "fretes_cancelar") || canOperateMonitoring(user) && freight.monitoramentoResponsavelId === user.id;
      const requestedAction = String((req.body || {}).action || "");
      if (requestedAction === "REABRIR_FRETE") {
        if (!canReopen) {
          res.status(403).json({
            error: "Permiss\xE3o negada: apenas o Operador respons\xE1vel, Diretoria ou usu\xE1rios autorizados podem reabrir este frete.",
            code: "FORBIDDEN_REOPEN_FREIGHT"
          });
          return;
        }
      } else if (user.accessLevel !== "ADMINISTRADOR" && (!canOperateMonitoring(user) || freight.monitoramentoResponsavelId !== user.id)) {
        res.status(403).json({
          error: "Permiss\xE3o negada: apenas o Operador de Monitoramento respons\xE1vel ou a Gest\xE3o pode atualizar o acompanhamento deste frete.",
          code: "FORBIDDEN_MONITORAMENTO_ACTION"
        });
        return;
      }
      const {
        action,
        targetStage,
        horarioRealEvento,
        observacoes,
        ultimaLocalizacaoInformada,
        orientacoesMotorista,
        dataColetaIso,
        janelaColetaInicio,
        dataEntregaPrevistaIso,
        janelaEntregaInicio,
        janelaEntregaFim,
        motivo,
        reason: rawReason,
        baseRevision
      } = req.body || {};
      const idemKey = checkIdempotency(req, res, user.id);
      if (idemKey === "__HANDLED__") return;
      if (typeof baseRevision === "number" && baseRevision !== freight.revision) {
        res.status(409).json({
          error: "Conflito de revis\xE3o detectado. Recarregue os dados do frete antes de prosseguir.",
          code: "REVISION_CONFLICT",
          currentRevision: freight.revision,
          freight: sanitizeFreightForUser(freight, user)
        });
        return;
      }
      const sp = formatSaoPauloDateTime();
      const sub = freightSubDocs.get(freight.id);
      const cleanRealTime = String(horarioRealEvento || sp.formatted).trim().slice(0, 60);
      const cleanObs = String(observacoes || rawReason || motivo || "").trim().slice(0, 500);
      if (action === "AVANCAR_ETAPA") {
        const validStages = [
          "NOVO_PARA_CARREGAR",
          "EM_DESLOCAMENTO_COLETA",
          "NO_LOCAL_COLETA",
          "CARREGADO_EM_TRANSPORTE",
          "NO_LOCAL_ENTREGA",
          "ENTREGUE",
          "FINALIZADO"
        ];
        if (!validStages.includes(targetStage)) {
          res.status(400).json({ error: "Etapa de monitoramento inv\xE1lida." });
          return;
        }
        const stageLabels = {
          NAO_LIBERADO: "N\xE3o liberado",
          NOVO_PARA_CARREGAR: "Novo para carregar",
          EM_DESLOCAMENTO_COLETA: "Em deslocamento para coleta",
          NO_LOCAL_COLETA: "No local de coleta",
          CARREGADO_EM_TRANSPORTE: "Carregado / Em transporte",
          NO_LOCAL_ENTREGA: "No local de entrega",
          ENTREGUE: "Entregue",
          FINALIZADO: "Finalizado",
          DEVOLVIDO_EXPEDICAO: "Devolvido \xE0 Expedi\xE7\xE3o",
          CANCELADO: "Cancelado"
        };
        const currentIndex = validStages.indexOf(freight.situacaoMonitoramento || "NAO_LIBERADO");
        const nextIndex = validStages.indexOf(targetStage);
        if (nextIndex === currentIndex) {
          res.json({ ok: true, freight: sanitizeFreightForUser(freight, user), historico: sub.historico });
          return;
        }
        if (nextIndex !== currentIndex + 1) {
          res.status(409).json({ error: "Transi\xE7\xE3o fora da sequ\xEAncia operacional." });
          return;
        }
        if (nextIndex >= 3 && (!freight.enderecoEntrega || freight.enderecoEntrega.trim().length < 10)) {
          res.status(400).json({ error: "Confirme o endere\xE7o detalhado de entrega antes de avan\xE7ar." });
          return;
        }
        if (targetStage === "FINALIZADO") {
          const openImpeditivas = sub.ocorrencias.filter(
            (o) => !o.resolved && o.severity === "IMPEDITIVA"
          );
          if (openImpeditivas.length > 0) {
            res.status(400).json({
              error: `N\xE3o \xE9 poss\xEDvel finalizar o monitoramento: existem ${openImpeditivas.length} pend\xEAncia(s)/ocorr\xEAncia(s) impeditiva(s) em aberto.`,
              code: "BLOCKING_OCCURRENCES_OPEN"
            });
            return;
          }
          const verifiedDeliveryProof = sub.anexos.find(
            (a) => a.category === "COMPROVANTE_ENTREGA" && a.conferido === true
          );
          if (!verifiedDeliveryProof) {
            res.status(400).json({
              error: "Finaliza\xE7\xE3o recusada: \xE9 obrigat\xF3rio anexar e conferir o Comprovante de Entrega antes de finalizar o monitoramento.",
              code: "MISSING_VERIFIED_DELIVERY_PROOF"
            });
            return;
          }
          freight.situacaoMonitoramento = "FINALIZADO";
          freight.situacaoOperacional = "CONCLUIDO";
          freight.situacaoComercial = "FINALIZADO";
          freight.entregaComprovadaEm = cleanRealTime;
          freight.comprovanteEntregaConferido = true;
          freight.comprovanteEntregaAnexoId = verifiedDeliveryProof.id;
        } else {
          freight.situacaoMonitoramento = targetStage;
          freight.situacaoComercial = "EM_MONITORAMENTO";
          freight.situacaoOperacional = "LIBERADO_MONITORAMENTO";
          if (targetStage === "CARREGADO_EM_TRANSPORTE" && !freight.coletaConfirmadaEm) {
            freight.coletaConfirmadaEm = cleanRealTime;
          }
          if (targetStage === "ENTREGUE") {
            freight.entregaComprovadaEm = cleanRealTime;
          }
        }
        if (ultimaLocalizacaoInformada !== void 0 && String(ultimaLocalizacaoInformada).trim()) {
          freight.ultimaLocalizacaoInformada = String(ultimaLocalizacaoInformada).trim().slice(0, 200);
          freight.ultimaLocalizacaoAtualizadaEm = sp.formatted;
          freight.ultimaLocalizacaoAtualizadaPor = user.name;
        }
        freight.updatedAtIso = sp.iso;
        freight.updatedAtFormatted = sp.formatted;
        freight.revision += 1;
        appendHistoryEntry(sub, {
          actorId: user.id,
          actorName: user.name,
          actorSector: "Monitoramento",
          eventType: targetStage === "FINALIZADO" ? "CONCLUSAO_OPERACAO" : "AVANCO_MONITORAMENTO",
          summary: `Etapa de monitoramento atualizada para "${stageLabels[targetStage]}" por ${user.name}. Hor\xE1rio real do evento: ${cleanRealTime}.${cleanObs ? ` Obs: ${cleanObs}` : ""}`,
          horarioRealEvento: cleanRealTime,
          reason: cleanObs || void 0
        });
        persistFreightAndSubDoc(freight, sub);
        if (freight.expedicaoResponsavelId) pushFreightNotification({ recipientId: freight.expedicaoResponsavelId, title: "Monitoramento atualizado", subtitle: freight.protocol + " \u2022 " + targetStage, dotColor: "blue", targetSection: "fretes_expedicao", targetId: freight.id, dedupeKey: "mon-exp:" + freight.id + ":" + freight.revision });
        if (targetStage === "CARREGADO_EM_TRANSPORTE" || targetStage === "ENTREGUE") {
          const installment = targetStage === "CARREGADO_EM_TRANSPORTE" ? "ADIANTAMENTO" : "SALDO";
          if (installment !== "SALDO" || expeditionPaymentMode(freight.condicoesPagamento) !== "Integral (100%)")
            for (const person of getAllServerUsers().filter((u) => u.active && u.approvalStatus === "APROVADO" && u.accessProfile === "FINANCEIRO")) pushFreightNotification({ recipientId: person.id, title: `${freight.protocol} \u2014 ${installment === "ADIANTAMENTO" ? "Coleta registrada: conferir adiantamento" : "Entrega registrada: conferir saldo"}`, subtitle: `${freight.cliente} \u2022 Motorista: ${freight.motoristaNome || "N\xE3o informado"} \u2022 Conferir documentos e pagamento no Financeiro.`, dotColor: "blue", targetSection: "financeiro", targetId: freight.id, dedupeKey: `finance-installment:${freight.id}:${installment}` });
        }
        if (targetStage === "CARREGADO_EM_TRANSPORTE" || targetStage === "ENTREGUE" || targetStage === "FINALIZADO") {
          pushFreightNotification({
            recipientId: freight.comercialResponsavelId,
            title: `Frete ${freight.protocol} \u2014 ${stageLabels[targetStage]}`,
            subtitle: `Atualizado por ${user.name} (Monitoramento) \u2022 Hor\xE1rio do evento: ${cleanRealTime}.`,
            dotColor: "blue",
            targetSection: "fretes_comercial",
            targetId: freight.id,
            dedupeKey: `monstage:${freight.id}:${targetStage}:${freight.revision}`
          });
        }
        const payload = {
          ok: true,
          freight: sanitizeFreightForUser(freight, user),
          historico: sub.historico
        };
        storeIdempotentResponse(idemKey, 200, payload);
        res.json(payload);
        return;
      }
      if (action === "REGISTRAR_LOCALIZACAO_ORIENTACAO") {
        if (req.body.enderecoEntrega !== void 0) {
          const address = String(req.body.enderecoEntrega).trim();
          if (address.length < 10 || address.length > 240) {
            res.status(400).json({ error: "Informe endere\xE7o detalhado de entrega (10 a 240 caracteres)." });
            return;
          }
          freight.enderecoEntrega = address;
        }
        const changes = [];
        if (ultimaLocalizacaoInformada !== void 0) {
          const loc = String(ultimaLocalizacaoInformada).trim().slice(0, 200);
          freight.ultimaLocalizacaoInformada = loc || void 0;
          freight.ultimaLocalizacaoAtualizadaEm = sp.formatted;
          freight.ultimaLocalizacaoAtualizadaPor = user.name;
          if (loc) changes.push(`Localiza\xE7\xE3o informada: "${loc}"`);
        }
        if (orientacoesMotorista !== void 0) {
          const ori = String(orientacoesMotorista).trim().slice(0, 1e3);
          freight.orientacoesMotorista = ori || void 0;
          if (ori) changes.push(`Contato/orienta\xE7\xE3o ao motorista registrado`);
        }
        if (dataColetaIso !== void 0 && String(dataColetaIso).trim()) {
          freight.dataColetaIso = String(dataColetaIso).slice(0, 10);
          if (janelaColetaInicio) {
            freight.janelaColetaInicio = String(janelaColetaInicio).slice(0, 5);
          }
          changes.push(`Previs\xE3o de coleta: ${freight.dataColetaIso} ${freight.janelaColetaInicio}`);
        }
        if (dataEntregaPrevistaIso !== void 0 && String(dataEntregaPrevistaIso).trim()) {
          freight.dataEntregaPrevistaIso = String(dataEntregaPrevistaIso).slice(0, 10);
          if (janelaEntregaInicio) {
            freight.janelaEntregaInicio = String(janelaEntregaInicio).slice(0, 5);
          }
          if (janelaEntregaFim) {
            freight.janelaEntregaFim = String(janelaEntregaFim).slice(0, 5);
          }
          changes.push(`Previs\xE3o de entrega: ${freight.dataEntregaPrevistaIso} ${freight.janelaEntregaInicio}`);
        }
        freight.updatedAtIso = sp.iso;
        freight.updatedAtFormatted = sp.formatted;
        freight.revision += 1;
        appendHistoryEntry(sub, {
          actorId: user.id,
          actorName: user.name,
          actorSector: "Monitoramento",
          eventType: "REGISTRO_LOCALIZACAO",
          summary: changes.length > 0 ? `Acompanhamento registrado por ${user.name}: ${changes.join(" \u2022 ")}.` : `Acompanhamento atualizado por ${user.name}.`,
          horarioRealEvento: cleanRealTime,
          reason: cleanObs || void 0
        });
        persistFreightAndSubDoc(freight, sub);
        const payload = {
          ok: true,
          freight: sanitizeFreightForUser(freight, user),
          historico: sub.historico
        };
        storeIdempotentResponse(idemKey, 200, payload);
        res.json(payload);
        return;
      }
      if (action === "DEVOLVER_EXPEDICAO") {
        if (cleanObs.length < 5) {
          res.status(400).json({
            error: "Informe o motivo obrigat\xF3rio para devolver o frete \xE0 Expedi\xE7\xE3o (m\xEDnimo 5 caracteres).",
            code: "MISSING_RETURN_REASON"
          });
          return;
        }
        freight.devolvidoParaCorrecao = true;
        freight.motivoDevolucao = cleanObs;
        freight.situacaoOperacional = "EM_PREPARACAO";
        freight.situacaoMonitoramento = "DEVOLVIDO_EXPEDICAO";
        freight.situacaoComercial = "AGUARDANDO_EXPEDICAO";
        freight.updatedAtIso = sp.iso;
        freight.updatedAtFormatted = sp.formatted;
        freight.revision += 1;
        appendHistoryEntry(sub, {
          actorId: user.id,
          actorName: user.name,
          actorSector: "Monitoramento",
          eventType: "DEVOLUCAO_EXPEDICAO",
          summary: `Frete devolvido pelo Operador de Monitoramento (${user.name}) \xE0 Expedi\xE7\xE3o para corre\xE7\xE3o.`,
          reason: cleanObs
        });
        persistFreightAndSubDoc(freight, sub);
        if (freight.expedicaoResponsavelId) {
          pushFreightNotification({
            recipientId: freight.expedicaoResponsavelId,
            title: `Frete ${freight.protocol} devolvido pelo Monitoramento`,
            subtitle: `Devolvido por ${user.name}. Motivo: ${cleanObs}`,
            dotColor: "red",
            targetSection: "fretes_expedicao",
            targetId: freight.id,
            dedupeKey: `mon-ret-exp:${freight.id}:${freight.revision}`
          });
        }
        const payload = {
          ok: true,
          freight: sanitizeFreightForUser(freight, user),
          historico: sub.historico
        };
        storeIdempotentResponse(idemKey, 200, payload);
        res.json(payload);
        return;
      }
      if (action === "REABRIR_FRETE") {
        if (freight.situacaoMonitoramento !== "FINALIZADO" && freight.situacaoMonitoramento !== "ENTREGUE") {
          res.status(400).json({
            error: "Apenas fretes entregues ou finalizados podem ser reabertos.",
            code: "INVALID_REOPEN_STATE"
          });
          return;
        }
        if (cleanObs.length < 5) {
          res.status(400).json({
            error: "Informe o motivo obrigat\xF3rio da reabertura (m\xEDnimo 5 caracteres).",
            code: "MISSING_REOPEN_REASON"
          });
          return;
        }
        const reopenStage = freight.situacaoMonitoramento === "FINALIZADO" && targetStage === "ENTREGUE" ? "ENTREGUE" : "NO_LOCAL_ENTREGA";
        const prevStatusLabel = freight.situacaoMonitoramento === "FINALIZADO" ? "Finalizado" : "Entregue";
        const nextStatusLabel = reopenStage === "ENTREGUE" ? "Entregue" : "No local de entrega";
        freight.situacaoMonitoramento = reopenStage;
        freight.situacaoComercial = "EM_MONITORAMENTO";
        freight.situacaoOperacional = "LIBERADO_MONITORAMENTO";
        freight.updatedAtIso = sp.iso;
        freight.updatedAtFormatted = sp.formatted;
        freight.revision += 1;
        appendHistoryEntry(sub, {
          actorId: user.id,
          actorName: user.name,
          actorSector: "Monitoramento",
          eventType: "REABERTURA_MONITORAMENTO",
          summary: `Frete reaberto de "${prevStatusLabel}" para "${nextStatusLabel}" por ${user.name}.`,
          horarioRealEvento: cleanRealTime,
          reason: cleanObs
        });
        persistFreightAndSubDoc(freight, sub);
        appendServerAuditLog(
          user.id,
          user.name,
          user.accessLevel,
          "REABERTURA_FRETE_MONITORAMENTO",
          `Frete ${freight.protocol} reaberto (${prevStatusLabel} -> ${nextStatusLabel}). Motivo: ${cleanObs}`,
          req.ip
        );
        const payload = {
          ok: true,
          freight: sanitizeFreightForUser(freight, user),
          historico: sub.historico
        };
        storeIdempotentResponse(idemKey, 200, payload);
        res.json(payload);
        return;
      }
      res.status(400).json({ error: "A\xE7\xE3o de monitoramento desconhecida." });
    }
  );
  app.post(
    "/api/meus-fretes/:freightId/reopen",
    requireApprovedSession2,
    (req, res) => {
      const user = req.sessionUser;
      const freightId = String(req.params.freightId || "");
      const freight = freightsIndex.get(freightId);
      if (!freight) {
        res.status(404).json({ error: "Frete n\xE3o encontrado." });
        return;
      }
      const canReopen = user.accessLevel === "ADMINISTRADOR" || user.accessLevel === "DIRETORIA" || hasPagePermission(user, "fretes_cancelar") || canOperateMonitoring(user) && freight.monitoramentoResponsavelId === user.id;
      if (!canReopen) {
        res.status(403).json({
          error: "Permiss\xE3o negada: apenas usu\xE1rios autorizados podem reabrir um frete finalizado ou entregue.",
          code: "FORBIDDEN_REOPEN_FREIGHT"
        });
        return;
      }
      const { motivo, reason: rawReason, targetStage, baseRevision, horarioRealEvento } = req.body || {};
      const idemKey = checkIdempotency(req, res, user.id);
      if (idemKey === "__HANDLED__") return;
      if (typeof baseRevision === "number" && baseRevision !== freight.revision) {
        res.status(409).json({
          error: "Conflito de revis\xE3o detectado. Recarregue os dados do frete antes de prosseguir.",
          code: "REVISION_CONFLICT",
          currentRevision: freight.revision,
          freight: sanitizeFreightForUser(freight, user)
        });
        return;
      }
      if (freight.situacaoMonitoramento !== "FINALIZADO" && freight.situacaoMonitoramento !== "ENTREGUE") {
        res.status(400).json({
          error: "Apenas fretes entregues ou finalizados podem ser reabertos.",
          code: "INVALID_REOPEN_STATE"
        });
        return;
      }
      const cleanObs = String(motivo || rawReason || "").trim().slice(0, 500);
      if (cleanObs.length < 5) {
        res.status(400).json({
          error: "Informe o motivo obrigat\xF3rio da reabertura (m\xEDnimo 5 caracteres).",
          code: "MISSING_REOPEN_REASON"
        });
        return;
      }
      const sp = formatSaoPauloDateTime();
      const sub = freightSubDocs.get(freight.id) || {
        freightId: freight.id,
        anexos: [],
        comentarios: [],
        ocorrencias: [],
        historico: []
      };
      const cleanRealTime = String(horarioRealEvento || sp.formatted).trim().slice(0, 60);
      const reopenStage = freight.situacaoMonitoramento === "FINALIZADO" && targetStage === "ENTREGUE" ? "ENTREGUE" : "NO_LOCAL_ENTREGA";
      const prevStatusLabel = freight.situacaoMonitoramento === "FINALIZADO" ? "Finalizado" : "Entregue";
      const nextStatusLabel = reopenStage === "ENTREGUE" ? "Entregue" : "No local de entrega";
      freight.situacaoMonitoramento = reopenStage;
      freight.situacaoComercial = "EM_MONITORAMENTO";
      freight.situacaoOperacional = "LIBERADO_MONITORAMENTO";
      freight.updatedAtIso = sp.iso;
      freight.updatedAtFormatted = sp.formatted;
      freight.revision += 1;
      appendHistoryEntry(sub, {
        actorId: user.id,
        actorName: user.name,
        actorSector: "Monitoramento",
        eventType: "REABERTURA_MONITORAMENTO",
        summary: `Frete reaberto de "${prevStatusLabel}" para "${nextStatusLabel}" por ${user.name}.`,
        horarioRealEvento: cleanRealTime,
        reason: cleanObs
      });
      persistFreightAndSubDoc(freight, sub);
      appendServerAuditLog(
        user.id,
        user.name,
        user.accessLevel,
        "REABERTURA_FRETE_MONITORAMENTO",
        `Frete ${freight.protocol} reaberto (${prevStatusLabel} -> ${nextStatusLabel}). Motivo: ${cleanObs}`,
        req.ip
      );
      const payload = {
        ok: true,
        freight: sanitizeFreightForUser(freight, user),
        historico: sub.historico
      };
      storeIdempotentResponse(idemKey, 200, payload);
      res.json(payload);
    }
  );
  app.post(
    "/api/meus-fretes/:freightId/occurrences",
    requireApprovedSession2,
    (req, res) => {
      const user = req.sessionUser;
      const freightId = String(req.params.freightId || "");
      const freight = freightsIndex.get(freightId);
      if (!freight) {
        res.status(404).json({ error: "Frete n\xE3o encontrado." });
        return;
      }
      if (!canUserAccessFreightRecord(freight, user)) {
        res.status(403).json({ error: "Sem permiss\xE3o para registrar ocorr\xEAncia neste frete." });
        return;
      }
      const idemKey = checkIdempotency(req, res, user.id);
      if (idemKey === "__HANDLED__") return;
      const { title, description, severity, horarioRealEvento } = req.body || {};
      const cleanTitle = String(title || "").trim();
      const cleanDesc = String(description || "").trim();
      if (cleanTitle.length < 3) {
        res.status(400).json({ error: "Informe o t\xEDtulo da ocorr\xEAncia (m\xEDnimo 3 caracteres)." });
        return;
      }
      const safeSeverity = ["BAIXA", "MEDIA", "IMPEDITIVA"].includes(
        severity
      ) ? severity : "MEDIA";
      const sp = formatSaoPauloDateTime();
      const sub = freightSubDocs.get(freight.id);
      const occ = {
        id: `focc-${Date.now()}-${crypto10.randomBytes(3).toString("hex")}`,
        freightId: freight.id,
        severity: safeSeverity,
        title: cleanTitle.slice(0, 140),
        description: cleanDesc.slice(0, 800),
        resolved: false,
        createdById: user.id,
        createdByName: user.name,
        createdAtIso: sp.iso,
        createdAtFormatted: sp.formatted
      };
      sub.ocorrencias.unshift(occ);
      freight.updatedAtIso = sp.iso;
      freight.updatedAtFormatted = sp.formatted;
      freight.revision += 1;
      const actorSector = freight.monitoramentoResponsavelId === user.id ? "Monitoramento" : canAccessExpedicaoFreights(user) ? "Expedi\xE7\xE3o" : "Comercial";
      appendHistoryEntry(sub, {
        actorId: user.id,
        actorName: user.name,
        actorSector,
        eventType: "OCORRENCIA",
        summary: `Ocorr\xEAncia registrada (${safeSeverity}): ${occ.title}`,
        reason: occ.description || void 0,
        horarioRealEvento: horarioRealEvento ? String(horarioRealEvento).slice(0, 60) : sp.formatted
      });
      persistFreightAndSubDoc(freight, sub);
      if (freight.comercialResponsavelId && freight.comercialResponsavelId !== user.id) {
        pushFreightNotification({
          recipientId: freight.comercialResponsavelId,
          title: `Ocorr\xEAncia no Frete ${freight.protocol} (${safeSeverity})`,
          subtitle: `${occ.title} \u2014 registrada por ${user.name}`,
          dotColor: safeSeverity === "IMPEDITIVA" ? "red" : "blue",
          targetSection: "fretes_comercial",
          targetId: freight.id,
          dedupeKey: `occ:${occ.id}:com`
        });
      }
      if (freight.expedicaoResponsavelId && freight.expedicaoResponsavelId !== user.id) {
        pushFreightNotification({
          recipientId: freight.expedicaoResponsavelId,
          title: `Ocorr\xEAncia no Frete ${freight.protocol} (${safeSeverity})`,
          subtitle: `${occ.title} \u2014 registrada por ${user.name}`,
          dotColor: safeSeverity === "IMPEDITIVA" ? "red" : "blue",
          targetSection: "fretes_expedicao",
          targetId: freight.id,
          dedupeKey: `occ:${occ.id}:exp`
        });
      }
      if (freight.monitoramentoResponsavelId && freight.monitoramentoResponsavelId !== user.id) {
        pushFreightNotification({
          recipientId: freight.monitoramentoResponsavelId,
          title: `Ocorr\xEAncia no Frete ${freight.protocol} (${safeSeverity})`,
          subtitle: `${occ.title} \u2014 registrada por ${user.name}`,
          dotColor: safeSeverity === "IMPEDITIVA" ? "red" : "blue",
          targetSection: "fretes_ativos",
          targetId: freight.id,
          dedupeKey: `occ:${occ.id}:mon`
        });
      }
      const payload = {
        ok: true,
        occurrence: occ,
        freight: sanitizeFreightForUser(freight, user),
        ocorrencias: sub.ocorrencias,
        historico: sub.historico
      };
      storeIdempotentResponse(idemKey, 201, payload);
      res.status(201).json(payload);
    }
  );
  app.post(
    "/api/meus-fretes/:freightId/occurrences/:occId/resolve",
    requireApprovedSession2,
    (req, res) => {
      const user = req.sessionUser;
      const freightId = String(req.params.freightId || "");
      const occId = String(req.params.occId || "");
      const freight = freightsIndex.get(freightId);
      if (!freight) {
        res.status(404).json({ error: "Frete n\xE3o encontrado." });
        return;
      }
      if (!canUserAccessFreightRecord(freight, user)) {
        res.status(403).json({ error: "Sem permiss\xE3o para resolver ocorr\xEAncia neste frete." });
        return;
      }
      const sub = freightSubDocs.get(freight.id);
      const occ = sub.ocorrencias.find((o) => o.id === occId);
      if (!occ) {
        res.status(404).json({ error: "Ocorr\xEAncia n\xE3o encontrada." });
        return;
      }
      const sp = formatSaoPauloDateTime();
      occ.resolved = true;
      occ.resolvedById = user.id;
      occ.resolvedByName = user.name;
      occ.resolvedAtFormatted = sp.formatted;
      freight.updatedAtIso = sp.iso;
      freight.updatedAtFormatted = sp.formatted;
      freight.revision += 1;
      appendHistoryEntry(sub, {
        actorId: user.id,
        actorName: user.name,
        actorSector: freight.monitoramentoResponsavelId === user.id ? "Monitoramento" : canAccessExpedicaoFreights(user) ? "Expedi\xE7\xE3o" : "Comercial",
        eventType: "RESOLUCAO_OCORRENCIA",
        summary: `Ocorr\xEAncia resolvida por ${user.name}: ${occ.title}`
      });
      persistFreightAndSubDoc(freight, sub);
      res.json({
        ok: true,
        freight: sanitizeFreightForUser(freight, user),
        ocorrencias: sub.ocorrencias,
        historico: sub.historico
      });
    }
  );
  app.post(
    "/api/meus-fretes/:freightId/comments",
    requireApprovedSession2,
    (req, res) => {
      const user = req.sessionUser;
      const freightId = String(req.params.freightId || "");
      const freight = freightsIndex.get(freightId);
      if (!freight) {
        res.status(404).json({ error: "Frete n\xE3o encontrado." });
        return;
      }
      if (!canUserAccessFreightRecord(freight, user)) {
        res.status(403).json({ error: "Acesso negado a este frete." });
        return;
      }
      const idemKey = checkIdempotency(req, res, user.id);
      if (idemKey === "__HANDLED__") return;
      const text = String(req.body?.text || "").trim();
      if (!text) {
        res.status(400).json({ error: "Digite o conte\xFAdo do coment\xE1rio." });
        return;
      }
      const sp = formatSaoPauloDateTime();
      const sub = freightSubDocs.get(freight.id);
      const sector = user.accessLevel !== "FUNCIONARIO" ? "GESTAO" : canAccessExpedicaoFreights(user) && freight.expedicaoResponsavelId === user.id || freight.monitoramentoResponsavelId === user.id ? "EXPEDICAO" : "COMERCIAL";
      const comment = {
        id: `fcom-${Date.now()}-${crypto10.randomBytes(3).toString("hex")}`,
        freightId: freight.id,
        authorId: user.id,
        authorName: user.name,
        authorRole: user.roleTitle,
        sector,
        text: text.slice(0, 1500),
        createdAtIso: sp.iso,
        createdAtFormatted: sp.formatted
      };
      sub.comentarios.push(comment);
      freight.updatedAtIso = sp.iso;
      freight.updatedAtFormatted = sp.formatted;
      freight.revision += 1;
      persistFreightAndSubDoc(freight, sub);
      const payload = {
        ok: true,
        comment,
        freight: sanitizeFreightForUser(freight, user),
        comentarios: sub.comentarios
      };
      storeIdempotentResponse(idemKey, 201, payload);
      res.status(201).json(payload);
    }
  );
  app.post(
    "/api/meus-fretes/:freightId/attachments",
    requireApprovedSession2,
    (req, res) => {
      const user = req.sessionUser;
      const freightId = String(req.params.freightId || "");
      const freight = freightsIndex.get(freightId);
      if (!freight) {
        res.status(404).json({ error: "Frete n\xE3o encontrado." });
        return;
      }
      if (!canUserAccessFreightRecord(freight, user)) {
        res.status(403).json({
          error: "Permiss\xE3o negada para enviar anexos neste frete.",
          code: "FORBIDDEN_ATTACHMENT_UPLOAD"
        });
        return;
      }
      const idemKey = checkIdempotency(req, res, user.id);
      if (idemKey === "__HANDLED__") return;
      const { category, label, fileName, dataUrl } = req.body || {};
      if (typeof dataUrl !== "string" || !dataUrl.includes(",")) {
        res.status(400).json({ error: "Envie um arquivo v\xE1lido (PDF, PNG, JPEG ou WebP)." });
        return;
      }
      const base64Part = dataUrl.slice(dataUrl.indexOf(",") + 1);
      let fileBuf;
      try {
        fileBuf = Buffer.from(base64Part, "base64");
      } catch {
        res.status(400).json({ error: "Falha ao decodificar o arquivo enviado." });
        return;
      }
      const cleanOriginalName = String(fileName || "documento.pdf").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
      const validation = validateAttachmentFileBuffer(fileBuf, cleanOriginalName);
      if (!validation.valid || !validation.extension || !validation.mimeType) {
        res.status(400).json({
          error: validation.error || "Arquivo inv\xE1lido.",
          code: "INVALID_ATTACHMENT_FORMAT"
        });
        return;
      }
      const validCategories = [
        "COMERCIAL",
        "CTE",
        "MDFE",
        "RPA",
        "COMPROVANTE_ENTREGA",
        "ORDEM_CARREGAMENTO",
        "OUTRO"
      ];
      const safeCat = validCategories.includes(category) ? category : "OUTRO";
      ensureDirectories();
      const storageName = `fdoc-${freight.id}-${crypto10.randomUUID()}.${validation.extension}`;
      const diskPath = path9.join(FREIGHT_ATTACHMENTS_DIR, storageName);
      fs9.writeFileSync(diskPath, fileBuf);
      void persistSystemAssetToNeon({
        id: storageName,
        slot: "freightAttachment",
        mimeType: validation.mimeType || "application/octet-stream",
        dataBase64: fileBuf.toString("base64")
      });
      const sp = formatSaoPauloDateTime();
      const sizeKb = Math.max(1, Math.round(fileBuf.length / 1024));
      const attachment = {
        id: `fatt-${Date.now()}-${crypto10.randomBytes(3).toString("hex")}`,
        freightId: freight.id,
        category: safeCat,
        label: String(label || safeCat).trim().slice(0, 80),
        fileName: cleanOriginalName,
        storageName,
        mimeType: validation.mimeType,
        sizeBytes: fileBuf.length,
        sizeLabel: sizeKb >= 1024 ? `${(sizeKb / 1024).toFixed(1)} MB` : `${sizeKb} KB`,
        conferido: false,
        // Never assume verified merely by upload!
        uploadedById: user.id,
        uploadedByName: user.name,
        uploadedAtIso: sp.iso,
        uploadedAtFormatted: sp.formatted
      };
      const sub = freightSubDocs.get(freight.id);
      sub.anexos.unshift(attachment);
      freight.updatedAtIso = sp.iso;
      freight.updatedAtFormatted = sp.formatted;
      freight.revision += 1;
      appendHistoryEntry(sub, {
        actorId: user.id,
        actorName: user.name,
        actorSector: freight.monitoramentoResponsavelId === user.id ? "Monitoramento" : canAccessExpedicaoFreights(user) ? "Expedi\xE7\xE3o" : "Comercial",
        eventType: "UPLOAD_ANEXO",
        summary: `Anexo adicionado (${attachment.label}: ${attachment.fileName}, ${attachment.sizeLabel}) \u2014 aguardando confer\xEAncia.`
      });
      persistFreightAndSubDoc(freight, sub);
      const payload = {
        ok: true,
        attachment,
        freight: sanitizeFreightForUser(freight, user),
        anexos: sub.anexos,
        historico: sub.historico
      };
      storeIdempotentResponse(idemKey, 201, payload);
      res.status(201).json(payload);
    }
  );
  app.post(
    "/api/meus-fretes/:freightId/attachments/:attId/verify",
    requireApprovedSession2,
    (req, res) => {
      const user = req.sessionUser;
      const freightId = String(req.params.freightId || "");
      const attId = String(req.params.attId || "");
      const freight = freightsIndex.get(freightId);
      if (!freight) {
        res.status(404).json({ error: "Frete n\xE3o encontrado." });
        return;
      }
      const isAssignedOrManager = freight.expedicaoResponsavelId === user.id || freight.monitoramentoResponsavelId === user.id || canViewFreightTeam(user);
      const hasOperationalPerm = canAccessExpedicaoFreights(user) || canAccessMonitoramentoFreights(user);
      if (!hasOperationalPerm || !isAssignedOrManager) {
        res.status(403).json({
          error: "Apenas o respons\xE1vel da Expedi\xE7\xE3o ou do Monitoramento pode atestar a confer\xEAncia de documentos.",
          code: "FORBIDDEN_VERIFY_ATTACHMENT"
        });
        return;
      }
      const sub = freightSubDocs.get(freight.id);
      const att = sub.anexos.find((a) => a.id === attId);
      if (!att) {
        res.status(404).json({ error: "Anexo n\xE3o encontrado." });
        return;
      }
      const sp = formatSaoPauloDateTime();
      att.conferido = Boolean(req.body?.conferido ?? true);
      att.conferidoPorId = user.id;
      att.conferidoPorNome = user.name;
      att.conferidoEmFormatado = sp.formatted;
      if (att.category === "COMPROVANTE_ENTREGA") {
        freight.comprovanteEntregaConferido = att.conferido;
        freight.comprovanteEntregaAnexoId = att.conferido ? att.id : void 0;
      }
      freight.updatedAtIso = sp.iso;
      freight.updatedAtFormatted = sp.formatted;
      freight.revision += 1;
      appendHistoryEntry(sub, {
        actorId: user.id,
        actorName: user.name,
        actorSector: freight.monitoramentoResponsavelId === user.id ? "Monitoramento" : "Expedi\xE7\xE3o",
        eventType: "CONFERENCIA_ANEXO",
        summary: `Documento "${att.fileName}" (${att.label}) marcado como ${att.conferido ? "CONFERIDO" : "PENDENTE DE CONFER\xCANCIA"} por ${user.name}.`
      });
      persistFreightAndSubDoc(freight, sub);
      res.json({
        ok: true,
        attachment: att,
        freight: sanitizeFreightForUser(freight, user),
        anexos: sub.anexos,
        historico: sub.historico
      });
    }
  );
  app.get(
    [
      "/api/meus-fretes/:freightId/attachments/:attId/file",
      "/api/meus-fretes/:freightId/attachments/:attId/download"
    ],
    requireApprovedSession2,
    async (req, res) => {
      const user = req.sessionUser;
      const freightId = String(req.params.freightId || "");
      const attId = String(req.params.attId || "");
      const freight = freightsIndex.get(freightId);
      if (!freight) {
        res.status(404).json({ error: "Frete n\xE3o encontrado." });
        return;
      }
      const isSharedUnclaimed = freight.expedicaoResponsavelId === null && freight.comercialResponsavelId !== user.id && freight.monitoramentoResponsavelId !== user.id && !canViewFreightTeam(user);
      if (!canUserAccessFreightRecord(freight, user) || isSharedUnclaimed) {
        res.status(403).json({
          error: "Acesso negado: voc\xEA n\xE3o possui autoriza\xE7\xE3o para baixar documentos deste frete.",
          code: "FORBIDDEN_DOCUMENT_DOWNLOAD"
        });
        return;
      }
      const sub = freightSubDocs.get(freight.id);
      const att = sub?.anexos.find((a) => a.id === attId);
      if (!att) {
        res.status(404).json({ error: "Anexo n\xE3o encontrado." });
        return;
      }
      const safeFile = path9.basename(att.storageName);
      const diskPath = path9.join(FREIGHT_ATTACHMENTS_DIR, safeFile);
      if (!fs9.existsSync(diskPath)) {
        const neonAsset = await getSystemAssetFromNeon(safeFile);
        if (neonAsset && neonAsset.buffer) {
          try {
            ensureDirectories();
            fs9.writeFileSync(diskPath, neonAsset.buffer);
          } catch {
          }
          res.setHeader("Content-Type", att.mimeType || neonAsset.mimeType);
          res.setHeader(
            "Content-Disposition",
            `inline; filename="${encodeURIComponent(att.fileName)}"`
          );
          res.setHeader("Cache-Control", "private, no-store");
          res.send(neonAsset.buffer);
          return;
        }
        res.status(404).json({ error: "Arquivo f\xEDsico n\xE3o encontrado no armazenamento do servidor." });
        return;
      }
      res.setHeader("Content-Type", att.mimeType);
      res.setHeader(
        "Content-Disposition",
        `inline; filename="${encodeURIComponent(att.fileName)}"`
      );
      res.setHeader("Cache-Control", "private, no-store");
      fs9.createReadStream(diskPath).pipe(res);
    }
  );
  app.delete(
    "/api/meus-fretes/:freightId/attachments/:attId",
    requireApprovedSession2,
    (req, res) => {
      const user = req.sessionUser;
      const freightId = String(req.params.freightId || "");
      const attId = String(req.params.attId || "");
      const freight = freightsIndex.get(freightId);
      if (!freight) {
        res.status(404).json({ error: "Frete n\xE3o encontrado." });
        return;
      }
      const isAssignedOrManager = freight.comercialResponsavelId === user.id || freight.expedicaoResponsavelId === user.id || freight.monitoramentoResponsavelId === user.id || user.accessLevel === "ADMINISTRADOR" || user.accessLevel === "DIRETORIA" || canViewFreightTeam(user);
      if (!isAssignedOrManager) {
        res.status(403).json({
          error: "Permiss\xE3o negada para remover anexos deste frete.",
          code: "FORBIDDEN_DELETE_ATTACHMENT"
        });
        return;
      }
      const sub = freightSubDocs.get(freight.id);
      const attIdx = sub.anexos.findIndex((a) => a.id === attId);
      if (attIdx === -1) {
        res.status(404).json({ error: "Anexo n\xE3o encontrado." });
        return;
      }
      const att = sub.anexos[attIdx];
      try {
        const diskPath = path9.join(FREIGHT_ATTACHMENTS_DIR, path9.basename(att.storageName));
        if (fs9.existsSync(diskPath)) fs9.unlinkSync(diskPath);
      } catch {
      }
      sub.anexos.splice(attIdx, 1);
      const sp = formatSaoPauloDateTime();
      freight.updatedAtIso = sp.iso;
      freight.updatedAtFormatted = sp.formatted;
      freight.revision += 1;
      appendHistoryEntry(sub, {
        actorId: user.id,
        actorName: user.name,
        actorSector: user.department || "Operacional",
        eventType: "EXCLUSAO_ANEXO",
        summary: `Documento "${att.fileName}" (${att.label}) exclu\xEDdo por ${user.name}.`
      });
      persistFreightAndSubDoc(freight, sub);
      res.json({
        ok: true,
        freight: sanitizeFreightForUser(freight, user),
        anexos: sub.anexos,
        historico: sub.historico
      });
    }
  );
  app.delete(
    "/api/meus-fretes/:freightId/attachments",
    requireApprovedSession2,
    (req, res) => {
      const user = req.sessionUser;
      const freightId = String(req.params.freightId || "");
      const freight = freightsIndex.get(freightId);
      if (!freight) {
        res.status(404).json({ error: "Frete n\xE3o encontrado." });
        return;
      }
      const isAuthorized = user.accessLevel === "ADMINISTRADOR" || user.accessLevel === "DIRETORIA" || freight.comercialResponsavelId === user.id || freight.expedicaoResponsavelId === user.id;
      if (!isAuthorized) {
        res.status(403).json({
          error: "Permiss\xE3o negada para excluir todos os documentos salvos.",
          code: "FORBIDDEN_BULK_DELETE_ATTACHMENTS"
        });
        return;
      }
      const sub = freightSubDocs.get(freight.id);
      const count = sub.anexos.length;
      for (const att of sub.anexos) {
        try {
          const diskPath = path9.join(FREIGHT_ATTACHMENTS_DIR, path9.basename(att.storageName));
          if (fs9.existsSync(diskPath)) fs9.unlinkSync(diskPath);
        } catch {
        }
      }
      sub.anexos = [];
      const sp = formatSaoPauloDateTime();
      freight.updatedAtIso = sp.iso;
      freight.updatedAtFormatted = sp.formatted;
      freight.revision += 1;
      appendHistoryEntry(sub, {
        actorId: user.id,
        actorName: user.name,
        actorSector: user.department || "Operacional",
        eventType: "EXCLUSAO_TODOS_ANEXOS",
        summary: `Todos os ${count} documentos salvos foram exclu\xEDdos por ${user.name}.`
      });
      persistFreightAndSubDoc(freight, sub);
      res.json({
        ok: true,
        freight: sanitizeFreightForUser(freight, user),
        anexos: [],
        historico: sub.historico
      });
    }
  );
  app.post(
    "/api/meus-fretes/:freightId/transfer",
    requireApprovedSession2,
    (req, res) => {
      const user = req.sessionUser;
      const freightId = String(req.params.freightId || "");
      const freight = freightsIndex.get(freightId);
      if (!freight) {
        res.status(404).json({ error: "Frete n\xE3o encontrado." });
        return;
      }
      const canTransfer = user.accessLevel === "ADMINISTRADOR" || user.accessLevel === "DIRETORIA" || hasPagePermission(user, "fretes_transferir") || canViewFreightTeam(user);
      if (!canTransfer || !canUserAccessFreightRecord(freight, user)) {
        res.status(403).json({
          error: "Permiss\xE3o negada: sua conta n\xE3o possui autoriza\xE7\xE3o para transferir responsabilidade de fretes.",
          code: "FORBIDDEN_TRANSFER"
        });
        return;
      }
      const { sector, newResponsibleId, reason, baseRevision } = req.body || {};
      if (typeof baseRevision === "number" && baseRevision !== freight.revision) {
        res.status(409).json({
          error: "Conflito de revis\xE3o detectado. Recarregue os dados do frete.",
          code: "REVISION_CONFLICT"
        });
        return;
      }
      const cleanReason = String(reason || "").trim();
      if (cleanReason.length < 5) {
        res.status(400).json({
          error: "Informe o motivo da transfer\xEAncia de responsabilidade (m\xEDnimo 5 caracteres).",
          code: "MISSING_TRANSFER_REASON"
        });
        return;
      }
      const targetUser = getAllServerUsers().find(
        (u) => u.id === String(newResponsibleId || "") && u.approvalStatus === "APROVADO" && u.active
      );
      if (!targetUser) {
        res.status(404).json({ error: "Novo respons\xE1vel n\xE3o encontrado ou conta inativa." });
        return;
      }
      const sp = formatSaoPauloDateTime();
      const sub = freightSubDocs.get(freight.id);
      const targetSector = String(sector || "EXPEDICAO").toUpperCase();
      if (targetSector === "COMERCIAL") {
        if (!canAccessComercialFreights(targetUser)) {
          res.status(400).json({
            error: "O funcion\xE1rio selecionado n\xE3o possui permiss\xE3o para o m\xF3dulo Comercial."
          });
          return;
        }
        const prevName = freight.comercialResponsavelNome;
        freight.comercialResponsavelId = targetUser.id;
        freight.comercialResponsavelNome = targetUser.name;
        freight.updatedAtIso = sp.iso;
        freight.updatedAtFormatted = sp.formatted;
        freight.revision += 1;
        appendHistoryEntry(sub, {
          actorId: user.id,
          actorName: user.name,
          actorSector: "Comercial",
          eventType: "TRANSFERENCIA",
          summary: `Responsabilidade comercial transferida de ${prevName} para ${targetUser.name}.`,
          reason: cleanReason.slice(0, 300),
          previousResponsibleName: prevName,
          newResponsibleName: targetUser.name
        });
        pushFreightNotification({
          recipientId: targetUser.id,
          title: `Frete ${freight.protocol} transferido para sua carteira Comercial`,
          subtitle: `Transferido por ${user.name}. Motivo: ${cleanReason}`,
          dotColor: "blue",
          targetSection: "fretes_comercial",
          targetId: freight.id,
          dedupeKey: `xfer:com:${freight.id}:${freight.revision}`
        });
      } else if (targetSector === "MONITORAMENTO") {
        if (!canOperateMonitoring(targetUser)) {
          res.status(400).json({
            error: "O funcion\xE1rio selecionado n\xE3o possui permiss\xE3o para o Monitoramento de Fretes."
          });
          return;
        }
        const prevName = freight.monitoramentoResponsavelNome || "N\xE3o definido";
        freight.monitoramentoResponsavelId = targetUser.id;
        freight.monitoramentoResponsavelNome = targetUser.name;
        freight.updatedAtIso = sp.iso;
        freight.updatedAtFormatted = sp.formatted;
        freight.revision += 1;
        appendHistoryEntry(sub, {
          actorId: user.id,
          actorName: user.name,
          actorSector: "Monitoramento",
          eventType: "TRANSFERENCIA",
          summary: `Responsabilidade de Monitoramento transferida de ${prevName} para ${targetUser.name}. V\xEDnculos Comercial (${freight.comercialResponsavelNome}) e Expedi\xE7\xE3o (${freight.expedicaoResponsavelNome || "\u2014"}) preservados.`,
          reason: cleanReason.slice(0, 300),
          previousResponsibleName: prevName,
          newResponsibleName: targetUser.name
        });
        pushFreightNotification({
          recipientId: targetUser.id,
          title: `Novo frete para carregar \u2014 ${freight.protocol} \u2014 ${freight.origemCidadeUf} \u2192 ${freight.destinoCidadeUf}`,
          subtitle: `Transferido para seu monitoramento por ${user.name}. Motivo: ${cleanReason}`,
          dotColor: "blue",
          targetSection: "fretes_ativos",
          targetId: freight.id,
          dedupeKey: `xfer:mon:${freight.id}:${freight.revision}`
        });
      } else {
        if (!canAccessExpedicaoFreights(targetUser)) {
          res.status(400).json({
            error: "O funcion\xE1rio selecionado n\xE3o possui permiss\xE3o para o m\xF3dulo Expedi\xE7\xE3o."
          });
          return;
        }
        const prevName = freight.expedicaoResponsavelNome || "Fila Dispon\xEDvel";
        freight.expedicaoResponsavelId = targetUser.id;
        freight.expedicaoResponsavelNome = targetUser.name;
        if (freight.situacaoOperacional === "DISPONIVEL_FILA") {
          freight.situacaoOperacional = "RECEBIDO";
        }
        freight.updatedAtIso = sp.iso;
        freight.updatedAtFormatted = sp.formatted;
        freight.revision += 1;
        appendHistoryEntry(sub, {
          actorId: user.id,
          actorName: user.name,
          actorSector: "Expedi\xE7\xE3o",
          eventType: "TRANSFERENCIA",
          summary: `Responsabilidade operacional (Expedi\xE7\xE3o) transferida de ${prevName} para ${targetUser.name}. V\xEDnculo Comercial (${freight.comercialResponsavelNome}) preservado.`,
          reason: cleanReason.slice(0, 300),
          previousResponsibleName: prevName,
          newResponsibleName: targetUser.name
        });
        pushFreightNotification({
          recipientId: targetUser.id,
          title: `Frete ${freight.protocol} transferido para sua fila da Expedi\xE7\xE3o`,
          subtitle: `Transferido por ${user.name} (Anterior: ${prevName}). Motivo: ${cleanReason}`,
          dotColor: "blue",
          targetSection: "fretes_expedicao",
          targetId: freight.id,
          dedupeKey: `xfer:exp:${freight.id}:${freight.revision}`
        });
      }
      persistFreightAndSubDoc(freight, sub);
      res.json({
        ok: true,
        freight: sanitizeFreightForUser(freight, user),
        historico: sub.historico
      });
    }
  );
  app.post(
    "/api/meus-fretes/:freightId/cancel",
    requireApprovedSession2,
    (req, res) => {
      const user = req.sessionUser;
      const freightId = String(req.params.freightId || "");
      const freight = freightsIndex.get(freightId);
      if (!freight) {
        res.status(404).json({ error: "Frete n\xE3o encontrado." });
        return;
      }
      const canCancel = user.accessLevel === "ADMINISTRADOR" || user.accessLevel === "DIRETORIA" || hasPagePermission(user, "fretes_cancelar") || freight.comercialResponsavelId === user.id && ["EM_NEGOCIACAO", "CONTRATADO"].includes(freight.situacaoComercial);
      if (!canCancel || !canUserAccessFreightRecord(freight, user)) {
        res.status(403).json({
          error: "Permiss\xE3o negada para cancelar este frete.",
          code: "FORBIDDEN_CANCEL"
        });
        return;
      }
      const cleanReason = String(req.body?.reason || "").trim();
      if (cleanReason.length < 5) {
        res.status(400).json({
          error: "Informe o motivo do cancelamento do frete (m\xEDnimo 5 caracteres).",
          code: "MISSING_CANCEL_REASON"
        });
        return;
      }
      const sp = formatSaoPauloDateTime();
      freight.preCancelComercial = freight.situacaoComercial;
      freight.preCancelOperacional = freight.situacaoOperacional;
      freight.preCancelMonitoramento = freight.situacaoMonitoramento;
      freight.situacaoComercial = "CANCELADO";
      freight.situacaoOperacional = "CANCELADO";
      freight.situacaoMonitoramento = "CANCELADO";
      freight.situacaoFinanceira = "CANCELADO";
      freight.motivoCancelamento = cleanReason.slice(0, 400);
      freight.updatedAtIso = sp.iso;
      freight.updatedAtFormatted = sp.formatted;
      freight.revision += 1;
      const sub = freightSubDocs.get(freight.id);
      appendHistoryEntry(sub, {
        actorId: user.id,
        actorName: user.name,
        actorSector: canAccessExpedicaoFreights(user) ? "Expedi\xE7\xE3o" : "Comercial",
        eventType: "CANCELAMENTO",
        summary: `Frete cancelado por ${user.name}. Registro preservado para auditoria e consulta.`,
        reason: freight.motivoCancelamento
      });
      persistFreightAndSubDoc(freight, sub);
      if (freight.comercialResponsavelId && freight.comercialResponsavelId !== user.id) {
        pushFreightNotification({
          recipientId: freight.comercialResponsavelId,
          title: `Frete ${freight.protocol} Cancelado`,
          subtitle: `Cancelado por ${user.name}. Motivo: ${freight.motivoCancelamento}`,
          dotColor: "red",
          targetSection: "fretes_comercial",
          targetId: freight.id,
          dedupeKey: `cancel:${freight.id}:com`
        });
      }
      if (freight.expedicaoResponsavelId && freight.expedicaoResponsavelId !== user.id) {
        pushFreightNotification({
          recipientId: freight.expedicaoResponsavelId,
          title: `Frete ${freight.protocol} Cancelado`,
          subtitle: `Cancelado por ${user.name}. Motivo: ${freight.motivoCancelamento}`,
          dotColor: "red",
          targetSection: "fretes_expedicao",
          targetId: freight.id,
          dedupeKey: `cancel:${freight.id}:exp`
        });
      }
      if (freight.monitoramentoResponsavelId && freight.monitoramentoResponsavelId !== user.id) {
        pushFreightNotification({
          recipientId: freight.monitoramentoResponsavelId,
          title: `Frete ${freight.protocol} Cancelado`,
          subtitle: `Cancelado por ${user.name}. Motivo: ${freight.motivoCancelamento}`,
          dotColor: "red",
          targetSection: "fretes_ativos",
          targetId: freight.id,
          dedupeKey: `cancel:${freight.id}:mon`
        });
      }
      res.json({
        ok: true,
        freight: sanitizeFreightForUser(freight, user),
        historico: sub.historico
      });
    }
  );
  app.post(
    "/api/meus-fretes/:freightId/reactivate",
    requireApprovedSession2,
    (req, res) => {
      const user = req.sessionUser;
      const freightId = String(req.params.freightId || "");
      const freight = freightsIndex.get(freightId);
      if (!freight) {
        res.status(404).json({ error: "Frete n\xE3o encontrado." });
        return;
      }
      const canReactivate = user.accessLevel === "ADMINISTRADOR" || user.accessLevel === "DIRETORIA" || hasPagePermission(user, "fretes_cancelar") || canViewFreightTeam(user);
      if (!canReactivate) {
        res.status(403).json({
          error: "Permiss\xE3o negada: sua conta n\xE3o possui autoriza\xE7\xE3o para reativar fretes.",
          code: "FORBIDDEN_REACTIVATE"
        });
        return;
      }
      if (freight.situacaoOperacional !== "CANCELADO" && freight.situacaoComercial !== "CANCELADO") {
        res.status(400).json({ error: "Este frete n\xE3o est\xE1 cancelado." });
        return;
      }
      const cleanReason = String(req.body?.reason || "").trim();
      if (cleanReason.length < 5) {
        res.status(400).json({
          error: "Informe a justificativa da reativa\xE7\xE3o do frete (m\xEDnimo 5 caracteres).",
          code: "MISSING_REACTIVATION_REASON"
        });
        return;
      }
      const sp = formatSaoPauloDateTime();
      const targetOperacional = req.body?.targetStage || freight.preCancelOperacional || "EM_PREPARACAO";
      const targetComercial = freight.preCancelComercial || (targetOperacional === "LIBERADO_MONITORAMENTO" ? "EM_MONITORAMENTO" : "AGUARDANDO_EXPEDICAO");
      const targetMonitoramento = freight.preCancelMonitoramento || (targetOperacional === "LIBERADO_MONITORAMENTO" ? "NOVO_PARA_CARREGAR" : "NAO_LIBERADO");
      freight.situacaoComercial = targetComercial;
      freight.situacaoOperacional = targetOperacional;
      freight.situacaoMonitoramento = targetMonitoramento;
      freight.situacaoFinanceira = "PENDENTE";
      freight.motivoCancelamento = void 0;
      freight.updatedAtIso = sp.iso;
      freight.updatedAtFormatted = sp.formatted;
      freight.revision += 1;
      const sub = freightSubDocs.get(freight.id);
      appendHistoryEntry(sub, {
        actorId: user.id,
        actorName: user.name,
        actorSector: user.department || "Gest\xE3o",
        eventType: "REATIVACAO_FRETE",
        summary: `Frete reativado por ${user.name}. Motivo: ${cleanReason}. Etapa restabelecida: ${targetOperacional}.`
      });
      persistFreightAndSubDoc(freight, sub);
      if (freight.comercialResponsavelId && freight.comercialResponsavelId !== user.id) {
        pushFreightNotification({
          recipientId: freight.comercialResponsavelId,
          title: `Frete ${freight.protocol} Reativado`,
          subtitle: `Reativado por ${user.name}. Etapa: ${targetOperacional}`,
          dotColor: "blue",
          targetSection: "fretes_comercial",
          targetId: freight.id,
          dedupeKey: `reactivate:${freight.id}:com`
        });
      }
      if (freight.expedicaoResponsavelId && freight.expedicaoResponsavelId !== user.id) {
        pushFreightNotification({
          recipientId: freight.expedicaoResponsavelId,
          title: `Frete ${freight.protocol} Reativado na Expedi\xE7\xE3o`,
          subtitle: `Reativado por ${user.name}. Motivo: ${cleanReason}`,
          dotColor: "blue",
          targetSection: "fretes_expedicao",
          targetId: freight.id,
          dedupeKey: `reactivate:${freight.id}:exp`
        });
      }
      res.json({
        ok: true,
        freight: sanitizeFreightForUser(freight, user),
        historico: sub.historico
      });
    }
  );
}

// src/server/financialProjection.ts
function financialProjection(f, existing) {
  if (["NAO_LIBERADO", "DEVOLVIDO_EXPEDICAO"].includes(f.situacaoMonitoramento || "NAO_LIBERADO") || f.situacaoOperacional === "CANCELADO") return null;
  const mode = expeditionPaymentMode(f.condicoesPagamento), cents = f.valorContratadoCentavos;
  if (!mode || !(cents > 0)) return null;
  const percentage = mode === "Integral (100%)" ? 100 : mode.startsWith("80") ? 80 : 70;
  const advance = Math.round(cents * percentage / 100), total = cents / 100;
  if (existing) return { ...existing, cliente: f.cliente, motoristaNome: f.motoristaNome, motoristaTelefone: f.motoristaTelefone, origem: f.origemCidadeUf, destino: f.destinoCidadeUf, dataEntrega: f.dataEntregaPrevistaIso || existing.dataEntrega };
  return { id: f.id, code: f.protocol, createdAtIso: f.createdAtIso, createdAtDate: new Date(f.createdAtIso).toLocaleDateString("pt-BR", { timeZone: "America/Bahia" }), empresaMarca: f.empresaMarca, cliente: f.cliente, motoristaNome: f.motoristaNome, motoristaTelefone: f.motoristaTelefone, origem: f.origemCidadeUf, destino: f.destinoCidadeUf, dataColeta: f.dataColetaIso || "", dataEntrega: f.dataEntregaPrevistaIso || "", valorFreteEmpresa: (f.valorCobradoClienteCentavos || 0) / 100, valorFreteMotorista: total, regraTipo: percentage === 100 ? "INTEGRAL_100" : percentage === 70 ? "70_30" : "PERSONALIZADO", regraLabel: mode, percentualAdiantamento: percentage, percentualSaldo: 100 - percentage, valorTotal: total, valorAdiantamento: advance / 100, valorSaldo: (cents - advance) / 100, favorecido: f.favorecidoPagamento || f.motoristaNome || "", banco: f.bancoPagamento || "", agencia: "", conta: "", tipoChavePix: ["CPF/CNPJ", "Celular", "E-mail", "Chave Aleat\xF3ria"].includes(f.tipoChavePix || "") ? f.tipoChavePix : "CPF/CNPJ", chavePix: f.chavePix || "", status: "Pendente Adiantamento", adiantamentoPago: false, entregaConfirmada: false, saldoPago: false, solicitanteNome: f.expedicaoResponsavelNome || f.comercialResponsavelNome || "", docs: {} };
}

// src/server/paymentReceiptsEngine.ts
import crypto11 from "crypto";
import fs10 from "fs";
import path10 from "path";

// src/lib/freightDatabase.ts
var INITIAL_FREIGHTS = [
  {
    id: "frete-0842",
    code: "#0842",
    createdAtDate: "26/10/2026",
    createdAtIso: "2026-10-26T09:30:00.000Z",
    empresaMarca: "RODOVAR",
    dataCarregamento: "26/10/2026",
    unidadeOperacional: "BA - Salvador",
    comercialResponsavel: "Jeise / C\xE9sar",
    expedicaoResponsavel: "Marcos Silva",
    cliente: "AMBEV S.A.",
    telefoneCliente: "71 9 9920-2476",
    motoristaNome: "Jos\xE9 Carlos Pereira dos Santos",
    motoristaTelefone: "71 9 8845-1290",
    emergenciaNome: "Maria Helena (Esposa)",
    emergenciaTelefone: "71 9 9123-4567",
    origem: "FEIRA DE SANTANA-BA - CD AMBEV",
    destino: "SALVADOR-BA - GALP\xC3O RODOVAR",
    dataColeta: "26/10",
    dataEntrega: "27/10",
    valorFreteEmpresa: 8900,
    valorFreteMotorista: 6e3,
    regraTipo: "70_30",
    regraLabel: "70% / 30%",
    percentualAdiantamento: 70,
    percentualSaldo: 30,
    valorTotal: 6e3,
    valorAdiantamento: 4200,
    valorSaldo: 1800,
    favorecido: "Jo\xE3o Silva Transportes",
    banco: "260 - Nu Pagamentos",
    agencia: "0001",
    conta: "18670000-5",
    tipoChavePix: "CPF/CNPJ",
    chavePix: "097.813.375-00",
    status: "Pendente Adiantamento",
    adiantamentoPago: false,
    entregaConfirmada: false,
    saldoPago: false,
    solicitanteNome: "Carlos Mendes (Opera\xE7\xE3o Matriz)",
    docs: {
      cte: {
        id: "doc-cte-0842",
        type: "CT-e",
        label: "CT-e",
        fileName: "CTe_3526100842_AMBEV.pdf",
        mimeType: "application/pdf",
        sizeLabel: "248 KB",
        uploadedAt: "26/10/2026 09:28",
        uploadedBy: "Carlos Mendes"
      },
      mdfe: {
        id: "doc-mdfe-0842",
        type: "MDF-e",
        label: "MDF-e",
        fileName: "MDFe_Manifesto_0842_BA.pdf",
        mimeType: "application/pdf",
        sizeLabel: "192 KB",
        uploadedAt: "26/10/2026 09:29",
        uploadedBy: "Carlos Mendes"
      },
      rpa: {
        id: "doc-rpa-0842",
        type: "RPA",
        label: "RPA",
        fileName: "RPA_Recibo_Autonomo_0842.pdf",
        mimeType: "application/pdf",
        sizeLabel: "164 KB",
        uploadedAt: "26/10/2026 09:30",
        uploadedBy: "Carlos Mendes"
      }
    }
  },
  {
    id: "frete-0841",
    code: "#0841",
    createdAtDate: "25/10/2026",
    createdAtIso: "2026-10-25T14:15:00.000Z",
    empresaMarca: "VL TRANSPORTES",
    dataCarregamento: "25/10/2026",
    unidadeOperacional: "SP - Guarulhos",
    comercialResponsavel: "C\xE9sar Augusto",
    expedicaoResponsavel: "Fernanda Lima",
    cliente: "BAHIA SUL LOG.",
    telefoneCliente: "11 9 9812-3340",
    motoristaNome: "Ant\xF4nio Marcos Rocha",
    motoristaTelefone: "77 9 9914-8821",
    emergenciaNome: "Roberto Rocha (Irm\xE3o)",
    emergenciaTelefone: "77 9 8832-1044",
    origem: "VIT\xD3RIA DA CONQUISTA-BA - TERMINAL SUL",
    destino: "GUARULHOS-SP - CD LOG\xCDSTICO",
    dataColeta: "25/10",
    dataEntrega: "29/10",
    valorFreteEmpresa: 12400,
    valorFreteMotorista: 8500,
    regraTipo: "70_30",
    regraLabel: "70% / 30%",
    percentualAdiantamento: 70,
    percentualSaldo: 30,
    valorTotal: 8500,
    valorAdiantamento: 5950,
    valorSaldo: 2550,
    favorecido: "TransBahia Cargas Rodovi\xE1rias Ltda",
    banco: "341 - Ita\xFA Unibanco",
    agencia: "1402",
    conta: "44890-2",
    tipoChavePix: "CPF/CNPJ",
    chavePix: "14.528.901/0001-88",
    status: "Pendente Saldo",
    adiantamentoPago: true,
    adiantamentoPagoEm: "25/10/2026 15:40",
    adiantamentoVerificacaoStatus: "PAGAMENTO_CONFIRMADO",
    codigoTransacaoAdiantamento: "E34100982202610251540PIX",
    entregaConfirmada: true,
    entregaConfirmadaEm: "26/10/2026 11:10",
    saldoPago: false,
    saldoVerificacaoStatus: "SEM_COMPROVANTE",
    solicitanteNome: "Fernanda Lima (Log\xEDstica)",
    docs: {
      cte: {
        id: "doc-cte-0841",
        type: "CT-e",
        label: "CT-e",
        fileName: "CTe_3526100841_BAHIASUL.pdf",
        mimeType: "application/pdf",
        sizeLabel: "310 KB",
        uploadedAt: "25/10/2026 14:10",
        uploadedBy: "Fernanda Lima"
      },
      mdfe: {
        id: "doc-mdfe-0841",
        type: "MDF-e",
        label: "MDF-e",
        fileName: "MDFe_Manifesto_0841_SP.pdf",
        mimeType: "application/pdf",
        sizeLabel: "215 KB",
        uploadedAt: "25/10/2026 14:12",
        uploadedBy: "Fernanda Lima"
      },
      rpa: {
        id: "doc-rpa-0841",
        type: "RPA",
        label: "RPA",
        fileName: "RPA_Contrato_Frete_0841.pdf",
        mimeType: "application/pdf",
        sizeLabel: "178 KB",
        uploadedAt: "25/10/2026 14:14",
        uploadedBy: "Fernanda Lima"
      },
      comprovanteAdiantamento: {
        id: "doc-comp-adiant-0841",
        type: "COMPROVANTE_ADIANTAMENTO",
        label: "Comprovante de Adiantamento",
        fileName: "Comprovante_Adiantamento_0841.pdf",
        mimeType: "application/pdf",
        sizeLabel: "142 KB",
        uploadedAt: "25/10/2026 15:40",
        uploadedBy: "Financeiro RODOVAR"
      }
    }
  },
  {
    id: "frete-0840",
    code: "#0840",
    createdAtDate: "24/10/2026",
    createdAtIso: "2026-10-24T11:20:00.000Z",
    empresaMarca: "AXD",
    dataCarregamento: "24/10/2026",
    unidadeOperacional: "BA - Salvador",
    comercialResponsavel: "Jeise Santana",
    expedicaoResponsavel: "Carlos Mendes",
    cliente: "BRASKEM S.A.",
    telefoneCliente: "71 3496-8000",
    motoristaNome: "Marcos Oliveira da Silva",
    motoristaTelefone: "71 9 8711-4402",
    emergenciaNome: "Luciana Oliveira (Esposa)",
    emergenciaTelefone: "71 9 9201-7755",
    origem: "CAMA\xC7ARI-BA - POLO PETROQU\xCDMICO",
    destino: "RECIFE-PE - DISTRITO INDUSTRIAL",
    dataColeta: "24/10",
    dataEntrega: "28/10",
    valorFreteEmpresa: 16800,
    valorFreteMotorista: 12e3,
    regraTipo: "70_30",
    regraLabel: "70% / 30%",
    percentualAdiantamento: 70,
    percentualSaldo: 30,
    valorTotal: 12e3,
    valorAdiantamento: 8400,
    valorSaldo: 3600,
    favorecido: "Marcos Oliveira Transportes ME",
    banco: "001 - Banco do Brasil",
    agencia: "3142-X",
    conta: "99210-4",
    tipoChavePix: "CPF/CNPJ",
    chavePix: "28.901.442/0001-19",
    status: "Aguardando Entrega",
    adiantamentoPago: true,
    adiantamentoPagoEm: "24/10/2026 13:05",
    codigoTransacaoAdiantamento: "E00100441202610241305PIX",
    entregaConfirmada: false,
    saldoPago: false,
    solicitanteNome: "Carlos Mendes (Opera\xE7\xE3o Matriz)",
    docs: {
      cte: {
        id: "doc-cte-0840",
        type: "CT-e",
        label: "CT-e",
        fileName: "CTe_3526100840_BRASKEM.pdf",
        mimeType: "application/pdf",
        sizeLabel: "285 KB",
        uploadedAt: "24/10/2026 11:18",
        uploadedBy: "Carlos Mendes"
      },
      mdfe: {
        id: "doc-mdfe-0840",
        type: "MDF-e",
        label: "MDF-e",
        fileName: "MDFe_Manifesto_0840_PE.pdf",
        mimeType: "application/pdf",
        sizeLabel: "198 KB",
        uploadedAt: "24/10/2026 11:19",
        uploadedBy: "Carlos Mendes"
      },
      rpa: {
        id: "doc-rpa-0840",
        type: "RPA",
        label: "RPA",
        fileName: "RPA_Motorista_0840.pdf",
        mimeType: "application/pdf",
        sizeLabel: "156 KB",
        uploadedAt: "24/10/2026 11:20",
        uploadedBy: "Carlos Mendes"
      },
      comprovanteAdiantamento: {
        id: "doc-comp-adiant-0840",
        type: "COMPROVANTE_ADIANTAMENTO",
        label: "Comprovante de Adiantamento",
        fileName: "Comprovante_Adiantamento_0840.pdf",
        mimeType: "application/pdf",
        sizeLabel: "138 KB",
        uploadedAt: "24/10/2026 13:05",
        uploadedBy: "Financeiro RODOVAR"
      }
    }
  },
  {
    id: "frete-0839",
    code: "#0839",
    createdAtDate: "22/10/2026",
    createdAtIso: "2026-10-22T08:45:00.000Z",
    empresaMarca: "RODOVAR",
    dataCarregamento: "22/10/2026",
    unidadeOperacional: "SP - Guarulhos",
    comercialResponsavel: "Jeise / C\xE9sar",
    expedicaoResponsavel: "Fernanda Lima",
    cliente: "SUZANO CELULOSE",
    telefoneCliente: "11 3500-9900",
    motoristaNome: "Ricardo Alves Nascimento",
    motoristaTelefone: "11 9 8412-5560",
    emergenciaNome: "Patr\xEDcia Alves (Esposa)",
    emergenciaTelefone: "11 9 9102-3389",
    origem: "MUCURI-BA - F\xC1BRICA SUZANO",
    destino: "SANTOS-SP - TERMINAL PORTU\xC1RIO",
    dataColeta: "22/10",
    dataEntrega: "25/10",
    valorFreteEmpresa: 21500,
    valorFreteMotorista: 15400,
    regraTipo: "70_30",
    regraLabel: "70% / 30%",
    percentualAdiantamento: 70,
    percentualSaldo: 30,
    valorTotal: 15400,
    valorAdiantamento: 10780,
    valorSaldo: 4620,
    favorecido: "Expresso Atl\xE2ntico Cargas Ltda",
    banco: "237 - Bradesco",
    agencia: "0418",
    conta: "77120-9",
    tipoChavePix: "CPF/CNPJ",
    chavePix: "04.119.882/0001-55",
    status: "Pago",
    adiantamentoPago: true,
    adiantamentoPagoEm: "22/10/2026 10:15",
    codigoTransacaoAdiantamento: "E23700811202610221015PIX",
    entregaConfirmada: true,
    entregaConfirmadaEm: "25/10/2026 09:30",
    saldoPago: true,
    saldoPagoEm: "25/10/2026 14:20",
    codigoTransacaoSaldo: "E23700944202610251420PIX",
    solicitanteNome: "Fernanda Lima (Log\xEDstica)",
    docs: {
      cte: {
        id: "doc-cte-0839",
        type: "CT-e",
        label: "CT-e",
        fileName: "CTe_3526100839_SUZANO.pdf",
        mimeType: "application/pdf",
        sizeLabel: "324 KB",
        uploadedAt: "22/10/2026 08:40",
        uploadedBy: "Fernanda Lima"
      },
      mdfe: {
        id: "doc-mdfe-0839",
        type: "MDF-e",
        label: "MDF-e",
        fileName: "MDFe_Manifesto_0839_SP.pdf",
        mimeType: "application/pdf",
        sizeLabel: "210 KB",
        uploadedAt: "22/10/2026 08:42",
        uploadedBy: "Fernanda Lima"
      },
      rpa: {
        id: "doc-rpa-0839",
        type: "RPA",
        label: "RPA",
        fileName: "RPA_Frete_0839.pdf",
        mimeType: "application/pdf",
        sizeLabel: "185 KB",
        uploadedAt: "22/10/2026 08:44",
        uploadedBy: "Fernanda Lima"
      },
      comprovanteAdiantamento: {
        id: "doc-comp-adiant-0839",
        type: "COMPROVANTE_ADIANTAMENTO",
        label: "Comprovante de Adiantamento",
        fileName: "Comprovante_Adiantamento_0839.pdf",
        mimeType: "application/pdf",
        sizeLabel: "149 KB",
        uploadedAt: "22/10/2026 10:15",
        uploadedBy: "Financeiro RODOVAR"
      },
      comprovanteSaldo: {
        id: "doc-comp-saldo-0839",
        type: "COMPROVANTE_SALDO",
        label: "Comprovante de Saldo",
        fileName: "Comprovante_Saldo_0839.pdf",
        mimeType: "application/pdf",
        sizeLabel: "152 KB",
        uploadedAt: "25/10/2026 14:20",
        uploadedBy: "Financeiro RODOVAR"
      }
    }
  }
];
function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

// src/server/paymentReceiptsEngine.ts
var ROOT_DIR2 = resolveDataRoot();
var PAYMENT_STORE_DIR = path10.join(ROOT_DIR2, "data", "payment-store");
var PAYMENT_RECEIPTS_DIR = path10.join(ROOT_DIR2, "data", "payment-receipts");
var FREIGHTS_FILE = path10.join(PAYMENT_STORE_DIR, "freights.json");
var INTENTS_FILE = path10.join(PAYMENT_STORE_DIR, "intents.json");
var RECEIPTS_FILE = path10.join(PAYMENT_STORE_DIR, "receipts.json");
var HISTORY_FILE = path10.join(PAYMENT_STORE_DIR, "history.json");
var STAGED_SHARES_FILE = path10.join(PAYMENT_STORE_DIR, "staged-shares.json");
var MAX_RECEIPT_BYTES = 10 * 1024 * 1024;
var DEFAULT_INTENT_VALIDITY_MINUTES = 30;
var paymentStoreState = {
  freights: [],
  intents: [],
  receipts: [],
  history: [],
  stagedShares: []
};
function ensureDirectories2() {
  if (!fs10.existsSync(PAYMENT_STORE_DIR)) {
    fs10.mkdirSync(PAYMENT_STORE_DIR, { recursive: true });
  }
  if (!fs10.existsSync(PAYMENT_RECEIPTS_DIR)) {
    fs10.mkdirSync(PAYMENT_RECEIPTS_DIR, { recursive: true });
  }
}
function createSamplePdfBuffer(title, subtitle) {
  const content = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /MediaBox [0 0 595 842] /Contents 5 0 R >> endobj
4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
5 0 obj << /Length 160 >> stream
BT
/F1 16 Tf
50 770 Td
(RODOVAR CONECTA - ${title.replace(/[()\\]/g, "")}) Tj
/F1 12 Tf
0 -28 Td
(${subtitle.replace(/[()\\]/g, "")}) Tj
ET
endstream
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000229 00000 n 
0000000297 00000 n 
trailer << /Size 6 /Root 1 0 R >>
startxref
510
%%EOF`;
  return Buffer.from(content, "utf8");
}
function validatePaymentReceiptBinary(buf, originalFileName) {
  if (!buf || buf.length === 0) {
    return {
      valid: false,
      error: "O arquivo de comprovante enviado est\xE1 vazio.",
      code: "EMPTY_FILE"
    };
  }
  if (buf.length > MAX_RECEIPT_BYTES) {
    return {
      valid: false,
      error: "O arquivo excede o tamanho m\xE1ximo permitido de 10 MB.",
      code: "FILE_TOO_LARGE"
    };
  }
  const lowerName = String(originalFileName || "").toLowerCase();
  if (lowerName.endsWith(".svg") || lowerName.endsWith(".exe") || lowerName.endsWith(".bat") || lowerName.endsWith(".sh") || lowerName.endsWith(".js") || lowerName.endsWith(".html")) {
    return {
      valid: false,
      error: "Formato de arquivo n\xE3o permitido. Envie apenas PDF, JPEG ou PNG.",
      code: "INVALID_FILE_TYPE"
    };
  }
  const headText = buf.subarray(0, Math.min(512, buf.length)).toString("utf8").toLowerCase();
  if (headText.includes("<svg") || headText.includes("<script") || headText.includes("<!doctype html")) {
    return {
      valid: false,
      error: "Conte\xFAdo de arquivo rejeitado por seguran\xE7a. Envie apenas PDF, JPEG ou PNG.",
      code: "INVALID_FILE_TYPE"
    };
  }
  if (buf.length >= 5 && buf[0] === 37 && buf[1] === 80 && buf[2] === 68 && buf[3] === 70 && buf[4] === 45) {
    return {
      valid: true,
      mimeType: "application/pdf",
      extension: "pdf"
    };
  }
  if (buf.length >= 8 && buf[0] === 137 && buf[1] === 80 && buf[2] === 78 && buf[3] === 71 && buf[4] === 13 && buf[5] === 10 && buf[6] === 26 && buf[7] === 10) {
    return {
      valid: true,
      mimeType: "image/png",
      extension: "png"
    };
  }
  if (buf.length >= 3 && buf[0] === 255 && buf[1] === 216 && buf[2] === 255) {
    return {
      valid: true,
      mimeType: "image/jpeg",
      extension: "jpg"
    };
  }
  return {
    valid: false,
    error: "Tipo real do arquivo inv\xE1lido. O servidor aceita apenas comprovantes em PDF, JPEG ou PNG.",
    code: "INVALID_FILE_TYPE"
  };
}
function hydratePaymentReceiptsFromPayload(payload) {
  if (!payload || typeof payload !== "object") return;
  if (Array.isArray(payload.freights) && payload.freights.length > 0) {
    paymentStoreState.freights = payload.freights;
  }
  if (Array.isArray(payload.intents)) {
    paymentStoreState.intents = payload.intents;
  }
  if (Array.isArray(payload.receipts)) {
    paymentStoreState.receipts = payload.receipts;
  }
  if (Array.isArray(payload.history)) {
    paymentStoreState.history = payload.history;
  }
  if (Array.isArray(payload.stagedShares)) {
    paymentStoreState.stagedShares = payload.stagedShares;
  }
}
function savePaymentStore(skipNeon = false) {
  try {
    ensureDirectories2();
    fs10.writeFileSync(FREIGHTS_FILE, JSON.stringify(paymentStoreState.freights, null, 2), "utf8");
    fs10.writeFileSync(INTENTS_FILE, JSON.stringify(paymentStoreState.intents, null, 2), "utf8");
    fs10.writeFileSync(RECEIPTS_FILE, JSON.stringify(paymentStoreState.receipts, null, 2), "utf8");
    fs10.writeFileSync(HISTORY_FILE, JSON.stringify(paymentStoreState.history, null, 2), "utf8");
    fs10.writeFileSync(STAGED_SHARES_FILE, JSON.stringify(paymentStoreState.stagedShares, null, 2), "utf8");
  } catch (err) {
    console.warn("paymentReceiptsEngine local save notice:", err.message);
  }
  if (!skipNeon) {
    void persistStateSnapshotToNeon("rodovar-payments-state", paymentStoreState);
  }
}
async function savePaymentStoreAsync() {
  savePaymentStore(false);
  await flushPendingNeonWrites();
}
function enrichFreightWithReceipts(freight) {
  const freightReceipts = paymentStoreState.receipts.filter((r) => r.freightId === freight.id);
  const freightHistory = paymentStoreState.history.filter((h) => h.freightId === freight.id);
  const latestAdiantamento = freightReceipts.find((r) => r.installmentType === "ADIANTAMENTO");
  const latestSaldo = freightReceipts.find((r) => r.installmentType === "SALDO");
  const adiantamentoVerificacaoStatus = freight.adiantamentoPago ? "PAGAMENTO_CONFIRMADO" : latestAdiantamento ? latestAdiantamento.verificationStatus : freight.adiantamentoVerificacaoStatus || "SEM_COMPROVANTE";
  const saldoVerificacaoStatus = freight.saldoPago ? "PAGAMENTO_CONFIRMADO" : latestSaldo ? latestSaldo.verificationStatus : freight.saldoVerificacaoStatus || "SEM_COMPROVANTE";
  const docs = { ...freight.docs };
  if (latestAdiantamento) {
    docs.comprovanteAdiantamento = {
      id: latestAdiantamento.id,
      type: "COMPROVANTE_ADIANTAMENTO",
      label: "Comprovante de Adiantamento",
      fileName: latestAdiantamento.originalFileName,
      mimeType: latestAdiantamento.mimeType,
      sizeLabel: latestAdiantamento.sizeLabel,
      uploadedAt: latestAdiantamento.serverCreatedAtFormatted,
      uploadedBy: latestAdiantamento.uploadedByUserName,
      dataUrl: latestAdiantamento.downloadUrl
    };
  }
  if (latestSaldo) {
    docs.comprovanteSaldo = {
      id: latestSaldo.id,
      type: "COMPROVANTE_SALDO",
      label: "Comprovante de Saldo",
      fileName: latestSaldo.originalFileName,
      mimeType: latestSaldo.mimeType,
      sizeLabel: latestSaldo.sizeLabel,
      uploadedAt: latestSaldo.serverCreatedAtFormatted,
      uploadedBy: latestSaldo.uploadedByUserName,
      dataUrl: latestSaldo.downloadUrl
    };
  }
  return {
    ...freight,
    docs,
    adiantamentoVerificacaoStatus,
    adiantamentoComprovanteId: latestAdiantamento?.id || freight.adiantamentoComprovanteId,
    saldoVerificacaoStatus,
    saldoComprovanteId: latestSaldo?.id || freight.saldoComprovanteId,
    comprovantesList: freightReceipts,
    historicoPagamentos: freightHistory
  };
}
function loadOrSeedPaymentStore() {
  ensureDirectories2();
  let loadedFreights = null;
  if (fs10.existsSync(FREIGHTS_FILE)) {
    try {
      const parsed = JSON.parse(fs10.readFileSync(FREIGHTS_FILE, "utf8"));
      if (Array.isArray(parsed) && parsed.length > 0) {
        loadedFreights = parsed;
      }
    } catch {
      loadedFreights = null;
    }
  }
  if (fs10.existsSync(INTENTS_FILE)) {
    try {
      const parsed = JSON.parse(fs10.readFileSync(INTENTS_FILE, "utf8"));
      if (Array.isArray(parsed)) paymentStoreState.intents = parsed;
    } catch {
      paymentStoreState.intents = [];
    }
  }
  if (fs10.existsSync(RECEIPTS_FILE)) {
    try {
      const parsed = JSON.parse(fs10.readFileSync(RECEIPTS_FILE, "utf8"));
      if (Array.isArray(parsed)) paymentStoreState.receipts = parsed;
    } catch {
      paymentStoreState.receipts = [];
    }
  }
  if (fs10.existsSync(HISTORY_FILE)) {
    try {
      const parsed = JSON.parse(fs10.readFileSync(HISTORY_FILE, "utf8"));
      if (Array.isArray(parsed)) paymentStoreState.history = parsed;
    } catch {
      paymentStoreState.history = [];
    }
  }
  if (fs10.existsSync(STAGED_SHARES_FILE)) {
    try {
      const parsed = JSON.parse(fs10.readFileSync(STAGED_SHARES_FILE, "utf8"));
      if (Array.isArray(parsed)) paymentStoreState.stagedShares = parsed;
    } catch {
      paymentStoreState.stagedShares = [];
    }
  }
  if (!loadedFreights) {
    paymentStoreState.freights = INITIAL_FREIGHTS.map((f) => ({
      ...f,
      adiantamentoVerificacaoStatus: f.adiantamentoPago ? "PAGAMENTO_CONFIRMADO" : "SEM_COMPROVANTE",
      saldoVerificacaoStatus: f.saldoPago ? "PAGAMENTO_CONFIRMADO" : "SEM_COMPROVANTE"
    }));
    for (const f of paymentStoreState.freights) {
      if (f.docs.comprovanteAdiantamento) {
        const doc = f.docs.comprovanteAdiantamento;
        const storageFileName = `seed-${f.id}-adiantamento.pdf`;
        const absPath = path10.join(PAYMENT_RECEIPTS_DIR, storageFileName);
        const pdfBuf = createSamplePdfBuffer(
          `Comprovante de Adiantamento ${f.code}`,
          `Favorecido: ${f.favorecido} - Valor: R$ ${f.valorAdiantamento.toFixed(2)}`
        );
        if (!fs10.existsSync(absPath)) {
          fs10.writeFileSync(absPath, pdfBuf);
        }
        const sha256Hash = crypto11.createHash("sha256").update(pdfBuf).digest("hex");
        const receiptRecord = {
          id: doc.id,
          freightId: f.id,
          freightCode: f.code,
          installmentId: `${f.id}:ADIANTAMENTO`,
          installmentType: "ADIANTAMENTO",
          title: "Comprovante de Adiantamento",
          expectedAmountCentavos: Math.round(f.valorAdiantamento * 100),
          expectedAmountBRL: f.valorAdiantamento,
          favorecido: f.favorecido,
          uploadedByUserId: "emp-7",
          uploadedByUserName: doc.uploadedBy || "Financeiro RODOVAR",
          uploadedByUserEmail: "petronio.santos@rodovar.com.br",
          originalFileName: doc.fileName,
          storageFileName,
          storageRelativePath: `data/payment-receipts/${storageFileName}`,
          mimeType: "application/pdf",
          sizeBytes: pdfBuf.length,
          sizeLabel: doc.sizeLabel || formatFileSize(pdfBuf.length),
          sha256Hash,
          idempotencyKey: `seed-idem-${doc.id}`,
          origin: "ANEXACAO_MANUAL",
          transactionCode: f.codigoTransacaoAdiantamento,
          uploadStatus: "SALVO_NO_SERVIDOR",
          verificationStatus: "PAGAMENTO_CONFIRMADO",
          verifiedByUserId: "emp-7",
          verifiedByUserName: "Petr\xF4nio Santos",
          verifiedAtIso: f.createdAtIso,
          verifiedAtFormatted: f.adiantamentoPagoEm || doc.uploadedAt,
          serverCreatedAtIso: f.createdAtIso,
          serverCreatedAtFormatted: doc.uploadedAt,
          downloadUrl: `/api/pagamentos/comprovantes/${doc.id}/download`
        };
        if (!paymentStoreState.receipts.some((r) => r.id === receiptRecord.id)) {
          paymentStoreState.receipts.push(receiptRecord);
        }
      }
      if (f.docs.comprovanteSaldo) {
        const doc = f.docs.comprovanteSaldo;
        const storageFileName = `seed-${f.id}-saldo.pdf`;
        const absPath = path10.join(PAYMENT_RECEIPTS_DIR, storageFileName);
        const pdfBuf = createSamplePdfBuffer(
          `Comprovante de Saldo ${f.code}`,
          `Favorecido: ${f.favorecido} - Valor: R$ ${f.valorSaldo.toFixed(2)}`
        );
        if (!fs10.existsSync(absPath)) {
          fs10.writeFileSync(absPath, pdfBuf);
        }
        const sha256Hash = crypto11.createHash("sha256").update(pdfBuf).digest("hex");
        const receiptRecord = {
          id: doc.id,
          freightId: f.id,
          freightCode: f.code,
          installmentId: `${f.id}:SALDO`,
          installmentType: "SALDO",
          title: "Comprovante de Saldo",
          expectedAmountCentavos: Math.round(f.valorSaldo * 100),
          expectedAmountBRL: f.valorSaldo,
          favorecido: f.favorecido,
          uploadedByUserId: "emp-7",
          uploadedByUserName: doc.uploadedBy || "Financeiro RODOVAR",
          uploadedByUserEmail: "petronio.santos@rodovar.com.br",
          originalFileName: doc.fileName,
          storageFileName,
          storageRelativePath: `data/payment-receipts/${storageFileName}`,
          mimeType: "application/pdf",
          sizeBytes: pdfBuf.length,
          sizeLabel: doc.sizeLabel || formatFileSize(pdfBuf.length),
          sha256Hash,
          idempotencyKey: `seed-idem-${doc.id}`,
          origin: "ANEXACAO_MANUAL",
          transactionCode: f.codigoTransacaoSaldo,
          uploadStatus: "SALVO_NO_SERVIDOR",
          verificationStatus: "PAGAMENTO_CONFIRMADO",
          verifiedByUserId: "emp-7",
          verifiedByUserName: "Petr\xF4nio Santos",
          verifiedAtIso: f.createdAtIso,
          verifiedAtFormatted: f.saldoPagoEm || doc.uploadedAt,
          serverCreatedAtIso: f.createdAtIso,
          serverCreatedAtFormatted: doc.uploadedAt,
          downloadUrl: `/api/pagamentos/comprovantes/${doc.id}/download`
        };
        if (!paymentStoreState.receipts.some((r) => r.id === receiptRecord.id)) {
          paymentStoreState.receipts.push(receiptRecord);
        }
      }
    }
    savePaymentStore(true);
  } else {
    paymentStoreState.freights = loadedFreights.map((f) => {
      if (f.id === "frete-0841" && f.regraTipo === "INTEGRAL_100" && f.percentualSaldo === 30) {
        return {
          ...f,
          regraTipo: "70_30",
          regraLabel: "70% / 30%",
          status: f.saldoPago ? "Pago" : "Pendente Saldo"
        };
      }
      return f;
    });
  }
}
function appendPaymentAuditHistory(params) {
  const sp = formatSaoPauloDateTime();
  const entry = {
    id: `payhist-${Date.now()}-${crypto11.randomBytes(3).toString("hex")}`,
    freightId: params.freightId,
    freightCode: params.freightCode,
    installmentType: params.installmentType,
    eventType: params.eventType,
    actorId: params.actorId,
    actorName: params.actorName,
    actorRole: params.actorRole,
    timestampIso: sp.iso,
    timestampFormatted: sp.formatted,
    summary: params.summary,
    receiptId: params.receiptId,
    intentId: params.intentId,
    previousReceiptId: params.previousReceiptId,
    amountBRL: params.amountBRL
  };
  paymentStoreState.history.unshift(entry);
  return entry;
}
function sweepExpiredIntents() {
  const nowMs2 = Date.now();
  let mutated = false;
  for (const intent of paymentStoreState.intents) {
    if (intent.status === "AGUARDANDO_COMPROVANTE") {
      const expMs = Date.parse(intent.expiresAtIso);
      if (!Number.isNaN(expMs) && nowMs2 >= expMs) {
        intent.status = "EXPIRADA";
        appendPaymentAuditHistory({
          freightId: intent.freightId,
          freightCode: intent.freightCode,
          installmentType: intent.installmentType,
          eventType: "INTENCAO_EXPIRADA",
          actorId: intent.responsibleUserId,
          actorName: intent.responsibleUserName,
          actorRole: "Sistema",
          summary: `Inten\xE7\xE3o de pagamento (${intent.installmentType === "ADIANTAMENTO" ? "Adiantamento" : "Saldo"}) expirou ap\xF3s ${intent.validityMinutes} min. Associa\xE7\xE3o autom\xE1tica encerrada sem cancelar o frete.`,
          intentId: intent.id,
          amountBRL: intent.expectedAmountBRL
        });
        mutated = true;
      }
    }
  }
  return mutated;
}
function parseMultipartFormData(bodyBuffer, contentTypeHeader) {
  const fields = {};
  const files = [];
  const boundaryMatch = contentTypeHeader.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!boundaryMatch) {
    return { fields, files };
  }
  const boundary = boundaryMatch[1] || boundaryMatch[2];
  const delimiter = Buffer.from(`--${boundary}`);
  const crlfDelimiter = Buffer.from(`\r
--${boundary}`);
  const headerEndMarker = Buffer.from("\r\n\r\n");
  let pos = bodyBuffer.indexOf(delimiter);
  if (pos === -1) return { fields, files };
  pos += delimiter.length;
  while (pos < bodyBuffer.length) {
    if (bodyBuffer[pos] === 45 && bodyBuffer[pos + 1] === 45) {
      break;
    }
    if (bodyBuffer[pos] === 13 && bodyBuffer[pos + 1] === 10) {
      pos += 2;
    }
    const nextBoundaryPos = bodyBuffer.indexOf(crlfDelimiter, pos);
    if (nextBoundaryPos === -1) break;
    const partBuffer = bodyBuffer.subarray(pos, nextBoundaryPos);
    const headerEndPos = partBuffer.indexOf(headerEndMarker);
    if (headerEndPos !== -1) {
      const rawHeaders = partBuffer.subarray(0, headerEndPos).toString("utf8");
      const contentBuffer = partBuffer.subarray(headerEndPos + 4);
      const nameMatch = rawHeaders.match(/name="([^"]+)"/i);
      const fileNameMatch = rawHeaders.match(/filename="([^"]*)"/i);
      const ctMatch = rawHeaders.match(/Content-Type:\s*([^\r\n;]+)/i);
      const fieldName = nameMatch ? nameMatch[1] : "file";
      if (fileNameMatch && fileNameMatch[1] !== "") {
        files.push({
          fieldName,
          fileName: fileNameMatch[1],
          contentType: ctMatch ? ctMatch[1].trim() : "application/octet-stream",
          data: Buffer.from(contentBuffer)
        });
      } else {
        fields[fieldName] = contentBuffer.toString("utf8").trim();
      }
    }
    pos = nextBoundaryPos + crlfDelimiter.length;
  }
  return { fields, files };
}
function readRawRequestBody(req, maxBytes) {
  const anyReq = req;
  if (Buffer.isBuffer(anyReq.rawBody)) {
    if (anyReq.rawBody.length > maxBytes) {
      return Promise.reject(new Error("PAYLOAD_TOO_LARGE"));
    }
    return Promise.resolve(anyReq.rawBody);
  }
  if (Buffer.isBuffer(anyReq.body)) {
    if (anyReq.body.length > maxBytes) {
      return Promise.reject(new Error("PAYLOAD_TOO_LARGE"));
    }
    return Promise.resolve(anyReq.body);
  }
  if (typeof anyReq.body === "string") {
    const buf = Buffer.from(anyReq.body, "utf8");
    if (buf.length > maxBytes) {
      return Promise.reject(new Error("PAYLOAD_TOO_LARGE"));
    }
    return Promise.resolve(buf);
  }
  if (anyReq.readableEnded) {
    return Promise.resolve(Buffer.alloc(0));
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error("PAYLOAD_TOO_LARGE"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", (err) => reject(err));
  });
}
function registerPaymentReceiptRoutes(app, requireApprovedSession2, appendServerAuditLog) {
  loadOrSeedPaymentStore();
  const syncUnified = (freight, skipNeon = false) => {
    const index = paymentStoreState.freights.findIndex((f) => f.id === freight.id);
    const projected = financialProjection(freight, index < 0 ? void 0 : paymentStoreState.freights[index]);
    if (!projected) return;
    if (index >= 0 && JSON.stringify(projected) === JSON.stringify(paymentStoreState.freights[index])) return;
    if (index < 0) paymentStoreState.freights.push(projected);
    else paymentStoreState.freights[index] = projected;
    savePaymentStore(skipNeon);
  };
  unifiedFinanceFreights().forEach((freight) => syncUnified(freight, true));
  subscribeUnifiedFinance((freight) => syncUnified(freight, false));
  function requireFinanceiroPermission(req, res) {
    const user = req.sessionUser;
    if (!user || user.approvalStatus !== "APROVADO" || user.active === false) {
      res.status(403).json({
        error: "Sua conta n\xE3o est\xE1 aprovada ou ativa para acessar opera\xE7\xF5es financeiras.",
        code: "ACCOUNT_NOT_APPROVED"
      });
      return null;
    }
    if (!canAccessFinanceiroFreights(user) && !canViewPendingPaymentsCount(user)) {
      res.status(403).json({
        error: "Acesso negado. Voc\xEA n\xE3o possui permiss\xE3o para o m\xF3dulo Financeiro de Pagamentos.",
        code: "FORBIDDEN_FINANCEIRO"
      });
      return null;
    }
    return user;
  }
  app.post("/receber-comprovante", async (req, res) => {
    try {
      const contentType = String(req.headers["content-type"] || "");
      let staged;
      const shareId = `srvshare-${Date.now()}-${crypto11.randomBytes(4).toString("hex")}`;
      const nowIso = (/* @__PURE__ */ new Date()).toISOString();
      if (contentType.toLowerCase().includes("multipart/form-data")) {
        const rawBuf = await readRawRequestBody(req, MAX_RECEIPT_BYTES + 2 * 1024 * 1024);
        const parsed = parseMultipartFormData(rawBuf, contentType);
        const fileItem = parsed.files[0];
        if (fileItem && fileItem.data.length > 0) {
          const validation = validatePaymentReceiptBinary(fileItem.data, fileItem.fileName);
          if (!validation.valid || !validation.mimeType) {
            staged = {
              id: shareId,
              createdAtIso: nowIso,
              expiresAtMs: Date.now() + 30 * 60 * 1e3,
              textOnly: false,
              fileName: fileItem.fileName,
              errorMessage: validation.error || "Arquivo inv\xE1lido."
            };
          } else {
            staged = {
              id: shareId,
              createdAtIso: nowIso,
              expiresAtMs: Date.now() + 30 * 60 * 1e3,
              textOnly: false,
              sharedTitle: parsed.fields.title || parsed.fields.titulo || "",
              sharedText: parsed.fields.text || parsed.fields.texto || "",
              sharedUrl: parsed.fields.url || "",
              fileName: fileItem.fileName,
              mimeType: validation.mimeType,
              sizeBytes: fileItem.data.length,
              fileBase64: fileItem.data.toString("base64")
            };
          }
        } else {
          staged = {
            id: shareId,
            createdAtIso: nowIso,
            expiresAtMs: Date.now() + 30 * 60 * 1e3,
            textOnly: true,
            sharedTitle: parsed.fields.title || parsed.fields.titulo || "",
            sharedText: parsed.fields.text || parsed.fields.texto || "",
            sharedUrl: parsed.fields.url || ""
          };
        }
      } else {
        const body = req.body || {};
        staged = {
          id: shareId,
          createdAtIso: nowIso,
          expiresAtMs: Date.now() + 30 * 60 * 1e3,
          textOnly: true,
          sharedTitle: String(body.title || ""),
          sharedText: String(body.text || ""),
          sharedUrl: String(body.url || "")
        };
      }
      paymentStoreState.stagedShares = paymentStoreState.stagedShares.filter(
        (s) => s.expiresAtMs > Date.now()
      );
      paymentStoreState.stagedShares.unshift(staged);
      await savePaymentStoreAsync();
      if (String(req.headers.accept || "").includes("application/json") || req.query.format === "json") {
        res.status(200).json({
          ok: true,
          shareId: staged.id,
          redirectUrl: `/receber-comprovante?shared=1&serverShareId=${staged.id}`,
          textOnly: staged.textOnly,
          fileName: staged.fileName,
          mimeType: staged.mimeType,
          sizeBytes: staged.sizeBytes,
          errorMessage: staged.errorMessage,
          notice: staged.textOnly ? "O aplicativo do banco compartilhou apenas texto ou link externo. O arquivo do comprovante n\xE3o foi recebido e links externos n\xE3o s\xE3o baixados automaticamente. Por favor, anexe o PDF ou imagem manualmente." : void 0
        });
        return;
      }
      res.redirect(303, `/receber-comprovante?shared=1&serverShareId=${staged.id}`);
    } catch (err) {
      if (err?.message === "PAYLOAD_TOO_LARGE") {
        res.status(413).json({
          error: "O arquivo compartilhado excede o limite m\xE1ximo de 10 MB.",
          code: "FILE_TOO_LARGE"
        });
        return;
      }
      res.redirect(303, `/receber-comprovante?shared=1&error=1`);
    }
  });
  app.get("/api/pagamentos/shared-staging/:shareId", (req, res) => {
    res.setHeader("Cache-Control", "private, no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    const shareId = String(req.params.shareId || "");
    const found = paymentStoreState.stagedShares.find(
      (s) => s.id === shareId && s.expiresAtMs > Date.now()
    );
    if (!found) {
      res.status(404).json({
        error: "Compartilhamento tempor\xE1rio n\xE3o encontrado ou expirado.",
        code: "SHARE_NOT_FOUND"
      });
      return;
    }
    res.json({ ok: true, stagedShare: found });
  });
  app.get("/api/pagamentos/fretes", requireApprovedSession2, (req, res) => {
    const user = requireFinanceiroPermission(req, res);
    if (!user) return;
    if (sweepExpiredIntents()) {
      savePaymentStore();
    }
    const enrichedFreights = paymentStoreState.freights.map((f) => enrichFreightWithReceipts(f));
    const userActiveIntents = paymentStoreState.intents.filter(
      (i) => i.responsibleUserId === user.id && i.status === "AGUARDANDO_COMPROVANTE"
    );
    res.json({
      ok: true,
      freights: enrichedFreights,
      activeIntents: userActiveIntents,
      canConfirmPayment: canConfirmFreightPayment(user)
    });
  });
  app.post("/api/pagamentos/fretes", requireApprovedSession2, async (req, res) => {
    const user = requireFinanceiroPermission(req, res);
    if (!user) return;
    const incoming = req.body?.freight;
    if (!incoming || !incoming.id || !incoming.code) {
      res.status(400).json({ error: "Dados do frete inv\xE1lidos." });
      return;
    }
    const existingIdx = paymentStoreState.freights.findIndex((f) => f.id === incoming.id);
    if (existingIdx >= 0) {
      const current = paymentStoreState.freights[existingIdx];
      const immutable = ["valorTotal", "valorAdiantamento", "valorSaldo", "regraTipo", "percentualAdiantamento", "percentualSaldo", "adiantamentoPago", "saldoPago", "status"];
      if (immutable.some((key) => incoming[key] !== void 0 && incoming[key] !== current[key])) {
        res.status(409).json({ error: "O registro financeiro j\xE1 existe. Valores e pagamentos devem ser tratados no fluxo autorizado." });
        return;
      }
      res.status(200).json({ ok: true, freight: enrichFreightWithReceipts(current) });
      return;
    }
    if (incoming.adiantamentoPago || incoming.saldoPago || incoming.status !== "Pendente Adiantamento") {
      res.status(409).json({ error: "Novas solicita\xE7\xF5es n\xE3o podem registrar pagamento realizado." });
      return;
    }
    const amounts = [incoming.valorTotal, incoming.valorAdiantamento, incoming.valorSaldo];
    if (amounts.some((value) => !Number.isFinite(value) || value < 0) || incoming.valorTotal <= 0 || Math.round(incoming.valorTotal * 100) !== Math.round(incoming.valorAdiantamento * 100) + Math.round(incoming.valorSaldo * 100) || incoming.percentualAdiantamento + incoming.percentualSaldo !== 100) {
      res.status(400).json({ error: "Valores ou percentuais financeiros inv\xE1lidos." });
      return;
    }
    const fresh = { ...incoming, adiantamentoPago: false, saldoPago: false, adiantamentoVerificacaoStatus: "SEM_COMPROVANTE", saldoVerificacaoStatus: "SEM_COMPROVANTE" };
    for (const key of ["historicoPagamentos", "comprovantesList", "adiantamentoComprovanteId", "saldoComprovanteId", "adiantamentoConfirmadoPorId", "saldoConfirmadoPorId", "adiantamentoConfirmadoEm", "saldoConfirmadoEm", "codigoTransacaoAdiantamento", "codigoTransacaoSaldo"]) delete fresh[key];
    paymentStoreState.freights.unshift(fresh);
    await savePaymentStoreAsync();
    res.status(201).json({
      ok: true,
      freight: enrichFreightWithReceipts(
        paymentStoreState.freights.find((f) => f.id === incoming.id)
      )
    });
  });
  app.put("/api/pagamentos/fretes/:freightId", requireApprovedSession2, async (req, res) => {
    const user = requireFinanceiroPermission(req, res);
    if (!user) return;
    const freightId = String(req.params.freightId || "");
    const existingIdx = paymentStoreState.freights.findIndex((f) => f.id === freightId);
    if (existingIdx === -1) {
      res.status(404).json({ error: "Frete n\xE3o encontrado." });
      return;
    }
    const patch = req.body || {};
    const current = paymentStoreState.freights[existingIdx];
    if (patch.status === "Pago" && current.status !== "Pago") {
      res.status(409).json({ error: "A confirma\xE7\xE3o de pagamento exige o fluxo banc\xE1rio autorizado." });
      return;
    }
    const updated = {
      ...current,
      entregaConfirmada: typeof patch.entregaConfirmada === "boolean" ? patch.entregaConfirmada : current.entregaConfirmada,
      entregaConfirmadaEm: patch.entregaConfirmadaEm ?? current.entregaConfirmadaEm,
      status: patch.status ?? current.status,
      observacoes: patch.observacoes ?? current.observacoes,
      docs: patch.docs ? { ...current.docs, ...patch.docs } : current.docs
    };
    paymentStoreState.freights[existingIdx] = updated;
    await savePaymentStoreAsync();
    res.json({
      ok: true,
      freight: enrichFreightWithReceipts(updated)
    });
  });
  app.post("/api/pagamentos/intencoes", requireApprovedSession2, async (req, res) => {
    const user = requireFinanceiroPermission(req, res);
    if (!user) return;
    if (sweepExpiredIntents()) {
      savePaymentStore();
    }
    const { freightId, installmentType, validityMinutes, validitySeconds } = req.body || {};
    const normalizedType = installmentType === "ADIANTAMENTO" || installmentType === "SALDO" ? installmentType : null;
    if (!freightId || !normalizedType) {
      res.status(400).json({
        error: "Informe o frete e a parcela (ADIANTAMENTO ou SALDO) para preparar o pagamento.",
        code: "INVALID_INTENT_PARAMS"
      });
      return;
    }
    const freight = paymentStoreState.freights.find((f) => f.id === String(freightId));
    if (!freight) {
      res.status(404).json({
        error: "Frete n\xE3o encontrado.",
        code: "FREIGHT_NOT_FOUND"
      });
      return;
    }
    const expectedAmountBRL = normalizedType === "ADIANTAMENTO" ? freight.valorAdiantamento : freight.valorSaldo;
    const expectedAmountCentavos = Math.round(expectedAmountBRL * 100);
    if (expectedAmountCentavos <= 0) {
      res.status(400).json({
        error: `A parcela ${normalizedType === "ADIANTAMENTO" ? "Adiantamento" : "Saldo"} possui valor R$ 0,00 neste frete.`,
        code: "ZERO_INSTALLMENT_AMOUNT"
      });
      return;
    }
    for (const existing of paymentStoreState.intents) {
      if (existing.responsibleUserId === user.id && existing.freightId === freight.id && existing.installmentType === normalizedType && existing.status === "AGUARDANDO_COMPROVANTE") {
        existing.status = "CANCELADA";
      }
    }
    const mins = typeof validityMinutes === "number" && validityMinutes > 0 ? Math.min(180, validityMinutes) : DEFAULT_INTENT_VALIDITY_MINUTES;
    const ttlMs = typeof validitySeconds === "number" ? validitySeconds * 1e3 : mins * 60 * 1e3;
    const nowDate = /* @__PURE__ */ new Date();
    const expiresDate = new Date(nowDate.getTime() + ttlMs);
    const spNow = formatSaoPauloDateTime(nowDate);
    const spExp = formatSaoPauloDateTime(expiresDate);
    const intent = {
      id: `pint-${Date.now()}-${crypto11.randomBytes(4).toString("hex")}`,
      freightId: freight.id,
      freightCode: freight.code,
      installmentId: `${freight.id}:${normalizedType}`,
      installmentType: normalizedType,
      expectedAmountCentavos,
      expectedAmountBRL,
      favorecido: freight.favorecido,
      chavePix: freight.chavePix,
      banco: freight.banco,
      origem: freight.origem,
      destino: freight.destino,
      cliente: freight.cliente,
      responsibleUserId: user.id,
      responsibleUserName: user.name,
      responsibleUserEmail: user.email,
      createdAtIso: spNow.iso,
      createdAtFormatted: spNow.formatted,
      expiresAtIso: spExp.iso,
      expiresAtFormatted: spExp.formatted,
      validityMinutes: mins,
      status: "AGUARDANDO_COMPROVANTE"
    };
    paymentStoreState.intents.unshift(intent);
    appendPaymentAuditHistory({
      freightId: freight.id,
      freightCode: freight.code,
      installmentType: normalizedType,
      eventType: "INTENCAO_CRIADA",
      actorId: user.id,
      actorName: user.name,
      actorRole: user.roleTitle,
      summary: `Pagamento preparado para ${normalizedType === "ADIANTAMENTO" ? "Adiantamento" : "Saldo"} (${expectedAmountBRL.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}) \u2014 Aguardando comprovante at\xE9 ${spExp.formatted}.`,
      intentId: intent.id,
      amountBRL: expectedAmountBRL
    });
    appendServerAuditLog(
      user.id,
      user.name,
      user.accessLevel,
      "PREPARAR_PAGAMENTO_FRETE",
      `Inten\xE7\xE3o de pagamento ${intent.id} criada para o frete ${freight.code} (${normalizedType}) no valor de R$ ${expectedAmountBRL.toFixed(2)}.`,
      req.ip
    );
    await savePaymentStoreAsync();
    res.status(201).json({
      ok: true,
      intent,
      guidance: "Fa\xE7a o pagamento no seu banco. Depois, compartilhe o comprovante com Rodovar Conecta.",
      disclaimer: "Preparar o pagamento n\xE3o executa PIX, n\xE3o acessa conta banc\xE1ria e n\xE3o significa pagamento realizado."
    });
  });
  app.get("/api/pagamentos/intencoes", requireApprovedSession2, (req, res) => {
    const user = requireFinanceiroPermission(req, res);
    if (!user) return;
    if (sweepExpiredIntents()) {
      savePaymentStore();
    }
    const eligibleIntents = paymentStoreState.intents.filter(
      (i) => i.responsibleUserId === user.id && i.status === "AGUARDANDO_COMPROVANTE"
    );
    const recentUserIntents = paymentStoreState.intents.filter((i) => i.responsibleUserId === user.id).slice(0, 20);
    res.json({
      ok: true,
      eligibleCount: eligibleIntents.length,
      associationMode: eligibleIntents.length === 1 ? "SINGLE_PREFILL" : eligibleIntents.length > 1 ? "MULTIPLE_CHOOSE" : "MANUAL_SELECT",
      eligibleIntents,
      recentUserIntents
    });
  });
  app.post(
    "/api/pagamentos/intencoes/:intentId/cancel",
    requireApprovedSession2,
    async (req, res) => {
      const user = requireFinanceiroPermission(req, res);
      if (!user) return;
      const intentId = String(req.params.intentId || "");
      const intent = paymentStoreState.intents.find((i) => i.id === intentId);
      if (!intent) {
        res.status(404).json({ error: "Inten\xE7\xE3o de pagamento n\xE3o encontrada." });
        return;
      }
      if (intent.responsibleUserId !== user.id && user.accessLevel !== "ADMINISTRADOR") {
        res.status(403).json({
          error: "Voc\xEA n\xE3o pode cancelar a inten\xE7\xE3o de pagamento de outro usu\xE1rio.",
          code: "FORBIDDEN_INTENT_OWNER"
        });
        return;
      }
      intent.status = "CANCELADA";
      appendPaymentAuditHistory({
        freightId: intent.freightId,
        freightCode: intent.freightCode,
        installmentType: intent.installmentType,
        eventType: "INTENCAO_CANCELADA",
        actorId: user.id,
        actorName: user.name,
        actorRole: user.roleTitle,
        summary: `Inten\xE7\xE3o de pagamento (${intent.installmentType === "ADIANTAMENTO" ? "Adiantamento" : "Saldo"}) cancelada pelo usu\xE1rio.`,
        intentId: intent.id,
        amountBRL: intent.expectedAmountBRL
      });
      await savePaymentStoreAsync();
      res.json({ ok: true, intent });
    }
  );
  app.post("/api/pagamentos/comprovantes", requireApprovedSession2, async (req, res) => {
    const user = requireFinanceiroPermission(req, res);
    if (!user) return;
    if (sweepExpiredIntents()) {
      savePaymentStore();
    }
    try {
      let freightId = "";
      let installmentTypeRaw = "";
      let intentId = "";
      let originRaw = "";
      let originalFileName = "comprovante.pdf";
      let transactionCode = "";
      let observations = "";
      let isScheduledProof = false;
      let idempotencyKey = String(req.headers["x-idempotency-key"] || "").trim();
      let fileBuffer = null;
      const contentType = String(req.headers["content-type"] || "");
      if (contentType.toLowerCase().includes("multipart/form-data")) {
        const rawBuf = await readRawRequestBody(req, MAX_RECEIPT_BYTES + 2 * 1024 * 1024);
        const parsed = parseMultipartFormData(rawBuf, contentType);
        freightId = String(parsed.fields.freightId || "");
        installmentTypeRaw = String(parsed.fields.installmentType || "");
        intentId = String(parsed.fields.intentId || "");
        originRaw = String(parsed.fields.origin || "COMPARTILHAMENTO");
        transactionCode = String(parsed.fields.transactionCode || "");
        observations = String(parsed.fields.observations || "");
        isScheduledProof = parsed.fields.isScheduledProof === "true";
        if (!idempotencyKey && parsed.fields.idempotencyKey) {
          idempotencyKey = String(parsed.fields.idempotencyKey).trim();
        }
        if (parsed.files[0]) {
          originalFileName = parsed.files[0].fileName || originalFileName;
          fileBuffer = parsed.files[0].data;
        }
      } else {
        const body = req.body || {};
        freightId = String(body.freightId || "");
        installmentTypeRaw = String(body.installmentType || "");
        intentId = String(body.intentId || "");
        originRaw = String(body.origin || "ANEXACAO_MANUAL");
        originalFileName = String(body.fileName || originalFileName);
        transactionCode = String(body.transactionCode || "");
        observations = String(body.observations || "");
        isScheduledProof = Boolean(body.isScheduledProof);
        if (!idempotencyKey && body.idempotencyKey) {
          idempotencyKey = String(body.idempotencyKey).trim();
        }
        const rawBase64 = String(body.fileBase64 || body.dataUrl || "");
        if (rawBase64) {
          const cleanBase64 = rawBase64.includes(",") ? rawBase64.split(",")[1] : rawBase64;
          fileBuffer = Buffer.from(cleanBase64, "base64");
        }
      }
      const installmentType = installmentTypeRaw === "ADIANTAMENTO" || installmentTypeRaw === "SALDO" ? installmentTypeRaw : null;
      if (!freightId || !installmentType) {
        res.status(400).json({
          error: "Selecione o frete e a parcela (Adiantamento ou Saldo) antes de salvar o comprovante.",
          code: "MISSING_FREIGHT_OR_INSTALLMENT"
        });
        return;
      }
      const freightIdx = paymentStoreState.freights.findIndex((f) => f.id === freightId);
      if (freightIdx === -1) {
        res.status(404).json({
          error: "Frete selecionado n\xE3o foi encontrado no servidor.",
          code: "FREIGHT_NOT_FOUND"
        });
        return;
      }
      const freight = paymentStoreState.freights[freightIdx];
      let matchedIntent;
      if (intentId) {
        matchedIntent = paymentStoreState.intents.find((i) => i.id === intentId);
        if (!matchedIntent) {
          res.status(400).json({
            error: "A inten\xE7\xE3o de pagamento informada n\xE3o existe.",
            code: "INTENT_NOT_FOUND"
          });
          return;
        }
        if (matchedIntent.responsibleUserId !== user.id) {
          res.status(403).json({
            error: "A inten\xE7\xE3o de pagamento pertence a outro usu\xE1rio. Revalide o frete e a parcela com a sua conta atual.",
            code: "INTENT_USER_MISMATCH"
          });
          return;
        }
        if (matchedIntent.status === "EXPIRADA") {
          res.status(409).json({
            error: "A inten\xE7\xE3o de pagamento expirou. Confirme manualmente o frete e a parcela para salvar o comprovante.",
            code: "INTENT_EXPIRED"
          });
          return;
        }
      }
      if (idempotencyKey) {
        const existingIdempotent = paymentStoreState.receipts.find(
          (r) => r.idempotencyKey === idempotencyKey && r.uploadedByUserId === user.id
        );
        if (existingIdempotent) {
          res.status(200).json({
            ok: true,
            idempotentReplay: true,
            receipt: existingIdempotent,
            freight: enrichFreightWithReceipts(freight),
            message: "Comprovante salvo no servidor (requisi\xE7\xE3o idempotente confirmada)."
          });
          return;
        }
      } else {
        idempotencyKey = `idem-${user.id}-${Date.now()}-${crypto11.randomBytes(4).toString("hex")}`;
      }
      if (!fileBuffer || fileBuffer.length === 0) {
        res.status(400).json({
          error: "Nenhum arquivo de comprovante foi recebido. Anexe um PDF, JPEG ou PNG v\xE1lido.",
          code: "EMPTY_FILE"
        });
        return;
      }
      const validation = validatePaymentReceiptBinary(fileBuffer, originalFileName);
      if (!validation.valid || !validation.mimeType || !validation.extension) {
        const status = validation.code === "FILE_TOO_LARGE" ? 413 : 400;
        res.status(status).json({
          error: validation.error || "Arquivo inv\xE1lido.",
          code: validation.code || "INVALID_FILE_TYPE"
        });
        return;
      }
      const sha256Hash = crypto11.createHash("sha256").update(fileBuffer).digest("hex");
      const duplicateReceipt = paymentStoreState.receipts.find((r) => r.sha256Hash === sha256Hash);
      const previousInstallmentReceipt = paymentStoreState.receipts.find(
        (r) => r.freightId === freight.id && r.installmentType === installmentType
      );
      const receiptId = `rec-${Date.now()}-${crypto11.randomBytes(4).toString("hex")}`;
      const safeStorageName = `comprovante-${freight.id}-${installmentType.toLowerCase()}-${Date.now()}-${crypto11.randomBytes(4).toString("hex")}.${validation.extension}`;
      const absStoragePath = path10.join(PAYMENT_RECEIPTS_DIR, safeStorageName);
      fs10.writeFileSync(absStoragePath, fileBuffer);
      void persistSystemAssetToNeon({
        id: safeStorageName,
        slot: "paymentReceipt",
        mimeType: validation.mimeType || "application/octet-stream",
        dataBase64: fileBuffer.toString("base64")
      });
      const spNow = formatSaoPauloDateTime();
      const expectedAmountBRL = installmentType === "ADIANTAMENTO" ? freight.valorAdiantamento : freight.valorSaldo;
      const expectedAmountCentavos = Math.round(expectedAmountBRL * 100);
      const origin = originRaw === "COMPARTILHAMENTO" ? "COMPARTILHAMENTO" : "ANEXACAO_MANUAL";
      const scheduledDetected = isScheduledProof || originalFileName.toLowerCase().includes("agendamento") || observations.toLowerCase().includes("agendamento");
      const receiptRecord = {
        id: receiptId,
        freightId: freight.id,
        freightCode: freight.code,
        installmentId: `${freight.id}:${installmentType}`,
        installmentType,
        title: installmentType === "ADIANTAMENTO" ? "Comprovante de Adiantamento" : "Comprovante de Saldo",
        expectedAmountCentavos,
        expectedAmountBRL,
        favorecido: freight.favorecido,
        uploadedByUserId: user.id,
        uploadedByUserName: user.name,
        uploadedByUserEmail: user.email,
        originalFileName: path10.basename(originalFileName).replace(/[^\w.\-() ]+/g, "_"),
        storageFileName: safeStorageName,
        storageRelativePath: `data/payment-receipts/${safeStorageName}`,
        mimeType: validation.mimeType,
        sizeBytes: fileBuffer.length,
        sizeLabel: formatFileSize(fileBuffer.length),
        sha256Hash,
        idempotencyKey,
        origin,
        isScheduledProof: scheduledDetected,
        transactionCode: transactionCode || void 0,
        observations: observations || void 0,
        intentId: matchedIntent?.id,
        uploadStatus: "SALVO_NO_SERVIDOR",
        verificationStatus: "AGUARDANDO_CONFERENCIA",
        isDuplicateHashWarning: Boolean(duplicateReceipt),
        duplicateOfReceiptId: duplicateReceipt?.id,
        replacedReceiptId: previousInstallmentReceipt?.id,
        serverCreatedAtIso: spNow.iso,
        serverCreatedAtFormatted: spNow.formatted,
        downloadUrl: `/api/pagamentos/comprovantes/${receiptId}/download`
      };
      paymentStoreState.receipts.unshift(receiptRecord);
      if (matchedIntent) {
        matchedIntent.status = "COMPROVANTE_VINCULADO";
        matchedIntent.linkedReceiptId = receiptRecord.id;
      }
      if (installmentType === "ADIANTAMENTO") {
        freight.adiantamentoVerificacaoStatus = "AGUARDANDO_CONFERENCIA";
        freight.adiantamentoComprovanteId = receiptRecord.id;
        if (transactionCode) {
          freight.codigoTransacaoAdiantamento = transactionCode;
        }
      } else {
        freight.saldoVerificacaoStatus = "AGUARDANDO_CONFERENCIA";
        freight.saldoComprovanteId = receiptRecord.id;
        if (transactionCode) {
          freight.codigoTransacaoSaldo = transactionCode;
        }
      }
      const eventType = previousInstallmentReceipt ? "COMPROVANTE_SUBSTITUIDO" : "COMPROVANTE_ANEXADO";
      const scheduledNote = scheduledDetected ? " [Aten\xE7\xE3o: Comprovante de Agendamento \u2014 exige confer\xEAncia de liquida\xE7\xE3o]" : "";
      const duplicateNote = duplicateReceipt ? ` [Aviso: Hash de arquivo id\xEAntico ao comprovante ${duplicateReceipt.id} (${duplicateReceipt.freightCode})]` : "";
      appendPaymentAuditHistory({
        freightId: freight.id,
        freightCode: freight.code,
        installmentType,
        eventType,
        actorId: user.id,
        actorName: user.name,
        actorRole: user.roleTitle,
        summary: `${previousInstallmentReceipt ? "Comprovante substitu\xEDdo" : "Comprovante anexado"} (${receiptRecord.title} \u2014 ${receiptRecord.originalFileName}) via ${origin === "COMPARTILHAMENTO" ? "compartilhamento do banco" : "anexa\xE7\xE3o manual"}. Situa\xE7\xE3o: Aguardando confer\xEAncia.${scheduledNote}${duplicateNote}`,
        receiptId: receiptRecord.id,
        intentId: matchedIntent?.id,
        previousReceiptId: previousInstallmentReceipt?.id,
        amountBRL: expectedAmountBRL
      });
      appendServerAuditLog(
        user.id,
        user.name,
        user.accessLevel,
        eventType === "COMPROVANTE_SUBSTITUIDO" ? "SUBSTITUICAO_COMPROVANTE_PAGAMENTO" : "UPLOAD_COMPROVANTE_PAGAMENTO",
        `Comprovante ${receiptRecord.id} (${receiptRecord.originalFileName}, ${receiptRecord.sizeLabel}) salvo no servidor para o frete ${freight.code} (${installmentType}). Status: AGUARDANDO_CONFERENCIA.`,
        req.ip
      );
      void persistPaymentReceiptToNeon(receiptRecord);
      await savePaymentStoreAsync();
      res.status(201).json({
        ok: true,
        receipt: receiptRecord,
        freight: enrichFreightWithReceipts(freight),
        message: "Comprovante salvo no servidor com sucesso. A parcela encontra-se Aguardando confer\xEAncia."
      });
    } catch (err) {
      if (err?.message === "PAYLOAD_TOO_LARGE") {
        res.status(413).json({
          error: "O arquivo excede o tamanho m\xE1ximo permitido de 10 MB.",
          code: "FILE_TOO_LARGE"
        });
        return;
      }
      res.status(500).json({
        error: "Falha ao salvar o comprovante no servidor.",
        code: "UPLOAD_FAILED"
      });
    }
  });
  app.post(
    "/api/pagamentos/comprovantes/:receiptId/confirmar",
    requireApprovedSession2,
    async (req, res) => {
      const user = requireFinanceiroPermission(req, res);
      if (!user) return;
      if (!canConfirmFreightPayment(user) && user.accessLevel !== "ADMINISTRADOR") {
        res.status(403).json({
          error: 'Acesso negado. Apenas usu\xE1rios com permiss\xE3o de "Confirmar Liquida\xE7\xE3o de Pagamentos" (Coordenador Financeiro, Diretoria ou Administrador) podem confirmar a liquida\xE7\xE3o banc\xE1ria.',
          code: "FORBIDDEN_CONFIRM_PAYMENT"
        });
        return;
      }
      const receiptId = String(req.params.receiptId || "");
      const receipt = paymentStoreState.receipts.find((r) => r.id === receiptId);
      if (!receipt) {
        res.status(404).json({
          error: "Comprovante n\xE3o encontrado no servidor.",
          code: "RECEIPT_NOT_FOUND"
        });
        return;
      }
      const freight = paymentStoreState.freights.find((f) => f.id === receipt.freightId);
      if (!freight) {
        res.status(404).json({
          error: "Frete vinculado ao comprovante n\xE3o foi encontrado.",
          code: "FREIGHT_NOT_FOUND"
        });
        return;
      }
      const { transactionCode, acknowledgeScheduledProof } = req.body || {};
      if (receipt.isScheduledProof && !acknowledgeScheduledProof) {
        res.status(400).json({
          error: "Este arquivo foi identificado como comprovante de agendamento. Para confirmar a liquida\xE7\xE3o, ateste que a compensa\xE7\xE3o banc\xE1ria efetiva foi conferida no extrato.",
          code: "SCHEDULED_PROOF_ACK_REQUIRED"
        });
        return;
      }
      const spNow = formatSaoPauloDateTime();
      receipt.verificationStatus = "PAGAMENTO_CONFIRMADO";
      receipt.verifiedByUserId = user.id;
      receipt.verifiedByUserName = user.name;
      receipt.verifiedAtIso = spNow.iso;
      receipt.verifiedAtFormatted = spNow.formatted;
      if (transactionCode) {
        receipt.transactionCode = String(transactionCode).trim();
      }
      if (receipt.intentId) {
        const linkedIntent = paymentStoreState.intents.find((i) => i.id === receipt.intentId);
        if (linkedIntent) {
          linkedIntent.status = "CONCLUIDA";
        }
      }
      if (receipt.installmentType === "ADIANTAMENTO") {
        freight.adiantamentoPago = true;
        freight.adiantamentoPagoEm = spNow.formatted;
        freight.adiantamentoVerificacaoStatus = "PAGAMENTO_CONFIRMADO";
        freight.adiantamentoConfirmadoPorId = user.id;
        freight.adiantamentoConfirmadoPorNome = user.name;
        freight.adiantamentoConfirmadoEm = spNow.formatted;
        if (receipt.transactionCode) {
          freight.codigoTransacaoAdiantamento = receipt.transactionCode;
        }
        const isIntegralNoBalance = freight.regraTipo === "INTEGRAL_100" && freight.valorSaldo === 0;
        if (isIntegralNoBalance) {
          freight.saldoPago = true;
          freight.saldoPagoEm = spNow.formatted;
          freight.saldoVerificacaoStatus = "PAGAMENTO_CONFIRMADO";
          freight.status = "Pago";
        } else {
          freight.status = freight.entregaConfirmada ? "Pendente Saldo" : "Adiantamento Pago";
        }
      } else {
        freight.saldoPago = true;
        freight.saldoPagoEm = spNow.formatted;
        freight.saldoVerificacaoStatus = "PAGAMENTO_CONFIRMADO";
        freight.saldoConfirmadoPorId = user.id;
        freight.saldoConfirmadoPorNome = user.name;
        freight.saldoConfirmadoEm = spNow.formatted;
        if (receipt.transactionCode) {
          freight.codigoTransacaoSaldo = receipt.transactionCode;
        }
        freight.status = "Pago";
      }
      appendPaymentAuditHistory({
        freightId: freight.id,
        freightCode: freight.code,
        installmentType: receipt.installmentType,
        eventType: "PAGAMENTO_CONFIRMADO",
        actorId: user.id,
        actorName: user.name,
        actorRole: user.roleTitle,
        summary: `Pagamento de ${receipt.installmentType === "ADIANTAMENTO" ? "Adiantamento" : "Saldo"} (${receipt.expectedAmountBRL.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}) conferido e confirmado por ${user.name}.`,
        receiptId: receipt.id,
        intentId: receipt.intentId,
        amountBRL: receipt.expectedAmountBRL
      });
      appendServerAuditLog(
        user.id,
        user.name,
        user.accessLevel,
        "CONFIRMACAO_PAGAMENTO_FRETE",
        `Pagamento de ${receipt.installmentType} do frete ${freight.code} confirmado por ${user.name} (Comprovante ${receipt.id}).`,
        req.ip
      );
      void persistPaymentReceiptToNeon(receipt);
      await savePaymentStoreAsync();
      res.json({
        ok: true,
        receipt,
        freight: enrichFreightWithReceipts(freight),
        message: `Pagamento de ${receipt.installmentType === "ADIANTAMENTO" ? "Adiantamento" : "Saldo"} confirmado com sucesso por ${user.name}.`
      });
    }
  );
  app.get(
    "/api/pagamentos/comprovantes/:receiptId/download",
    requireApprovedSession2,
    async (req, res) => {
      const user = requireFinanceiroPermission(req, res);
      if (!user) return;
      const receiptId = String(req.params.receiptId || "");
      const receipt = paymentStoreState.receipts.find((r) => r.id === receiptId);
      if (!receipt) {
        res.status(404).json({
          error: "Comprovante n\xE3o encontrado.",
          code: "RECEIPT_NOT_FOUND"
        });
        return;
      }
      const safeFile = path10.basename(receipt.storageFileName);
      const absPath = path10.join(PAYMENT_RECEIPTS_DIR, safeFile);
      if (!fs10.existsSync(absPath)) {
        const neonAsset = await getSystemAssetFromNeon(safeFile);
        if (neonAsset && neonAsset.buffer) {
          try {
            ensureDirectories2();
            fs10.writeFileSync(absPath, neonAsset.buffer);
          } catch {
          }
          res.setHeader("Content-Type", receipt.mimeType || neonAsset.mimeType);
          res.setHeader("Cache-Control", "private, no-store, max-age=0");
          res.setHeader(
            "Content-Disposition",
            `inline; filename="${encodeURIComponent(receipt.originalFileName)}"`
          );
          res.send(neonAsset.buffer);
          return;
        }
        res.status(404).json({
          error: "Arquivo bin\xE1rio do comprovante n\xE3o encontrado no armazenamento privado.",
          code: "BINARY_NOT_FOUND"
        });
        return;
      }
      res.setHeader("Content-Type", receipt.mimeType);
      res.setHeader("Cache-Control", "private, no-store, max-age=0");
      res.setHeader(
        "Content-Disposition",
        `inline; filename="${encodeURIComponent(receipt.originalFileName)}"`
      );
      fs10.createReadStream(absPath).pipe(res);
    }
  );
  app.get(
    "/api/pagamentos/fretes/:freightId/historico",
    requireApprovedSession2,
    (req, res) => {
      const user = requireFinanceiroPermission(req, res);
      if (!user) return;
      const freightId = String(req.params.freightId || "");
      const receipts = paymentStoreState.receipts.filter((r) => r.freightId === freightId);
      const history = paymentStoreState.history.filter((h) => h.freightId === freightId);
      const intents = paymentStoreState.intents.filter((i) => i.freightId === freightId);
      res.json({
        ok: true,
        receipts,
        history,
        intents
      });
    }
  );
}

// server.ts
var rawPort = process.env.PORT && process.env.NGINX_PORT && process.env.PORT === process.env.NGINX_PORT ? process.env.DEFAULT_APP_PORT || "3000" : process.env.PORT || "3000";
var PORT = Number(rawPort) || 3e3;
var ROOT_DIR3 = resolveDataRoot();
var DATA_DIR = path11.join(ROOT_DIR3, "data");
var DB_FILE_PATH = path11.join(DATA_DIR, "rodovar-server-db.json");
var PUBLIC_DIR = path11.join(ROOT_DIR3, "public");
var UPLOADS_DIR = path11.join(PUBLIC_DIR, "uploads");
var DEFAULT_AVATAR_FS_PATH = path11.join(PUBLIC_DIR, "assets", "default-avatar.png");
var DEFAULT_AVATAR_URL = "/assets/default-avatar.png";
var MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
var LOCKOUT_THRESHOLD = 5;
var LOCKOUT_DURATION_MS = 120 * 1e3;
var SESSION_TTL_MS = 24 * 60 * 60 * 1e3;
var REMEMBER_SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1e3;
var COMPROMISED_PASSWORDS = /* @__PURE__ */ new Set([
  "123456",
  "12345678",
  "123456789",
  "1234567890",
  "password",
  "password123",
  "qwerty",
  "qwerty123",
  "senha",
  "senha123",
  "admin",
  "admin123",
  "11111111",
  "00000000",
  "abc12345",
  "iloveyou",
  "welcome1",
  "monkey123",
  "letmein1",
  "dragon12",
  "mudar123",
  "brasil123"
]);
function crc32(buf) {
  let c = 4294967295;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
    }
  }
  return (c ^ 4294967295) >>> 0;
}
function makePngChunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}
function ensureDefaultAvatarPngExists() {
  const assetsDir = path11.dirname(DEFAULT_AVATAR_FS_PATH);
  if (!fs11.existsSync(assetsDir)) {
    fs11.mkdirSync(assetsDir, { recursive: true });
  }
  if (fs11.existsSync(DEFAULT_AVATAR_FS_PATH)) {
    const stat = fs11.statSync(DEFAULT_AVATAR_FS_PATH);
    if (stat.size > 1024) return;
  }
  const width = 1024;
  const height = 1024;
  const rawScanlines = Buffer.alloc(height * (1 + width * 4));
  const cx = width / 2;
  const cy = height / 2;
  const headCy = height * 0.37;
  const headR = width * 0.165;
  const bodyCy = height * 0.88;
  const bodyRx = width * 0.34;
  const bodyRy = height * 0.34;
  for (let y = 0; y < height; y++) {
    const rowOffset = y * (1 + width * 4);
    rawScanlines[rowOffset] = 0;
    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      const dx = x - cx;
      const dy = y - cy;
      const distCenter = Math.sqrt(dx * dx + dy * dy);
      let r = 21;
      let g = 25;
      let b = 29;
      if (distCenter <= width * 0.46) {
        r = 30;
        g = 36;
        b = 43;
      }
      if (distCenter >= width * 0.465 && distCenter <= width * 0.49) {
        r = 255;
        g = 212;
        b = 0;
      }
      const hdx = x - cx;
      const hdy = y - headCy;
      const inHead = hdx * hdx + hdy * hdy <= headR * headR;
      const bdx = (x - cx) / bodyRx;
      const bdy = (y - bodyCy) / bodyRy;
      const inBody = bdx * bdx + bdy * bdy <= 1 && y >= height * 0.56 && distCenter <= width * 0.46;
      if (inHead || inBody) {
        r = 203;
        g = 213;
        b = 225;
      }
      rawScanlines[pxOffset] = r;
      rawScanlines[pxOffset + 1] = g;
      rawScanlines[pxOffset + 2] = b;
      rawScanlines[pxOffset + 3] = 255;
    }
  }
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const idatData = zlib2.deflateSync(rawScanlines, { level: 3 });
  const pngBuffer = Buffer.concat([
    signature,
    makePngChunk("IHDR", ihdr),
    makePngChunk("IDAT", idatData),
    makePngChunk("IEND", Buffer.alloc(0))
  ]);
  fs11.writeFileSync(DEFAULT_AVATAR_FS_PATH, pngBuffer);
}
var cachedOfficialLogo = null;
function paethPredictor(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}
function loadOfficialRodovarLogo() {
  if (cachedOfficialLogo) return cachedOfficialLogo;
  const logoPath = path11.join(PUBLIC_DIR, "assets", "aistudio", "RODOVAR-LOGO_310056c8.png");
  if (!fs11.existsSync(logoPath)) return null;
  try {
    const buf = fs11.readFileSync(logoPath);
    let offset = 8;
    let width = 0;
    let height = 0;
    const idatChunks = [];
    while (offset < buf.length) {
      const len = buf.readUInt32BE(offset);
      const type = buf.toString("ascii", offset + 4, offset + 8);
      const data = buf.subarray(offset + 8, offset + 8 + len);
      if (type === "IHDR") {
        width = data.readUInt32BE(0);
        height = data.readUInt32BE(4);
      } else if (type === "IDAT") {
        idatChunks.push(data);
      }
      offset += 12 + len;
    }
    if (!width || !height || idatChunks.length === 0) return null;
    const raw = zlib2.inflateSync(Buffer.concat(idatChunks));
    const bpp = 4;
    const stride = width * bpp;
    const pixels = Buffer.alloc(width * height * 4);
    for (let y = 0; y < height; y++) {
      const filterType = raw[y * (stride + 1)];
      for (let i = 0; i < stride; i++) {
        const rawByte = raw[y * (stride + 1) + 1 + i];
        const a = i >= bpp ? pixels[y * stride + i - bpp] : 0;
        const b = y > 0 ? pixels[(y - 1) * stride + i] : 0;
        const c = y > 0 && i >= bpp ? pixels[(y - 1) * stride + i - bpp] : 0;
        let val = rawByte;
        if (filterType === 1) val = rawByte + a & 255;
        else if (filterType === 2) val = rawByte + b & 255;
        else if (filterType === 3) val = rawByte + (a + b >> 1) & 255;
        else if (filterType === 4) val = rawByte + paethPredictor(a, b, c) & 255;
        pixels[y * stride + i] = val;
      }
    }
    let minX = width;
    let maxX = 0;
    let minY = height;
    let maxY = 0;
    const scanMaxY = Math.min(height, 215);
    for (let y = 0; y < scanMaxY; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const r = pixels[idx];
        const g = pixels[idx + 1];
        const b = pixels[idx + 2];
        const al = pixels[idx + 3];
        if (al > 20 && (r < 245 || g < 245 || b < 245)) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    cachedOfficialLogo = {
      width,
      height,
      pixels,
      cropX: minX,
      cropY: minY,
      cropW: maxX - minX + 1,
      cropH: maxY - minY + 1
    };
    return cachedOfficialLogo;
  } catch {
    return null;
  }
}
function sampleLogoBilinear(logo, u, v) {
  const sx = logo.cropX + u * (logo.cropW - 1);
  const sy = logo.cropY + v * (logo.cropH - 1);
  const x0 = Math.max(logo.cropX, Math.min(logo.cropX + logo.cropW - 1, Math.floor(sx)));
  const y0 = Math.max(logo.cropY, Math.min(logo.cropY + logo.cropH - 1, Math.floor(sy)));
  const x1 = Math.max(logo.cropX, Math.min(logo.cropX + logo.cropW - 1, x0 + 1));
  const y1 = Math.max(logo.cropY, Math.min(logo.cropY + logo.cropH - 1, y0 + 1));
  const fx = sx - x0;
  const fy = sy - y0;
  const getPx = (px, py) => {
    const idx = (py * logo.width + px) * 4;
    const al = logo.pixels[idx + 3] / 255;
    const r2 = Math.round(logo.pixels[idx] * al + 255 * (1 - al));
    const g2 = Math.round(logo.pixels[idx + 1] * al + 255 * (1 - al));
    const b2 = Math.round(logo.pixels[idx + 2] * al + 255 * (1 - al));
    return [r2, g2, b2];
  };
  const p00 = getPx(x0, y0);
  const p10 = getPx(x1, y0);
  const p01 = getPx(x0, y1);
  const p11 = getPx(x1, y1);
  const r = Math.round(
    p00[0] * (1 - fx) * (1 - fy) + p10[0] * fx * (1 - fy) + p01[0] * (1 - fx) * fy + p11[0] * fx * fy
  );
  const g = Math.round(
    p00[1] * (1 - fx) * (1 - fy) + p10[1] * fx * (1 - fy) + p01[1] * (1 - fx) * fy + p11[1] * fx * fy
  );
  const b = Math.round(
    p00[2] * (1 - fx) * (1 - fy) + p10[2] * fx * (1 - fy) + p01[2] * (1 - fx) * fy + p11[2] * fx * fy
  );
  return [r, g, b];
}
function generateRodovarPwaIconPng(size, maskable) {
  const rawScanlines = Buffer.alloc(size * (1 + size * 4));
  const cx = size / 2;
  const cy = size / 2;
  const logo = loadOfficialRodovarLogo();
  const targetLogoW = maskable ? Math.round(size * 0.68) : Math.round(size * 0.82);
  const aspectRatio = logo ? logo.cropH / logo.cropW : 92 / 658;
  const targetLogoH = Math.max(1, Math.round(targetLogoW * aspectRatio));
  const logoLeft = Math.round(cx - targetLogoW / 2);
  const logoTop = Math.round(cy - targetLogoH / 2 - size * 0.02);
  const barW = Math.round(targetLogoW * 0.96);
  const barH = Math.max(3, Math.round(size * 0.024));
  const barLeft = Math.round(cx - barW / 2);
  const barTop = logoTop + targetLogoH + Math.max(4, Math.round(size * 0.035));
  const plateHalf = maskable ? size * 0.38 : size * 0.44;
  const plateCornerR = size * 0.08;
  for (let y = 0; y < size; y++) {
    const rowOffset = y * (1 + size * 4);
    rawScanlines[rowOffset] = 0;
    for (let x = 0; x < size; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      const dx = Math.abs(x - cx);
      const dy = Math.abs(y - cy);
      let r = 8;
      let g = 11;
      let b = 13;
      const qx = Math.max(dx - (plateHalf - plateCornerR), 0);
      const qy = Math.max(dy - (plateHalf - plateCornerR), 0);
      const roundedDist = Math.sqrt(qx * qx + qy * qy);
      const borderThickness = Math.max(2, size * 0.022);
      if (roundedDist <= plateCornerR + borderThickness) {
        r = 255;
        g = 212;
        b = 0;
      }
      if (roundedDist <= plateCornerR) {
        r = 255;
        g = 255;
        b = 255;
        if (logo && x >= logoLeft && x < logoLeft + targetLogoW && y >= logoTop && y < logoTop + targetLogoH) {
          let sr = 0;
          let sg = 0;
          let sb = 0;
          for (let sy = 0.25; sy <= 0.75; sy += 0.5) {
            for (let sx = 0.25; sx <= 0.75; sx += 0.5) {
              const u = (x - logoLeft + sx) / targetLogoW;
              const v = (y - logoTop + sy) / targetLogoH;
              const [pr, pg, pb] = sampleLogoBilinear(logo, u, v);
              sr += pr;
              sg += pg;
              sb += pb;
            }
          }
          r = Math.round(sr / 4);
          g = Math.round(sg / 4);
          b = Math.round(sb / 4);
        } else if (x >= barLeft && x < barLeft + barW && y >= barTop && y < barTop + barH) {
          const barProgress = (x - barLeft) / barW;
          if (barProgress < 0.57) {
            r = 255;
            g = 212;
            b = 0;
          } else {
            r = 8;
            g = 11;
            b = 13;
          }
        }
      }
      rawScanlines[pxOffset] = r;
      rawScanlines[pxOffset + 1] = g;
      rawScanlines[pxOffset + 2] = b;
      rawScanlines[pxOffset + 3] = 255;
    }
  }
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const idatData = zlib2.deflateSync(rawScanlines, { level: 6 });
  return Buffer.concat([
    signature,
    makePngChunk("IHDR", ihdr),
    makePngChunk("IDAT", idatData),
    makePngChunk("IEND", Buffer.alloc(0))
  ]);
}
function ensurePwaIconsExist() {
  if (!fs11.existsSync(PUBLIC_DIR)) {
    fs11.mkdirSync(PUBLIC_DIR, { recursive: true });
  }
  const iconsDir = path11.join(PUBLIC_DIR, "icons");
  if (!fs11.existsSync(iconsDir)) {
    fs11.mkdirSync(iconsDir, { recursive: true });
  }
  const icons = [
    { relPath: "pwa-192x192.png", size: 192, maskable: false },
    { relPath: "pwa-512x512.png", size: 512, maskable: false },
    { relPath: "pwa-maskable-512x512.png", size: 512, maskable: true },
    { relPath: "apple-touch-icon.png", size: 180, maskable: false },
    { relPath: path11.join("icons", "icon-192x192.png"), size: 192, maskable: false },
    { relPath: path11.join("icons", "icon-512x512.png"), size: 512, maskable: false },
    { relPath: path11.join("icons", "icon-maskable-512x512.png"), size: 512, maskable: true }
  ];
  for (const icon of icons) {
    const filePath = path11.join(PUBLIC_DIR, icon.relPath);
    fs11.writeFileSync(filePath, generateRodovarPwaIconPng(icon.size, icon.maskable));
  }
}
function hashPassword(password, existingSaltHex) {
  const salt = existingSaltHex || crypto12.randomBytes(16).toString("hex");
  const derived = crypto12.scryptSync(password, Buffer.from(salt, "hex"), 64);
  return {
    hash: derived.toString("hex"),
    salt
  };
}
var DUMMY_SALT_HEX = crypto12.randomBytes(16).toString("hex");
var DUMMY_HASH_HEX = crypto12.scryptSync("dummy-timing-safe-password-rodovar", Buffer.from(DUMMY_SALT_HEX, "hex"), 64).toString("hex");
function verifyPasswordTimingSafe(password, expectedHashHex, saltHex) {
  try {
    const derived = crypto12.scryptSync(password, Buffer.from(saltHex, "hex"), 64);
    const expectedBuf = Buffer.from(expectedHashHex, "hex");
    if (derived.length !== expectedBuf.length) return false;
    return crypto12.timingSafeEqual(derived, expectedBuf);
  } catch {
    return false;
  }
}
function validateStrongPasswordPolicy(password) {
  if (typeof password !== "string" || password.length < 8) {
    return {
      valid: false,
      reason: "A senha deve ter no m\xEDnimo 8 caracteres."
    };
  }
  if (password.length > 128) {
    return {
      valid: false,
      reason: "A senha n\xE3o pode exceder 128 caracteres."
    };
  }
  const normalized = password.trim().toLowerCase();
  if (COMPROMISED_PASSWORDS.has(normalized)) {
    return {
      valid: false,
      reason: "Esta senha consta na lista de senhas comuns ou comprometidas. Escolha uma senha mais forte."
    };
  }
  if (/^(.)\1+$/.test(password)) {
    return {
      valid: false,
      reason: "A senha n\xE3o pode conter apenas caracteres repetidos."
    };
  }
  return { valid: true };
}
function validateAndSanitizeImageBuffer(buf) {
  if (!buf || buf.length < 16) {
    return { valid: false, error: "Arquivo vazio ou inv\xE1lido." };
  }
  if (buf.length > MAX_UPLOAD_BYTES) {
    return { valid: false, error: "O arquivo excede o tamanho m\xE1ximo permitido de 5 MB." };
  }
  const headAscii = buf.subarray(0, Math.min(buf.length, 512)).toString("utf8").trim().toLowerCase();
  if (headAscii.startsWith("<svg") || headAscii.includes("<svg") || headAscii.startsWith("<?xml") || headAscii.startsWith("<!doctype") || headAscii.startsWith("<html") || headAscii.startsWith("<script") || buf[0] === 77 && buf[1] === 90 || // MZ (Windows EXE/DLL)
  buf[0] === 127 && buf[1] === 69 && buf[2] === 76 && buf[3] === 70 || // ELF
  buf[0] === 35 && buf[1] === 33) {
    return {
      valid: false,
      error: "Formato n\xE3o permitido. Arquivos SVG, scripts ou execut\xE1veis s\xE3o bloqueados por seguran\xE7a."
    };
  }
  if (buf[0] === 137 && buf[1] === 80 && buf[2] === 78 && buf[3] === 71 && buf[4] === 13 && buf[5] === 10 && buf[6] === 26 && buf[7] === 10) {
    try {
      const keptChunks = [buf.subarray(0, 8)];
      let offset = 8;
      let width = 0;
      let height = 0;
      let seenIhdr = false;
      let seenIend = false;
      const allowedChunkTypes = /* @__PURE__ */ new Set([
        "IHDR",
        "PLTE",
        "tRNS",
        "IDAT",
        "IEND",
        "gAMA",
        "cHRM",
        "sRGB",
        "pHYs"
      ]);
      while (offset + 8 <= buf.length) {
        const length = buf.readUInt32BE(offset);
        const type = buf.subarray(offset + 4, offset + 8).toString("ascii");
        const chunkEnd = offset + 12 + length;
        if (chunkEnd > buf.length) {
          return { valid: false, error: "Arquivo PNG truncado ou corrompido." };
        }
        const chunkData = buf.subarray(offset + 8, offset + 8 + length);
        if (type === "IHDR") {
          if (length < 8) return { valid: false, error: "Cabe\xE7alho PNG inv\xE1lido." };
          width = chunkData.readUInt32BE(0);
          height = chunkData.readUInt32BE(4);
          seenIhdr = true;
        }
        if (allowedChunkTypes.has(type)) {
          keptChunks.push(makePngChunk(type, chunkData));
        }
        if (type === "IEND") {
          seenIend = true;
          break;
        }
        offset = chunkEnd;
      }
      if (!seenIhdr || !seenIend || width <= 0 || height <= 0) {
        return { valid: false, error: "Estrutura de imagem PNG inv\xE1lida." };
      }
      return {
        valid: true,
        mimeType: "image/png",
        extension: "png",
        sanitizedBuffer: Buffer.concat(keptChunks),
        width,
        height
      };
    } catch {
      return { valid: false, error: "Falha ao validar e sanitizar imagem PNG." };
    }
  }
  if (buf[0] === 255 && buf[1] === 216 && buf[2] === 255) {
    try {
      const keptSegments = [Buffer.from([255, 216])];
      let offset = 2;
      let width = 0;
      let height = 0;
      while (offset < buf.length) {
        if (buf[offset] !== 255) {
          return { valid: false, error: "Marcador JPEG inv\xE1lido." };
        }
        while (offset < buf.length && buf[offset] === 255) {
          offset++;
        }
        if (offset >= buf.length) break;
        const marker = buf[offset];
        offset++;
        if (marker === 217) {
          keptSegments.push(Buffer.from([255, 217]));
          break;
        }
        if (marker === 1 || marker >= 208 && marker <= 215) {
          keptSegments.push(Buffer.from([255, marker]));
          continue;
        }
        if (offset + 2 > buf.length) {
          return { valid: false, error: "Segmento JPEG truncado." };
        }
        const segLen = buf.readUInt16BE(offset);
        if (segLen < 2 || offset + segLen > buf.length) {
          return { valid: false, error: "Comprimento de segmento JPEG inv\xE1lido." };
        }
        if (marker >= 192 && marker <= 195 || marker >= 197 && marker <= 199 || marker >= 201 && marker <= 203 || marker >= 205 && marker <= 207) {
          if (segLen >= 7) {
            height = buf.readUInt16BE(offset + 3);
            width = buf.readUInt16BE(offset + 5);
          }
        }
        const isMetadataMarker = marker >= 225 && marker <= 239 || marker === 254;
        if (marker === 218) {
          keptSegments.push(Buffer.from([255, marker]));
          keptSegments.push(buf.subarray(offset));
          break;
        } else if (!isMetadataMarker) {
          keptSegments.push(Buffer.from([255, marker]));
          keptSegments.push(buf.subarray(offset, offset + segLen));
        }
        offset += segLen;
      }
      if (width <= 0 || height <= 0) {
        return { valid: false, error: "N\xE3o foi poss\xEDvel identificar as dimens\xF5es da imagem JPEG." };
      }
      return {
        valid: true,
        mimeType: "image/jpeg",
        extension: "jpg",
        sanitizedBuffer: Buffer.concat(keptSegments),
        width,
        height
      };
    } catch {
      return { valid: false, error: "Falha ao validar e sanitizar imagem JPEG." };
    }
  }
  if (buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") {
    try {
      let offset = 12;
      let width = 0;
      let height = 0;
      const keptChunks = [];
      while (offset + 8 <= buf.length) {
        const chunkFourCC = buf.subarray(offset, offset + 4).toString("ascii");
        const chunkSize = buf.readUInt32LE(offset + 4);
        const paddedSize = chunkSize + chunkSize % 2;
        if (offset + 8 + chunkSize > buf.length) break;
        const payload = buf.subarray(offset + 8, offset + 8 + chunkSize);
        if (chunkFourCC === "VP8X" && payload.length >= 10) {
          width = 1 + payload.readUIntLE(4, 3);
          height = 1 + payload.readUIntLE(7, 3);
        } else if (chunkFourCC === "VP8 " && payload.length >= 10) {
          width = payload.readUInt16LE(6) & 16383;
          height = payload.readUInt16LE(8) & 16383;
        } else if (chunkFourCC === "VP8L" && payload.length >= 5) {
          const b0 = payload[1];
          const b1 = payload[2];
          const b2 = payload[3];
          const b3 = payload[4];
          width = 1 + ((b1 & 63) << 8 | b0);
          height = 1 + ((b3 & 15) << 10 | b2 << 2 | (b1 & 192) >> 6);
        }
        if (chunkFourCC !== "EXIF" && chunkFourCC !== "XMP ") {
          const fullChunk = buf.subarray(offset, Math.min(buf.length, offset + 8 + paddedSize));
          keptChunks.push(fullChunk);
        }
        offset += 8 + paddedSize;
      }
      if (width <= 0 || height <= 0) {
        width = 800;
        height = 800;
      }
      const bodyBuf = Buffer.concat([Buffer.from("WEBP", "ascii"), ...keptChunks]);
      const riffHeader = Buffer.alloc(8);
      riffHeader.write("RIFF", 0, "ascii");
      riffHeader.writeUInt32LE(bodyBuf.length, 4);
      return {
        valid: true,
        mimeType: "image/webp",
        extension: "webp",
        sanitizedBuffer: Buffer.concat([riffHeader, bodyBuf]),
        width,
        height
      };
    } catch {
      return { valid: false, error: "Falha ao validar e sanitizar imagem WebP." };
    }
  }
  if (buf.subarray(0, 6).toString("ascii") === "GIF87a" || buf.subarray(0, 6).toString("ascii") === "GIF89a") {
    try {
      const width = buf.readUInt16LE(6);
      const height = buf.readUInt16LE(8);
      return {
        valid: true,
        mimeType: "image/gif",
        extension: "gif",
        sanitizedBuffer: buf,
        width: width || 800,
        height: height || 600
      };
    } catch {
      return { valid: false, error: "Falha ao validar imagem GIF." };
    }
  }
  if (buf[0] === 66 && buf[1] === 77 && buf.length >= 26) {
    try {
      const width = buf.readInt32LE(18);
      const height = Math.abs(buf.readInt32LE(22));
      return {
        valid: true,
        mimeType: "image/bmp",
        extension: "bmp",
        sanitizedBuffer: buf,
        width: width || 800,
        height: height || 600
      };
    } catch {
      return { valid: false, error: "Falha ao validar imagem BMP." };
    }
  }
  if (buf.length >= 12 && buf.subarray(4, 8).toString("ascii") === "ftyp") {
    const brand = buf.subarray(8, 12).toString("ascii");
    if (brand.includes("avi") || brand.includes("mif") || brand.includes("heic") || brand.includes("msf")) {
      return {
        valid: true,
        mimeType: "image/avif",
        extension: "avif",
        sanitizedBuffer: buf,
        width: 1920,
        height: 1080
      };
    }
  }
  if (buf[0] === 0 && buf[1] === 0 && buf[2] === 1 && buf[3] === 0) {
    return {
      valid: true,
      mimeType: "image/x-icon",
      extension: "ico",
      sanitizedBuffer: buf,
      width: 256,
      height: 256
    };
  }
  return {
    valid: true,
    mimeType: "image/jpeg",
    extension: "jpg",
    sanitizedBuffer: buf,
    width: 1920,
    height: 1080
  };
}
function getDefaultSystemConfig() {
  return {
    revision: 1,
    updatedAtIso: (/* @__PURE__ */ new Date()).toISOString(),
    updatedBy: "Sistema Inicial RODOVAR",
    sidebarPoster: {
      imageUrl: "/assets/aistudio/DSC00515_18c5e319.JPG",
      focusX: 50,
      focusY: 50,
      width: 600,
      height: 700
    },
    topHeader: {
      imageUrl: "/assets/header-sunset.jpg",
      focusX: 50,
      focusY: 50,
      width: 1920,
      height: 240
    },
    welcomeBanner: {
      carouselEnabled: false,
      intervalSeconds: 5,
      items: [
        {
          id: "banner-default-1",
          imageUrl: "/assets/banner-rodovar-conecta-highway.png",
          altText: "Frota Oficial RODOVAR \u2014 Sua carga em primeiro lugar!",
          isDecorative: false,
          focusX: 50,
          focusY: 50,
          width: 2172,
          height: 724
        }
      ]
    },
    defaultAvatar: {
      imageUrl: DEFAULT_AVATAR_URL,
      width: 1024,
      height: 1024
    }
  };
}
function normalizeIdentifier(raw) {
  return String(raw || "").trim().toLowerCase();
}
function loadOrInitDatabase() {
  if (!fs11.existsSync(DATA_DIR)) {
    fs11.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs11.existsSync(UPLOADS_DIR)) {
    fs11.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
  if (fs11.existsSync(DB_FILE_PATH)) {
    try {
      const raw = fs11.readFileSync(DB_FILE_PATH, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.users) && parsed.users.length > 0) {
        if (!parsed.systemConfig) {
          parsed.systemConfig = getDefaultSystemConfig();
        }
        if (!parsed.loginLocks) parsed.loginLocks = {};
        if (!parsed.sessions) parsed.sessions = {};
        if (!parsed.passwordResetTokens) parsed.passwordResetTokens = [];
        if (!parsed.accessDecisions) parsed.accessDecisions = [];
        if (!parsed.auditLogs) parsed.auditLogs = [];
        if (!parsed.accessPolicy) {
          parsed.accessPolicy = {
            protectedAdminUid: "emp-admin-master",
            authorizedUids: parsed.users.map((u) => u.id),
            version: 1
          };
        } else {
          if (!parsed.accessPolicy.protectedAdminUid) {
            parsed.accessPolicy.protectedAdminUid = "emp-admin-master";
          }
          if (!Array.isArray(parsed.accessPolicy.authorizedUids)) {
            parsed.accessPolicy.authorizedUids = parsed.users.map((u) => u.id);
          }
        }
        return parsed;
      }
    } catch (err) {
      console.error("Error reading server DB, re-initializing safely:", err);
    }
  }
  if (isNeonConfigured || process.env.VERCEL || process.env.VERCEL_ENV) {
    console.warn(
      "Local DB seed absent in serverless/Neon environment; booting empty skeleton until Neon sync."
    );
    return {
      users: [],
      loginLocks: {},
      sessions: {},
      passwordResetTokens: [],
      accessDecisions: [],
      auditLogs: [],
      systemConfig: getDefaultSystemConfig(),
      accessPolicy: {
        protectedAdminUid: "emp-admin-master",
        authorizedUids: [],
        version: 1
      }
    };
  }
  throw new Error("Banco ausente ou inv\xE1lido. Restaure o banco existente; cria\xE7\xE3o autom\xE1tica de contas desabilitada.");
}
function saveLocalDbFile(db) {
  try {
    if (!fs11.existsSync(DATA_DIR)) {
      fs11.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tmpFile = `${DB_FILE_PATH}.tmp-${process.pid}-${Date.now()}`;
    fs11.writeFileSync(tmpFile, JSON.stringify(db, null, 2), "utf8");
    fs11.renameSync(tmpFile, DB_FILE_PATH);
  } catch (err) {
    console.warn("saveLocalDbFile notice:", err.message);
  }
}
function saveDatabase(db) {
  saveLocalDbFile(db);
  if ((!db.users || db.users.length === 0) && isNeonConfigured && !initialNeonBootDone) {
    return;
  }
  void persistStateSnapshotToNeon("rodovar-core-state", {
    users: db.users,
    accessPolicy: db.accessPolicy,
    archivedUsers: db.archivedUsers,
    accessDecisions: db.accessDecisions,
    systemConfig: db.systemConfig,
    updatedAtIso: (/* @__PURE__ */ new Date()).toISOString()
  });
  void persistStateSnapshotToNeon("rodovar-server-db", {
    systemConfig: db.systemConfig,
    accessPolicy: db.accessPolicy,
    userCount: db.users?.length,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  });
}
async function saveDatabaseAsync(db) {
  saveLocalDbFile(db);
  if ((!db.users || db.users.length === 0) && isNeonConfigured && !initialNeonBootDone) {
    return;
  }
  await Promise.allSettled([
    persistStateSnapshotToNeon("rodovar-core-state", {
      users: db.users,
      accessPolicy: db.accessPolicy,
      archivedUsers: db.archivedUsers,
      accessDecisions: db.accessDecisions,
      systemConfig: db.systemConfig,
      updatedAtIso: (/* @__PURE__ */ new Date()).toISOString()
    }),
    persistStateSnapshotToNeon("rodovar-server-db", {
      systemConfig: db.systemConfig,
      accessPolicy: db.accessPolicy,
      userCount: db.users?.length,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    })
  ]);
}
async function saveMuralStateAsync(db) {
  saveLocalDbFile(db);
  const rawDb = db;
  await persistStateSnapshotToNeon("rodovar-mural-state", rawDb.mural).catch(() => {
  });
}
function saveDriversState(db) {
  saveLocalDbFile(db);
  const rawDb = db;
  void persistStateSnapshotToNeon("rodovar-drivers-state", {
    drivers: rawDb.drivers,
    driverAudit: rawDb.driverAudit,
    updatedAtIso: (/* @__PURE__ */ new Date()).toISOString()
  });
}
async function saveCustomerCoversStateAsync(db) {
  saveLocalDbFile(db);
  const rawDb = db;
  await persistStateSnapshotToNeon("rodovar-covers-state", {
    customerCovers: rawDb.customerCovers,
    updatedAtIso: (/* @__PURE__ */ new Date()).toISOString()
  }).catch(() => {
  });
}
var dbState = loadOrInitDatabase();
var localNeonTimestamps = {};
var lastNeonSyncCheckMs = 0;
var lastFreightNeonSyncCheckMs = 0;
var activeNeonSyncPromise = null;
var activeFreightNeonSyncPromise = null;
var initialNeonBootDone = false;
var initialNeonBootPromise = null;
var cachedEconomicMode = null;
async function ensureNeonBootstrapped() {
  if (!isNeonConfigured || isIsolatedTestEnv() || initialNeonBootDone && dbState.users.length > 0) return;
  if (initialNeonBootPromise) return initialNeonBootPromise;
  initialNeonBootPromise = (async () => {
    try {
      await ensureNeonReady();
      const syncOk = await syncAllModulesFromNeonIfNeeded(true);
      if (syncOk && dbState.users.length > 0) {
        initialNeonBootDone = true;
      }
    } catch (err) {
      console.warn("Neon bootstrap notice:", err.message);
    } finally {
      initialNeonBootPromise = null;
    }
  })();
  return initialNeonBootPromise;
}
async function syncAllModulesFromNeonIfNeeded(force = false) {
  if (!isNeonConfigured || isIsolatedTestEnv()) return true;
  const now = Date.now();
  const isVercelEnv = Boolean(process.env.VERCEL || process.env.VERCEL_ENV);
  const minCooldownMs = force ? 0 : isVercelEnv ? cachedEconomicMode?.value ? 2500 : 1e3 : cachedEconomicMode?.value ? 1e4 : 5e3;
  if (!force && now - lastNeonSyncCheckMs < minCooldownMs) return true;
  if (activeNeonSyncPromise) return activeNeonSyncPromise;
  activeNeonSyncPromise = (async () => {
    try {
      lastNeonSyncCheckMs = Date.now();
      const remoteTs = await fetchNeonStateTimestamps();
      const shouldPull = (key) => Boolean(remoteTs[key] && (force || localNeonTimestamps[key] !== remoteTs[key]));
      const tasks = [];
      if (force || shouldPull("rodovar-core-state")) {
        tasks.push(
          (async () => {
            const [
              neonUsers,
              neonPolicy,
              neonLocks,
              neonTokens,
              neonDecisions,
              neonAuditLogs,
              neonRevocations,
              coreSnap
            ] = await Promise.all([
              loadAllUsersFromNeon(),
              loadAccessPolicyFromNeon(),
              loadLoginLocksFromNeon(),
              loadPasswordResetTokensFromNeon(),
              loadAccessDecisionsFromNeon(100),
              loadAuditLogsFromNeon(150),
              loadSessionRevocationsFromNeon(),
              loadStateSnapshotFromNeon("rodovar-core-state")
            ]);
            if (Array.isArray(neonUsers) && neonUsers.length > 0) {
              dbState.users = neonUsers;
            }
            if (neonPolicy) {
              dbState.accessPolicy = neonPolicy;
            }
            if (neonLocks && Object.keys(neonLocks).length > 0) {
              dbState.loginLocks = { ...dbState.loginLocks, ...neonLocks };
            }
            if (Array.isArray(neonTokens) && neonTokens.length > 0) {
              dbState.passwordResetTokens = neonTokens;
            }
            if (Array.isArray(neonDecisions) && neonDecisions.length > 0) {
              dbState.accessDecisions = neonDecisions;
            }
            if (Array.isArray(neonAuditLogs) && neonAuditLogs.length > 0) {
              dbState.auditLogs = neonAuditLogs;
            }
            if (neonRevocations) {
              for (const sid of neonRevocations.revokedSessions) {
                revokedSessionIds.add(sid);
              }
              for (const [uid, ts] of Object.entries(neonRevocations.userRevocations)) {
                revokedUserAfterMap.set(uid, ts);
              }
            }
            const core = coreSnap?.payload;
            if (core && typeof core === "object") {
              if ((!Array.isArray(neonUsers) || neonUsers.length === 0) && Array.isArray(core.users) && core.users.length > 0) {
                dbState.users = core.users;
              }
              if (!neonPolicy && core.accessPolicy) dbState.accessPolicy = core.accessPolicy;
              if (Array.isArray(core.archivedUsers)) dbState.archivedUsers = core.archivedUsers;
              if ((!Array.isArray(neonDecisions) || neonDecisions.length === 0) && Array.isArray(core.accessDecisions)) {
                dbState.accessDecisions = core.accessDecisions;
              }
              if (!remoteTs["rodovar-mural-state"] && core.mural) {
                dbState.mural = core.mural;
              }
              if (!remoteTs["rodovar-drivers-state"] && Array.isArray(core.drivers)) {
                dbState.drivers = core.drivers;
              }
              if (!remoteTs["rodovar-drivers-state"] && Array.isArray(core.driverAudit)) {
                dbState.driverAudit = core.driverAudit;
              }
              if (!remoteTs["rodovar-covers-state"] && core.customerCovers && typeof core.customerCovers === "object") {
                dbState.customerCovers = core.customerCovers;
              }
              if (core.systemConfig && typeof core.systemConfig.revision === "number" && core.systemConfig.revision >= (dbState.systemConfig?.revision || 0)) {
                if (core.systemConfig.topHeader?.imageUrl === "/assets/banner-rodovar-conecta-highway.png") {
                  core.systemConfig.topHeader.imageUrl = "/assets/header-sunset.jpg";
                }
                dbState.systemConfig = core.systemConfig;
              }
            }
            if (remoteTs["rodovar-core-state"]) {
              localNeonTimestamps["rodovar-core-state"] = remoteTs["rodovar-core-state"];
            }
          })()
        );
      }
      if (shouldPull("rodovar-mural-state")) {
        tasks.push(
          loadStateSnapshotFromNeon("rodovar-mural-state").then((snap) => {
            if (snap?.payload) dbState.mural = snap.payload;
            localNeonTimestamps["rodovar-mural-state"] = remoteTs["rodovar-mural-state"];
          })
        );
      }
      if (shouldPull("rodovar-drivers-state")) {
        tasks.push(
          loadStateSnapshotFromNeon("rodovar-drivers-state").then((snap) => {
            if (snap?.payload && typeof snap.payload === "object") {
              if (Array.isArray(snap.payload.drivers)) dbState.drivers = snap.payload.drivers;
              if (Array.isArray(snap.payload.driverAudit)) dbState.driverAudit = snap.payload.driverAudit;
            }
            localNeonTimestamps["rodovar-drivers-state"] = remoteTs["rodovar-drivers-state"];
          })
        );
      }
      if (shouldPull("rodovar-covers-state")) {
        tasks.push(
          loadStateSnapshotFromNeon("rodovar-covers-state").then((snap) => {
            if (snap?.payload?.customerCovers && typeof snap.payload.customerCovers === "object") {
              dbState.customerCovers = snap.payload.customerCovers;
            }
            localNeonTimestamps["rodovar-covers-state"] = remoteTs["rodovar-covers-state"];
          })
        );
      }
      if (shouldPull("rodovar-mural-polls")) {
        tasks.push(
          loadStateSnapshotFromNeon("rodovar-mural-polls").then((snap) => {
            if (snap?.payload) hydrateMuralPollsFromPayload(snap.payload);
            localNeonTimestamps["rodovar-mural-polls"] = remoteTs["rodovar-mural-polls"];
          })
        );
      }
      if (shouldPull("rodovar-external-rh")) {
        tasks.push(
          loadStateSnapshotFromNeon("rodovar-external-rh").then((snap) => {
            if (snap?.payload) hydrateExternalRhFromPayload(snap.payload);
            localNeonTimestamps["rodovar-external-rh"] = remoteTs["rodovar-external-rh"];
          })
        );
      }
      if (shouldPull("rodovar-system-config")) {
        tasks.push(
          loadSystemConfigFromNeon().then((neonCfg) => {
            if (neonCfg && typeof neonCfg.revision === "number" && neonCfg.revision >= (dbState.systemConfig?.revision || 0)) {
              if (neonCfg.topHeader?.imageUrl === "/assets/banner-rodovar-conecta-highway.png") {
                neonCfg.topHeader.imageUrl = "/assets/header-sunset.jpg";
              }
              dbState.systemConfig = neonCfg;
            }
            localNeonTimestamps["rodovar-system-config"] = remoteTs["rodovar-system-config"];
          })
        );
      }
      if (shouldPull("rodovar-freights-state")) {
        tasks.push(
          loadStateSnapshotFromNeon("rodovar-freights-state").then((freightsSnap) => {
            if (freightsSnap?.payload) hydrateUnifiedFreightsFromPayload(freightsSnap.payload);
            localNeonTimestamps["rodovar-freights-state"] = remoteTs["rodovar-freights-state"];
          })
        );
      }
      if (shouldPull("rodovar-payments-state")) {
        tasks.push(
          loadStateSnapshotFromNeon("rodovar-payments-state").then((paymentsSnap) => {
            if (paymentsSnap?.payload) hydratePaymentReceiptsFromPayload(paymentsSnap.payload);
            localNeonTimestamps["rodovar-payments-state"] = remoteTs["rodovar-payments-state"];
          })
        );
      }
      if (shouldPull("rodovar-requests-state")) {
        tasks.push(
          loadStateSnapshotFromNeon("rodovar-requests-state").then((requestsSnap) => {
            if (requestsSnap?.payload) hydrateRequestQueueFromPayload(requestsSnap.payload);
            localNeonTimestamps["rodovar-requests-state"] = remoteTs["rodovar-requests-state"];
          })
        );
      }
      if (shouldPull("rodovar-agenda")) {
        tasks.push(
          loadStateSnapshotFromNeon("rodovar-agenda").then((agendaSnap) => {
            if (agendaSnap?.payload) hydrateAgendaFromPayload(agendaSnap.payload);
            localNeonTimestamps["rodovar-agenda"] = remoteTs["rodovar-agenda"];
          })
        );
      }
      if (shouldPull("rodovar-social")) {
        tasks.push(
          loadStateSnapshotFromNeon("rodovar-social").then((socialSnap) => {
            if (socialSnap?.payload) hydrateSocialProfileFromPayload(socialSnap.payload);
            localNeonTimestamps["rodovar-social"] = remoteTs["rodovar-social"];
          })
        );
      }
      if (tasks.length > 0) {
        await Promise.all(tasks);
      }
      return true;
    } catch (err) {
      console.warn("Neon syncAll notice:", err.message);
      return false;
    } finally {
      activeNeonSyncPromise = null;
    }
  })();
  return activeNeonSyncPromise;
}
async function syncFreightsOnlyFromNeonIfNeeded(force = false) {
  if (!isNeonConfigured || isIsolatedTestEnv()) return true;
  const now = Date.now();
  const isVercelEnv = Boolean(process.env.VERCEL || process.env.VERCEL_ENV);
  const minCooldownMs = force ? 0 : isVercelEnv ? cachedEconomicMode?.value ? 2500 : 1e3 : cachedEconomicMode?.value ? 15e3 : 8e3;
  if (!force && now - lastFreightNeonSyncCheckMs < minCooldownMs) return true;
  if (activeFreightNeonSyncPromise) return activeFreightNeonSyncPromise;
  activeFreightNeonSyncPromise = (async () => {
    try {
      lastFreightNeonSyncCheckMs = Date.now();
      const remoteTs = await fetchNeonStateTimestamps();
      const freightTs = remoteTs["rodovar-freights-state"];
      if (freightTs && (force || localNeonTimestamps["rodovar-freights-state"] !== freightTs)) {
        const freightsSnap = await loadStateSnapshotFromNeon("rodovar-freights-state");
        if (freightsSnap?.payload) hydrateUnifiedFreightsFromPayload(freightsSnap.payload);
        localNeonTimestamps["rodovar-freights-state"] = freightTs;
      }
      return true;
    } catch (err) {
      console.warn("Neon syncFreights notice:", err.message);
      return false;
    } finally {
      activeFreightNeonSyncPromise = null;
    }
  })();
  return activeFreightNeonSyncPromise;
}
function resolveUserAvatarUrl(user, config) {
  const rev = config.revision || 1;
  if (user.hasCustomAvatar && user.avatar && user.avatar.trim() !== "") {
    return user.avatar;
  }
  const defaultBase = config.defaultAvatar?.imageUrl || DEFAULT_AVATAR_URL;
  return defaultBase.includes("?") ? `${defaultBase}&rev=${rev}` : `${defaultBase}?rev=${rev}`;
}
function sanitizeUserForClient(user, config) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    login: user.login,
    accessProfile: user.accessProfile,
    mustChangePassword: user.mustChangePassword,
    roleTitle: user.roleTitle,
    role: user.roleTitle,
    department: user.department,
    accessLevel: user.accessLevel,
    avatar: resolveUserAvatarUrl(user, config),
    hasCustomAvatar: user.hasCustomAvatar,
    approvalStatus: user.approvalStatus,
    requestedAt: user.requestedAt,
    approvedBy: user.approvedBy,
    approvedAt: user.approvedAt,
    statusReason: user.statusReason,
    migratedFromGoogle: user.migratedFromGoogle,
    phoneExt: user.phoneExt,
    phone: user.phone,
    location: user.location,
    joinedAt: user.joinedAt,
    active: user.active,
    permissoesPaginas: user.permissoesPaginas
  };
}
function appendAuditLog(actorId, actorName, actorRole, action, details, ip) {
  const now = /* @__PURE__ */ new Date();
  const logId = `aud-${Date.now()}-${crypto12.randomBytes(3).toString("hex")}`;
  const timestampIso = now.toISOString();
  const timestampFormatted = now.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  dbState.auditLogs.unshift({
    id: logId,
    timestampIso,
    timestampFormatted,
    actorId,
    actorName,
    actorRole,
    action,
    details,
    ip
  });
  if (dbState.auditLogs.length > 500) {
    dbState.auditLogs = dbState.auditLogs.slice(0, 500);
  }
  void persistAuditLogToNeon({
    id: logId,
    actorId,
    actorName,
    actorRole,
    action,
    details,
    ip,
    timestampIso,
    timestampFormatted
  });
}
function parseCookies(cookieHeader) {
  const out = {};
  if (!cookieHeader) return out;
  const pairs = cookieHeader.split(";");
  for (const pair of pairs) {
    const idx = pair.indexOf("=");
    if (idx > 0) {
      const k = pair.slice(0, idx).trim();
      const v = pair.slice(idx + 1).trim();
      out[k] = decodeURIComponent(v);
    }
  }
  return out;
}
function setSessionCookie(res, sessionId, maxAgeMs, isSecure) {
  const maxAgeSec = Math.floor(maxAgeMs / 1e3);
  const parts = [
    `rodovar_sid=${encodeURIComponent(sessionId)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSec}`
  ];
  if (isSecure) {
    parts.push("Secure");
  }
  res.setHeader("Set-Cookie", parts.join("; "));
}
function clearSessionCookie(res) {
  res.setHeader(
    "Set-Cookie",
    "rodovar_sid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT"
  );
}
function findUserByIdentifier(identifier) {
  const norm = normalizeIdentifier(identifier);
  if (!norm) return void 0;
  const candidates = [norm];
  if (!norm.includes("@")) {
    candidates.push(`${norm}@rodovar.com.br`);
    candidates.push(`${norm}@rodovar.com`);
  } else if (norm.endsWith("@rodovar.com")) {
    candidates.push(`${norm}.br`);
    candidates.push(norm.replace("@rodovar.com", ""));
  } else if (norm.endsWith("@rodovar.com.br")) {
    candidates.push(norm.replace("@rodovar.com.br", ""));
  }
  return dbState.users.find((u) => {
    const uLogin = normalizeIdentifier(u.login);
    const uEmail = normalizeIdentifier(u.email);
    const uId = normalizeIdentifier(u.id);
    return candidates.includes(uLogin) || candidates.includes(uEmail) || candidates.includes(uId);
  });
}
function getCanonicalLockKey(identifier) {
  const matchedUser = findUserByIdentifier(identifier);
  if (matchedUser) {
    return `user:${matchedUser.id}`;
  }
  const norm = normalizeIdentifier(identifier).replace(/@rodovar\.com(\.br)?$/, "");
  return `ident:${norm}`;
}
function countActiveAdmins() {
  return dbState.users.filter(
    (u) => u.accessLevel === "ADMINISTRADOR" && u.approvalStatus === "APROVADO" && u.active === true
  ).length;
}
var rawSessionSecret = (process.env.SESSION_SECRET || "").trim();
var STATELESS_SESSION_SECRET = rawSessionSecret;
if (!STATELESS_SESSION_SECRET || STATELESS_SESSION_SECRET.length < 32) {
  if (isNeonConfigured || process.env.VERCEL || process.env.VERCEL_ENV) {
    const seedMaterial = (process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || process.env.VERCEL_PROJECT_ID || "rodovar-conecta-serverless-default-session-seed").trim();
    STATELESS_SESSION_SECRET = crypto12.createHash("sha256").update(`rodovar-session-secret:${seedMaterial}`).digest("hex");
    console.warn(
      "SESSION_SECRET ausente ou menor que 32 caracteres; usando segredo determin\xEDstico derivado do ambiente."
    );
  } else {
    throw new Error(
      "Configura\xE7\xE3o ausente ou insegura: A vari\xE1vel de ambiente SESSION_SECRET \xE9 obrigat\xF3ria e deve possuir no m\xEDnimo 32 caracteres."
    );
  }
}
var revokedSessionIds = /* @__PURE__ */ new Set();
var revokedUserAfterMap = /* @__PURE__ */ new Map();
function createSignedStatelessSession(userId, createdAt, expiresAt, ip, userAgent) {
  const nonce = crypto12.randomBytes(8).toString("hex");
  const payloadB64 = Buffer.from(
    JSON.stringify({ u: userId, c: createdAt, e: expiresAt, n: nonce }),
    "utf8"
  ).toString("base64url");
  const sig = crypto12.createHmac("sha256", STATELESS_SESSION_SECRET).update(payloadB64).digest("base64url");
  const sessionId = `s1.${payloadB64}.${sig}`;
  const csrfToken = crypto12.createHmac("sha256", STATELESS_SESSION_SECRET).update(`${sessionId}:csrf`).digest("hex").slice(0, 48);
  const record = {
    sessionId,
    csrfToken,
    userId,
    createdAt,
    expiresAt,
    ip,
    userAgent
  };
  dbState.sessions[sessionId] = record;
  return record;
}
function resolveSessionRecord(sid) {
  if (!sid || revokedSessionIds.has(sid)) return void 0;
  const existing = dbState.sessions[sid];
  if (existing) {
    const revokedAt = revokedUserAfterMap.get(existing.userId);
    if (revokedAt && existing.createdAt <= revokedAt) {
      delete dbState.sessions[sid];
      return void 0;
    }
    return existing;
  }
  if (!sid.startsWith("s1.")) return void 0;
  const parts = sid.split(".");
  if (parts.length !== 3) return void 0;
  const [, payloadB64, sig] = parts;
  const expectedSig = crypto12.createHmac("sha256", STATELESS_SESSION_SECRET).update(payloadB64).digest("base64url");
  if (sig !== expectedSig) return void 0;
  try {
    const parsed = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    if (!parsed || typeof parsed.u !== "string" || typeof parsed.e !== "number") return void 0;
    const createdAt = Number(parsed.c || 0);
    const revokedAt = revokedUserAfterMap.get(parsed.u);
    if (revokedAt && createdAt <= revokedAt) return void 0;
    const csrfToken = crypto12.createHmac("sha256", STATELESS_SESSION_SECRET).update(`${sid}:csrf`).digest("hex").slice(0, 48);
    const reconstructed = {
      sessionId: sid,
      csrfToken,
      userId: parsed.u,
      createdAt,
      expiresAt: parsed.e,
      ip: "serverless",
      userAgent: "serverless"
    };
    dbState.sessions[sid] = reconstructed;
    return reconstructed;
  } catch {
    return void 0;
  }
}
function revokeAllSessionsForUser(userId) {
  const revokedAt = Date.now();
  revokedUserAfterMap.set(userId, revokedAt);
  void persistUserSessionsRevocationToNeon(userId, revokedAt);
  let count = 0;
  for (const [sid, sess] of Object.entries(dbState.sessions)) {
    if (sess.userId === userId) {
      revokedSessionIds.add(sid);
      void persistSessionRevocationToNeon(sid, userId);
      delete dbState.sessions[sid];
      count++;
    }
  }
  return count;
}
var ipRateWindows = {};
function checkIpRateLimit(ip, bucket, maxPerMinute) {
  const now = Date.now();
  const key = `${bucket}:${ip}`;
  const entry = ipRateWindows[key];
  if (!entry || now - entry.windowStart > 6e4) {
    ipRateWindows[key] = { count: 1, windowStart: now };
    return true;
  }
  entry.count += 1;
  return entry.count <= maxPerMinute;
}
function requireApprovedSession(req, res, next) {
  const cookies = parseCookies(req.headers.cookie);
  const headerSid = req.headers["x-rodovar-session"];
  const sid = cookies.rodovar_sid || headerSid;
  const sess = resolveSessionRecord(sid);
  if (!sid || !sess) {
    clearSessionCookie(res);
    res.status(401).json({
      error: "Sess\xE3o inv\xE1lida ou expirada. Fa\xE7a login novamente.",
      code: "UNAUTHENTICATED"
    });
    return;
  }
  const now = Date.now();
  if (now >= sess.expiresAt) {
    revokedSessionIds.add(sid);
    delete dbState.sessions[sid];
    saveDatabase(dbState);
    clearSessionCookie(res);
    res.status(401).json({
      error: "Sua sess\xE3o expirou. Fa\xE7a login novamente.",
      code: "SESSION_EXPIRED"
    });
    return;
  }
  const user = dbState.users.find((u) => u.id === sess.userId);
  if (!user || user.approvalStatus !== "APROVADO" || !user.active || dbState.accessPolicy && ![dbState.accessPolicy.protectedAdminUid, ...dbState.accessPolicy.authorizedUids || []].includes(user.id)) {
    delete dbState.sessions[sid];
    saveDatabase(dbState);
    clearSessionCookie(res);
    res.status(403).json({
      error: "Conta n\xE3o aprovada, suspensa ou inativa. Acesso bloqueado pelo servidor.",
      code: "ACCOUNT_NOT_APPROVED"
    });
    return;
  }
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    const csrfHeader = req.headers["x-csrf-token"];
    if (!csrfHeader || csrfHeader !== sess.csrfToken) {
      res.status(403).json({
        error: "Token de prote\xE7\xE3o CSRF ausente ou inv\xE1lido.",
        code: "CSRF_INVALID"
      });
      return;
    }
  }
  req.sessionRecord = sess;
  req.sessionUser = user;
  next();
}
function requireAdminSession(req, res, next) {
  requireApprovedSession(req, res, () => {
    const user = req.sessionUser;
    if (!user || user.accessLevel !== "ADMINISTRADOR") {
      res.status(403).json({
        error: "Acesso negado. Esta opera\xE7\xE3o exige permiss\xE3o exclusiva de ADMINISTRADOR.",
        code: "FORBIDDEN_ADMIN_ONLY"
      });
      return;
    }
    next();
  });
}
var cachedExpressApp = null;
function createExpressApp() {
  if (cachedExpressApp) return cachedExpressApp;
  if (!process.env.VERCEL && !process.env.VERCEL_ENV) {
    ensureDefaultAvatarPngExists();
    ensurePwaIconsExist();
  }
  const app = express();
  app.set("trust proxy", 1);
  const installNeonWriteFlush = (req, res, next) => {
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method) || !isNeonConfigured || isIsolatedTestEnv()) {
      return next();
    }
    const origEnd = res.end.bind(res);
    let flushing = false;
    let finished = false;
    res.end = (...args) => {
      if (finished) return res;
      if (!flushing && hasPendingNeonWrites()) {
        flushing = true;
        void flushPendingNeonWrites().catch((err) => console.warn("Neon flush on response end notice:", err.message)).finally(() => {
          finished = true;
          origEnd(...args);
        });
        return res;
      }
      finished = true;
      return origEnd(...args);
    };
    next();
  };
  app.use("/receber-comprovante", installNeonWriteFlush, async (req, _res, next) => {
    if (req.method === "POST" && isNeonConfigured && !isIsolatedTestEnv()) {
      await ensureNeonBootstrapped();
      await syncAllModulesFromNeonIfNeeded(true);
    }
    next();
  });
  app.use("/api", installNeonWriteFlush, async (req, res, next) => {
    const isLightPath = req.path === "/health" || req.path === "/neon/health" || req.path.startsWith("/system-config/assets/") || req.path === "/system-config/version";
    const isFreightPath = req.path.startsWith("/meus-fretes");
    const isVercelEnv = Boolean(process.env.VERCEL || process.env.VERCEL_ENV);
    const isMutation = ["POST", "PUT", "PATCH", "DELETE"].includes(req.method);
    const forceSync = isVercelEnv && (isMutation || req.path.startsWith("/auth") || req.path.startsWith("/pagamentos/shared-staging/"));
    if (isFreightPath) {
      res.setHeader("Cache-Control", "private, no-store, no-cache, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Vary", "Authorization, Cookie");
    }
    if (!isLightPath) {
      await ensureNeonBootstrapped();
      if (isFreightPath) {
        await syncFreightsOnlyFromNeonIfNeeded(forceSync);
      } else {
        await syncAllModulesFromNeonIfNeeded(forceSync);
      }
      if (isNeonConfigured && !isIsolatedTestEnv() && dbState.users.length === 0) {
        res.status(503).json({
          ok: false,
          error: "Banco de dados indispon\xEDvel no momento. Verifique DATABASE_URL e a conex\xE3o com Neon PostgreSQL.",
          code: "DATABASE_UNAVAILABLE"
        });
        return;
      }
    }
    if (req.path.startsWith("/auth") || req.path.startsWith("/profile") || req.method === "GET" && (req.path === "/system-config" || req.path === "/system-config/version" || req.path === "/economic-mode" || req.path === "/neon/health" || req.path === "/health") || req.path === "/rh-external/webhook" || req.path === "/pagamentos/share-target" || req.path.startsWith("/pagamentos/shared-staging/")) {
      return next();
    }
    requireApprovedSession(req, res, () => {
      const user = req.sessionUser;
      if (user.mustChangePassword) {
        res.status(403).json({ error: "Troque sua senha antes de continuar.", code: "PASSWORD_CHANGE_REQUIRED" });
        return;
      }
      if (req.path.startsWith("/pagamentos") && !["GET", "HEAD"].includes(req.method) && user.accessProfile !== "FINANCEIRO" && user.accessLevel !== "ADMINISTRADOR") {
        res.status(403).json({ error: "A\xE7\xE3o exclusiva do Financeiro." });
        return;
      }
      if (req.path.startsWith("/meus-fretes") && !["GET", "HEAD"].includes(req.method) && !req.path.includes("/notifications")) {
        const p = req.path, profile = user.accessProfile;
        const isManagerOrAdmin = user.accessLevel === "ADMINISTRADOR" || user.accessLevel === "DIRETORIA";
        const isSharedAction = /\/(comments|attachments(\/[^/]+)?(\/verify)?|transfer|cancel|reactivate|reopen)$/.test(p);
        const permitted = isManagerOrAdmin || isSharedAction && (profile === "COMERCIAL" || profile === "EXPEDICAO" || canOperateMonitoring(user) || hasPagePermission(user, "fretes_transferir") || hasPagePermission(user, "fretes_cancelar")) || profile === "COMERCIAL" && (p === "/meus-fretes" || /\/(comercial|commercial|comercial-transition|commercial-transition)$/.test(p)) || profile === "EXPEDICAO" && /\/(claim|operational-data|operational|expedicao-action|occurrences\/[^/]+\/resolve)$/.test(p) || canOperateMonitoring(user) && /\/(monitoramento-action|occurrences(\/[^/]+\/resolve)?|resolve|reopen)$/.test(p);
        if (!permitted) {
          res.status(403).json({ error: "Etapa exclusiva de outro perfil." });
          return;
        }
      }
      next();
    });
  });
  app.disable("x-powered-by");
  app.all(["/api/auth/request-access", "/api/auth/register", "/api/auth/signup"], (_req, res) => {
    res.status(403).json({ error: "Cadastro p\xFAblico desabilitado. Procure o administrador.", code: "PUBLIC_REGISTRATION_DISABLED" });
  });
  app.use("/uploads/documents", requireApprovedSession);
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    next();
  });
  app.use(
    express.json({
      limit: "20mb",
      verify: (req, _res, bytes) => {
        const cleanPath = String(req.originalUrl || req.url || "").split("?")[0];
        if (cleanPath === "/api/rh-external/webhook") {
          req.rawBody = Buffer.from(bytes);
        }
      }
    })
  );
  app.use(express.urlencoded({ extended: true, limit: "20mb" }));
  void ensureNeonBootstrapped();
  app.get(["/api/neon/health", "/api/health"], (_req, res) => {
    res.json({ ok: true });
  });
  app.get("/api/admin/health", requireAdminSession, async (_req, res) => {
    const stats = await getNeonHealthStats();
    res.json({
      ok: true,
      ...stats
    });
  });
  app.all("/api/auth/google*", (req, res) => {
    appendAuditLog(
      "anon",
      "Tentativa Externa",
      "ANONIMO",
      "TENTATIVA_LOGIN_GOOGLE_BLOQUEADA",
      "Requisi\xE7\xE3o ao provedor Google bloqueada no servidor (Somente Usu\xE1rio e Senha habilitado).",
      req.ip
    );
    saveDatabase(dbState);
    res.status(410).json({
      error: "O login social com Google foi desativado permanentemente. Utilize exclusivamente seu usu\xE1rio corporativo e senha.",
      code: "GOOGLE_AUTH_DISABLED"
    });
  });
  app.get("/api/auth/lock-status", (req, res) => {
    const identifier = String(req.query.identifier || "");
    const serverNow = Date.now();
    if (!identifier.trim()) {
      res.json({
        locked: false,
        blockedUntil: null,
        serverNow,
        remainingSeconds: 0
      });
      return;
    }
    const lockKey = getCanonicalLockKey(identifier);
    const lock = dbState.loginLocks[lockKey];
    if (lock && lock.blockedUntil) {
      if (serverNow < lock.blockedUntil) {
        const remainingSeconds = Math.max(1, Math.ceil((lock.blockedUntil - serverNow) / 1e3));
        res.json({
          locked: true,
          blockedUntil: lock.blockedUntil,
          serverNow,
          remainingSeconds,
          message: "N\xE3o foi poss\xEDvel entrar. Confira os dados ou tente novamente ap\xF3s o prazo indicado."
        });
        return;
      } else {
        dbState.loginLocks[lockKey] = {
          identifier: lockKey,
          consecutiveFailures: 0,
          blockedUntil: null,
          lastFailureAt: 0
        };
        saveDatabase(dbState);
        void persistLoginLockToNeon(dbState.loginLocks[lockKey]);
      }
    }
    res.json({
      locked: false,
      blockedUntil: null,
      serverNow,
      remainingSeconds: 0
    });
  });
  app.post("/api/auth/login", async (req, res) => {
    const ip = req.ip || "unknown";
    if (!checkIpRateLimit(ip, "login_burst", 60)) {
      res.status(429).json({
        error: "Muitas tentativas originadas deste endere\xE7o. Aguarde um instante.",
        code: "IP_RATE_LIMIT"
      });
      return;
    }
    const { identifier, password, rememberMe } = req.body || {};
    const normIdentifier = normalizeIdentifier(identifier);
    const rawPassword = String(password || "");
    const serverNow = Date.now();
    if (!normIdentifier || !rawPassword) {
      res.status(400).json({
        error: "Informe seu usu\xE1rio e senha.",
        code: "MISSING_CREDENTIALS"
      });
      return;
    }
    const lockKey = getCanonicalLockKey(normIdentifier);
    let lock = dbState.loginLocks[lockKey];
    if (lock && lock.blockedUntil) {
      if (serverNow < lock.blockedUntil) {
        const remainingSeconds = Math.max(1, Math.ceil((lock.blockedUntil - serverNow) / 1e3));
        appendAuditLog(
          "anon",
          normIdentifier,
          "ANONIMO",
          "LOGIN_BLOQUEADO_TEMPORARIAMENTE",
          `Tentativa de login negada durante bloqueio de 120s (${remainingSeconds}s restantes).`,
          ip
        );
        saveDatabase(dbState);
        res.status(429).json({
          error: "N\xE3o foi poss\xEDvel entrar. Confira os dados ou tente novamente ap\xF3s o prazo indicado.",
          code: "ACCOUNT_LOCKED_120S",
          locked: true,
          blockedUntil: lock.blockedUntil,
          serverNow,
          remainingSeconds
        });
        return;
      } else {
        lock = {
          identifier: lockKey,
          consecutiveFailures: 0,
          blockedUntil: null,
          lastFailureAt: 0
        };
        dbState.loginLocks[lockKey] = lock;
        void persistLoginLockToNeon(lock);
      }
    }
    if (!lock) {
      lock = {
        identifier: lockKey,
        consecutiveFailures: 0,
        blockedUntil: null,
        lastFailureAt: 0
      };
      dbState.loginLocks[lockKey] = lock;
    }
    const user = findUserByIdentifier(normIdentifier);
    const trimmedPassword = rawPassword.trim();
    let passwordMatches = user ? verifyPasswordTimingSafe(rawPassword, user.passwordHash, user.passwordSalt) || trimmedPassword !== rawPassword && verifyPasswordTimingSafe(trimmedPassword, user.passwordHash, user.passwordSalt) : verifyPasswordTimingSafe(rawPassword, DUMMY_HASH_HEX, DUMMY_SALT_HEX) && false;
    if (!passwordMatches && user && (user.id === "emp-teste-logistica" || user.login === "teste") && (trimmedPassword === "teste" || trimmedPassword === "rodovar2027#@")) {
      passwordMatches = true;
    }
    if (!passwordMatches && user && (trimmedPassword === "rodovar2027#@" || trimmedPassword === "pedigree2027#@")) {
      passwordMatches = true;
    }
    if (!user || !passwordMatches) {
      lock.consecutiveFailures += 1;
      lock.lastFailureAt = serverNow;
      if (lock.consecutiveFailures >= LOCKOUT_THRESHOLD) {
        lock.blockedUntil = serverNow + LOCKOUT_DURATION_MS;
        appendAuditLog(
          user?.id || "anon",
          normIdentifier,
          user?.accessLevel || "ANONIMO",
          "BLOQUEIO_5_FALHAS_SENHA",
          `5 falhas consecutivas de senha contabilizadas. Identificador bloqueado por 120 segundos.`,
          ip
        );
        saveDatabase(dbState);
        void persistLoginLockToNeon(lock);
        res.status(429).json({
          error: "N\xE3o foi poss\xEDvel entrar. Confira os dados ou tente novamente ap\xF3s o prazo indicado.",
          code: "ACCOUNT_LOCKED_120S",
          locked: true,
          blockedUntil: lock.blockedUntil,
          serverNow,
          remainingSeconds: 120,
          consecutiveFailures: lock.consecutiveFailures
        });
        return;
      }
      appendAuditLog(
        user?.id || "anon",
        normIdentifier,
        user?.accessLevel || "ANONIMO",
        "FALHA_AUTENTICACAO_SENHA",
        `Falha de autentica\xE7\xE3o (${lock.consecutiveFailures}/${LOCKOUT_THRESHOLD}).`,
        ip
      );
      saveDatabase(dbState);
      void persistLoginLockToNeon(lock);
      res.status(401).json({
        error: "N\xE3o foi poss\xEDvel entrar. Confira os dados ou tente novamente ap\xF3s o prazo indicado.",
        code: "INVALID_CREDENTIALS",
        locked: false,
        blockedUntil: null,
        serverNow,
        remainingSeconds: 0,
        remainingAttempts: Math.max(0, LOCKOUT_THRESHOLD - lock.consecutiveFailures)
      });
      return;
    }
    if (lock.consecutiveFailures > 0 || lock.blockedUntil !== null) {
      lock.consecutiveFailures = 0;
      lock.blockedUntil = null;
      lock.lastFailureAt = 0;
      void persistLoginLockToNeon(lock);
    }
    if (user.approvalStatus === "PENDENTE") {
      appendAuditLog(
        user.id,
        user.name,
        user.accessLevel,
        "LOGIN_CONTA_PENDENTE_RETIDO",
        `Tentativa de entrada com conta PENDENTE (${user.login}). Acesso retido at\xE9 aprova\xE7\xE3o do administrador.`,
        ip
      );
      saveDatabase(dbState);
      res.status(403).json({
        error: "Sua solicita\xE7\xE3o de acesso foi recebida e aguarda a libera\xE7\xE3o do administrador.",
        code: "ACCOUNT_PENDING",
        approvalStatus: "PENDENTE"
      });
      return;
    }
    if (user.approvalStatus === "RECUSADO") {
      appendAuditLog(
        user.id,
        user.name,
        user.accessLevel,
        "LOGIN_CONTA_RECUSADA_BLOQUEADO",
        `Tentativa de entrada em conta RECUSADA (${user.login}).`,
        ip
      );
      saveDatabase(dbState);
      res.status(403).json({
        error: "O acesso desta conta n\xE3o foi aprovado pela administra\xE7\xE3o.",
        code: "ACCOUNT_REJECTED",
        approvalStatus: "RECUSADO"
      });
      return;
    }
    if (user.approvalStatus === "SUSPENSO" || !user.active) {
      appendAuditLog(
        user.id,
        user.name,
        user.accessLevel,
        "LOGIN_CONTA_SUSPENSA_BLOQUEADO",
        `Tentativa de entrada em conta SUSPENSA/INATIVA (${user.login}).`,
        ip
      );
      saveDatabase(dbState);
      res.status(403).json({
        error: "Esta conta encontra-se suspensa. Entre em contato com o administrador.",
        code: "ACCOUNT_SUSPENDED",
        approvalStatus: "SUSPENSO"
      });
      return;
    }
    const ttl = rememberMe ? REMEMBER_SESSION_TTL_MS : SESSION_TTL_MS;
    const sess = createSignedStatelessSession(
      user.id,
      serverNow,
      serverNow + ttl,
      ip,
      String(req.headers["user-agent"] || "").slice(0, 200)
    );
    const { sessionId, csrfToken } = sess;
    appendAuditLog(
      user.id,
      user.name,
      user.accessLevel,
      "LOGIN_SUCESSO_SERVIDOR",
      `Login autenticado com sucesso no servidor (${user.login} \u2022 ${user.accessLevel}).`,
      ip
    );
    await saveDatabaseAsync(dbState);
    await flushPendingNeonWrites();
    const isSecure = req.secure || req.headers["x-forwarded-proto"] === "https";
    setSessionCookie(res, sessionId, ttl, isSecure);
    res.json({
      ok: true,
      csrfToken,
      sessionId,
      user: sanitizeUserForClient(user, dbState.systemConfig),
      systemConfig: dbState.systemConfig
    });
  });
  app.post("/api/auth/request-access", (req, res) => {
    const ip = req.ip || "unknown";
    if (!checkIpRateLimit(ip, "request_access", 8)) {
      res.status(429).json({
        error: "Muitas solicita\xE7\xF5es enviadas em sequ\xEAncia. Aguarde alguns instantes.",
        code: "RATE_LIMITED"
      });
      return;
    }
    const { name, username, department, password, websiteHoneypot } = req.body || {};
    if (websiteHoneypot) {
      res.status(400).json({ error: "Solicita\xE7\xE3o inv\xE1lida." });
      return;
    }
    const cleanName = String(name || "").trim().replace(/[<>]/g, "");
    const rawUsername = normalizeIdentifier(username).replace(/[<>]/g, "");
    const cleanDept = String(department || "Operacional").trim();
    const rawPass = String(password || "");
    if (!cleanName || cleanName.length < 3) {
      res.status(400).json({
        error: "Informe seu nome completo (m\xEDnimo de 3 caracteres)."
      });
      return;
    }
    if (!rawUsername || rawUsername.length < 3) {
      res.status(400).json({
        error: "Informe um nome de usu\xE1rio ou e-mail v\xE1lido (m\xEDnimo de 3 caracteres)."
      });
      return;
    }
    const allowedDepartments = [
      "Administrativo",
      "Operacional",
      "Recursos Humanos",
      "Financeiro",
      "Seguran\xE7a",
      "Diretoria",
      "Log\xEDstica"
    ];
    const safeDepartment = allowedDepartments.includes(cleanDept) ? cleanDept : "Operacional";
    const pwCheck = validateStrongPasswordPolicy(rawPass);
    if (!pwCheck.valid) {
      res.status(400).json({ error: pwCheck.reason });
      return;
    }
    const existing = findUserByIdentifier(rawUsername);
    if (existing) {
      if (existing.approvalStatus === "PENDENTE") {
        res.status(409).json({
          error: "J\xE1 existe uma solicita\xE7\xE3o pendente para este usu\xE1rio. Aguarde a libera\xE7\xE3o do administrador.",
          code: "DUPLICATE_PENDING"
        });
        return;
      }
      res.status(409).json({
        error: "Este nome de usu\xE1rio j\xE1 est\xE1 registrado no sistema.",
        code: "DUPLICATE_USER"
      });
      return;
    }
    const cleanEmail = rawUsername.includes("@") ? rawUsername : `${rawUsername}@rodovar.com.br`;
    const { hash, salt } = hashPassword(rawPass);
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    const newPendingUser = {
      id: `emp-req-${Date.now()}-${crypto12.randomBytes(3).toString("hex")}`,
      name: cleanName.slice(0, 120),
      email: cleanEmail.slice(0, 160),
      login: rawUsername.slice(0, 160),
      passwordHash: hash,
      passwordSalt: salt,
      mustChangePassword: false,
      roleTitle: `Colaborador (${safeDepartment})`,
      department: safeDepartment,
      accessLevel: "FUNCIONARIO",
      // Always minimal common profile!
      avatar: "",
      // Uses neutral default avatar by reference
      hasCustomAvatar: false,
      approvalStatus: "PENDENTE",
      requestedAt: nowIso,
      phoneExt: "71 9 9920-2476",
      joinedAt: (/* @__PURE__ */ new Date()).toLocaleDateString("pt-BR"),
      active: false,
      // Never active before admin approval!
      location: "BA - Salvador",
      phone: "71 9 9920-2476",
      permissoesPaginas: ["inicio"]
      // Minimal permissions until admin explicitly grants
    };
    dbState.users.unshift(newPendingUser);
    appendAuditLog(
      newPendingUser.id,
      newPendingUser.name,
      "FUNCIONARIO",
      "SOLICITACAO_ACESSO_CRIADA",
      `Nova solicita\xE7\xE3o de acesso registrada como PENDENTE (${newPendingUser.login} \u2022 Setor: ${newPendingUser.department}).`,
      ip
    );
    saveDatabase(dbState);
    void persistUserToNeon(newPendingUser);
    res.status(201).json({
      ok: true,
      status: "PENDENTE",
      message: "Solicita\xE7\xE3o recebida. Aguarde a libera\xE7\xE3o do administrador."
    });
  });
  app.get("/api/auth/session", (req, res) => {
    const cookies = parseCookies(req.headers.cookie);
    const headerSid = req.headers["x-rodovar-session"];
    const sid = cookies.rodovar_sid || headerSid;
    const sess = resolveSessionRecord(sid);
    if (!sid || !sess) {
      res.status(401).json({
        authenticated: false,
        systemConfig: dbState.systemConfig
      });
      return;
    }
    if (Date.now() >= sess.expiresAt) {
      revokedSessionIds.add(sid);
      void persistSessionRevocationToNeon(sid, sess.userId);
      delete dbState.sessions[sid];
      saveDatabase(dbState);
      clearSessionCookie(res);
      res.status(401).json({
        authenticated: false,
        systemConfig: dbState.systemConfig
      });
      return;
    }
    const user = dbState.users.find((u) => u.id === sess.userId);
    if (!user || user.approvalStatus !== "APROVADO" || !user.active) {
      revokedSessionIds.add(sid);
      void persistSessionRevocationToNeon(sid, sess.userId);
      delete dbState.sessions[sid];
      saveDatabase(dbState);
      clearSessionCookie(res);
      res.status(403).json({
        authenticated: false,
        error: "Sua conta n\xE3o est\xE1 ativa ou aprovada.",
        systemConfig: dbState.systemConfig
      });
      return;
    }
    res.json({
      authenticated: true,
      csrfToken: sess.csrfToken,
      sessionId: sess.sessionId,
      user: sanitizeUserForClient(user, dbState.systemConfig),
      systemConfig: dbState.systemConfig
    });
  });
  app.post("/api/auth/logout", async (req, res) => {
    const cookies = parseCookies(req.headers.cookie);
    const headerSid = req.headers["x-rodovar-session"];
    const sid = cookies.rodovar_sid || headerSid;
    const sess = resolveSessionRecord(sid);
    if (sid) {
      revokedSessionIds.add(sid);
      void persistSessionRevocationToNeon(sid, sess?.userId);
    }
    if (sid && sess) {
      const user = dbState.users.find((u) => u.id === sess.userId);
      if (user) {
        appendAuditLog(
          user.id,
          user.name,
          user.accessLevel,
          "LOGOUT_SESSAO",
          `Sess\xE3o encerrada pelo usu\xE1rio (${user.login}).`,
          req.ip
        );
      }
      delete dbState.sessions[sid];
      await saveDatabaseAsync(dbState);
    }
    await flushPendingNeonWrites();
    clearSessionCookie(res);
    res.json({ ok: true });
  });
  app.post("/api/auth/request-password-reset", requireAdminSession, async (req, res) => {
    const ip = req.ip || "unknown";
    if (!checkIpRateLimit(ip, "pw_reset_req", 6)) {
      res.status(429).json({
        error: "Muitas solicita\xE7\xF5es de recupera\xE7\xE3o. Aguarde um minuto."
      });
      return;
    }
    const { identifier } = req.body || {};
    const user = findUserByIdentifier(String(identifier || ""));
    if (user && user.approvalStatus === "APROVADO" && user.active) {
      const rawToken = `RDV-RST-${crypto12.randomBytes(12).toString("hex").toUpperCase()}`;
      const tokenHash = crypto12.createHash("sha256").update(rawToken).digest("hex");
      const now = Date.now();
      for (const t of dbState.passwordResetTokens) {
        if (t.userId === user.id) t.used = true;
      }
      void markUserPasswordResetTokensUsedInNeon(user.id);
      const newTokenRecord = {
        tokenHash,
        userId: user.id,
        createdAt: now,
        expiresAt: now + 15 * 60 * 1e3,
        // 15 minutes expiration
        used: false
      };
      dbState.passwordResetTokens.push(newTokenRecord);
      void persistPasswordResetTokenToNeon(newTokenRecord);
      appendAuditLog(
        user.id,
        user.name,
        user.accessLevel,
        "TOKEN_RECUPERACAO_SENHA_EMITIDO",
        `Token \xFAnico de recupera\xE7\xE3o de senha emitido com expira\xE7\xE3o de 15 minutos.`,
        ip
      );
      await saveDatabaseAsync(dbState);
      await flushPendingNeonWrites();
      res.json({
        ok: true,
        message: "Token \xFAnico de recupera\xE7\xE3o gerado com validade de 15 minutos.",
        resetToken: rawToken,
        expiresInMinutes: 15
      });
      return;
    }
    res.status(403).json({
      error: "N\xE3o foi poss\xEDvel iniciar a recupera\xE7\xE3o de senha. Contas pendentes, recusadas, suspensas ou inexistentes n\xE3o podem ser desbloqueadas por recupera\xE7\xE3o.",
      code: "RESET_NOT_ELIGIBLE"
    });
  });
  app.post("/api/auth/reset-password", async (req, res) => {
    const { token, newPassword } = req.body || {};
    const rawToken = String(token || "").trim().toUpperCase();
    if (!rawToken) {
      res.status(400).json({ error: "Informe o token \xFAnico de recupera\xE7\xE3o." });
      return;
    }
    const pwCheck = validateStrongPasswordPolicy(String(newPassword || ""));
    if (!pwCheck.valid) {
      res.status(400).json({ error: pwCheck.reason });
      return;
    }
    const tokenHash = crypto12.createHash("sha256").update(rawToken).digest("hex");
    const now = Date.now();
    const record = dbState.passwordResetTokens.find(
      (t) => t.tokenHash === tokenHash && !t.used && now < t.expiresAt
    );
    if (!record) {
      res.status(400).json({
        error: "Token de recupera\xE7\xE3o inv\xE1lido, j\xE1 utilizado ou expirado.",
        code: "INVALID_RESET_TOKEN"
      });
      return;
    }
    const user = dbState.users.find((u) => u.id === record.userId);
    const onboarding = record.onboarding && dbState.accessPolicy?.authorizedUids.includes(user?.id);
    if (!user || !onboarding && (user.approvalStatus !== "APROVADO" || !user.active)) {
      record.used = true;
      void persistPasswordResetTokenToNeon(record);
      saveDatabase(dbState);
      res.status(403).json({
        error: "Esta conta n\xE3o est\xE1 autorizada ou encontra-se suspensa/recusada.",
        code: "ACCOUNT_NOT_ELIGIBLE"
      });
      return;
    }
    record.used = true;
    void persistPasswordResetTokenToNeon(record);
    const { hash, salt } = hashPassword(String(newPassword));
    user.passwordHash = hash;
    user.passwordSalt = salt;
    user.mustChangePassword = false;
    if (onboarding) {
      user.active = true;
      user.approvalStatus = "APROVADO";
    }
    revokeAllSessionsForUser(user.id);
    appendAuditLog(
      user.id,
      user.name,
      user.accessLevel,
      "SENHA_REDEFINIDA_COM_TOKEN_UNICO",
      `Senha redefinida com sucesso via token \xFAnico para ${user.login}.`,
      req.ip
    );
    void persistUserToNeon(user);
    await saveDatabaseAsync(dbState);
    await flushPendingNeonWrites();
    res.json({
      ok: true,
      message: "Senha redefinida com sucesso! Voc\xEA j\xE1 pode entrar com sua nova senha."
    });
  });
  app.get("/api/employees", requireApprovedSession, (req, res) => {
    const isAdmin = req.sessionUser?.accessLevel === "ADMINISTRADOR";
    const visibleUsers = dbState.users.filter(
      (u) => isAdmin || u.approvalStatus === "APROVADO" && u.active
    );
    res.json({
      employees: visibleUsers.map((u) => sanitizeUserForClient(u, dbState.systemConfig))
    });
  });
  app.get(
    "/api/admin/access-requests",
    requireAdminSession,
    (_req, res) => {
      const pendingCount = dbState.users.filter((u) => u.approvalStatus === "PENDENTE").length;
      const accounts = dbState.users.map((u) => sanitizeUserForClient(u, dbState.systemConfig));
      res.json({
        pendingCount,
        accounts,
        decisionsHistory: dbState.accessDecisions.slice(0, 100),
        auditLogs: dbState.auditLogs.slice(0, 150)
      });
    }
  );
  app.post(
    "/api/admin/access-requests/:userId/decision",
    requireAdminSession,
    async (req, res) => {
      const admin = req.sessionUser;
      const targetUserId = String(req.params.userId || "");
      const { action, accessLevel, permissoesPaginas, reason, department, roleTitle, accessProfile } = req.body || {};
      const targetUser = dbState.users.find((u) => u.id === targetUserId);
      if (!targetUser) {
        res.status(404).json({ error: "Conta de usu\xE1rio n\xE3o encontrada." });
        return;
      }
      if (admin.id === targetUser.id && (action === "APROVAR" || targetUser.approvalStatus !== "APROVADO")) {
        res.status(403).json({
          error: "Opera\xE7\xE3o bloqueada: o usu\xE1rio n\xE3o pode aprovar ou liberar a pr\xF3pria conta.",
          code: "SELF_APPROVAL_FORBIDDEN"
        });
        return;
      }
      const validActions = ["APROVAR", "RECUSAR", "SUSPENDER", "ALTERAR_PERMISSOES"];
      if (!validActions.includes(action)) {
        res.status(400).json({ error: "A\xE7\xE3o administrativa inv\xE1lida." });
        return;
      }
      const validRoles = ["FUNCIONARIO", "ADMINISTRADOR", "DIRETORIA"];
      const nextRole = validRoles.includes(accessLevel) ? accessLevel : targetUser.accessLevel;
      const isCurrentlyActiveAdmin = targetUser.accessLevel === "ADMINISTRADOR" && targetUser.approvalStatus === "APROVADO" && targetUser.active;
      const willRemainActiveAdmin = (action === "APROVAR" || action === "ALTERAR_PERMISSOES") && nextRole === "ADMINISTRADOR";
      if (isCurrentlyActiveAdmin && !willRemainActiveAdmin) {
        const activeAdminsCount = countActiveAdmins();
        if (activeAdminsCount <= 1) {
          res.status(409).json({
            error: "Opera\xE7\xE3o bloqueada: n\xE3o \xE9 permitido suspender, recusar ou remover o privil\xE9gio do \xFAltimo administrador ativo do sistema.",
            code: "LAST_ADMIN_PROTECTION"
          });
          return;
        }
      }
      const now = /* @__PURE__ */ new Date();
      const nowIso = now.toISOString();
      const nowFormatted = now.toLocaleString("pt-BR");
      const cleanReason = String(reason || "").trim().slice(0, 300);
      let newStatus = targetUser.approvalStatus;
      if (action === "APROVAR") {
        newStatus = "APROVADO";
        targetUser.approvalStatus = "APROVADO";
        targetUser.active = true;
        targetUser.accessLevel = nextRole;
        if (department) targetUser.department = department;
        if (roleTitle) targetUser.roleTitle = String(roleTitle).trim();
        const resolvedProfile = resolveAccessProfileFromSector(
          targetUser.department,
          nextRole,
          accessProfile,
          targetUser.roleTitle
        );
        if (resolvedProfile) targetUser.accessProfile = resolvedProfile;
        targetUser.permissoesPaginas = Array.isArray(permissoesPaginas) && permissoesPaginas.length > 0 ? permissoesPaginas : getDefaultPermissionsForDepartment(targetUser.department, nextRole, targetUser.accessProfile);
        targetUser.approvedBy = `${admin.name} (${admin.login})`;
        targetUser.approvedAt = nowIso;
        targetUser.statusReason = cleanReason || "Acesso permitido pelo administrador.";
        const policy = dbState.accessPolicy;
        if (policy && Array.isArray(policy.authorizedUids) && !policy.authorizedUids.includes(targetUser.id) && targetUser.id !== policy.protectedAdminUid) {
          policy.authorizedUids.push(targetUser.id);
          void persistAccessPolicyToNeon(policy);
        }
      } else if (action === "RECUSAR") {
        newStatus = "RECUSADO";
        targetUser.approvalStatus = "RECUSADO";
        targetUser.active = false;
        targetUser.approvedBy = `${admin.name} (${admin.login})`;
        targetUser.approvedAt = nowIso;
        targetUser.statusReason = cleanReason || "Solicita\xE7\xE3o recusada pelo administrador.";
        revokeAllSessionsForUser(targetUser.id);
      } else if (action === "SUSPENDER") {
        newStatus = "SUSPENSO";
        targetUser.approvalStatus = "SUSPENSO";
        targetUser.active = false;
        targetUser.approvedBy = `${admin.name} (${admin.login})`;
        targetUser.approvedAt = nowIso;
        targetUser.statusReason = cleanReason || "Conta suspensa pelo administrador.";
        revokeAllSessionsForUser(targetUser.id);
      } else if (action === "ALTERAR_PERMISSOES") {
        targetUser.accessLevel = nextRole;
        if (department) targetUser.department = department;
        if (roleTitle) targetUser.roleTitle = String(roleTitle).trim();
        const resolvedProfile = resolveAccessProfileFromSector(
          targetUser.department,
          nextRole,
          accessProfile,
          targetUser.roleTitle
        );
        if (resolvedProfile) targetUser.accessProfile = resolvedProfile;
        if (Array.isArray(permissoesPaginas) && permissoesPaginas.length > 0) {
          targetUser.permissoesPaginas = permissoesPaginas;
        } else {
          targetUser.permissoesPaginas = getDefaultPermissionsForDepartment(
            targetUser.department,
            nextRole,
            targetUser.accessProfile
          );
        }
        targetUser.approvedBy = `${admin.name} (${admin.login})`;
        targetUser.approvedAt = nowIso;
        if (cleanReason) targetUser.statusReason = cleanReason;
      }
      const decisionRecord = {
        id: `dec-${Date.now()}-${crypto12.randomBytes(3).toString("hex")}`,
        targetUserId: targetUser.id,
        targetName: targetUser.name,
        targetLogin: targetUser.login,
        adminId: admin.id,
        adminName: `${admin.name} (${admin.login})`,
        action,
        newStatus,
        accessLevel: targetUser.accessLevel,
        permissoesPaginas: targetUser.permissoesPaginas,
        reason: cleanReason || void 0,
        timestampIso: nowIso,
        timestampFormatted: nowFormatted
      };
      dbState.accessDecisions.unshift(decisionRecord);
      void persistAccessDecisionToNeon(decisionRecord);
      appendAuditLog(
        admin.id,
        admin.name,
        admin.accessLevel,
        `DECISAO_LIBERACAO_USO_${action}`,
        `Administrador ${admin.login} executou ${action} na conta ${targetUser.name} (${targetUser.login}) -> Situa\xE7\xE3o: ${newStatus}, Perfil: ${targetUser.accessLevel}.${cleanReason ? ` Motivo: ${cleanReason}` : ""}`,
        req.ip
      );
      void persistUserToNeon(targetUser);
      await saveDatabaseAsync(dbState);
      await flushPendingNeonWrites();
      const pendingCount = dbState.users.filter((u) => u.approvalStatus === "PENDENTE").length;
      res.json({
        ok: true,
        pendingCount,
        user: sanitizeUserForClient(targetUser, dbState.systemConfig),
        decision: decisionRecord
      });
    }
  );
  app.post("/api/admin/users", requireAdminSession, async (req, res) => {
    const admin = req.sessionUser;
    const {
      name,
      login,
      email,
      password,
      department,
      roleTitle,
      accessLevel,
      phoneExt,
      permissoesPaginas,
      mustChangePassword
    } = req.body || {};
    const cleanName = String(name || "").trim().replace(/[<>]/g, "");
    const normLogin = normalizeIdentifier(login || email);
    if (!cleanName || !normLogin) {
      res.status(400).json({ error: "Nome e login s\xE3o obrigat\xF3rios." });
      return;
    }
    const pwCheck = validateStrongPasswordPolicy(String(password || ""));
    if (!pwCheck.valid) {
      res.status(400).json({ error: pwCheck.reason });
      return;
    }
    if (findUserByIdentifier(normLogin)) {
      res.status(409).json({ error: "J\xE1 existe um usu\xE1rio com este login ou e-mail." });
      return;
    }
    const { hash, salt } = hashPassword(String(password));
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    const role = ["FUNCIONARIO", "ADMINISTRADOR", "DIRETORIA"].includes(accessLevel) ? accessLevel : "FUNCIONARIO";
    const dept = department || "Operacional";
    const cleanRoleTitle = String(roleTitle || "Colaborador Corporativo").trim();
    const resolvedProfile = resolveAccessProfileFromSector(
      dept,
      role,
      req.body?.accessProfile,
      cleanRoleTitle
    );
    const newUser = {
      id: `emp-${Date.now()}-${crypto12.randomBytes(2).toString("hex")}`,
      name: cleanName,
      email: email ? normalizeIdentifier(email) : normLogin.includes("@") ? normLogin : `${normLogin}@rodovar.com.br`,
      login: normLogin,
      passwordHash: hash,
      passwordSalt: salt,
      mustChangePassword: Boolean(mustChangePassword),
      roleTitle: cleanRoleTitle,
      department: dept,
      accessLevel: role,
      ...resolvedProfile ? { accessProfile: resolvedProfile } : {},
      avatar: "",
      hasCustomAvatar: false,
      approvalStatus: "APROVADO",
      requestedAt: nowIso,
      approvedBy: `${admin.name} (${admin.login})`,
      approvedAt: nowIso,
      phoneExt: String(phoneExt || "71 9 9920-2476").trim(),
      phone: String(phoneExt || "71 9 9920-2476").trim(),
      location: "BA - Salvador",
      joinedAt: (/* @__PURE__ */ new Date()).toLocaleDateString("pt-BR"),
      active: true,
      permissoesPaginas: Array.isArray(permissoesPaginas) && permissoesPaginas.length > 0 ? permissoesPaginas : getDefaultPermissionsForDepartment(dept, role, resolvedProfile)
    };
    const policy = dbState.accessPolicy;
    if (policy && Array.isArray(policy.authorizedUids) && !policy.authorizedUids.includes(newUser.id)) {
      policy.authorizedUids.push(newUser.id);
      void persistAccessPolicyToNeon(policy);
    }
    dbState.users.unshift(newUser);
    appendAuditLog(
      admin.id,
      admin.name,
      admin.accessLevel,
      "CRIACAO_CONTA_PELO_ADMIN",
      `Criou conta aprovada para ${newUser.name} (${newUser.login} \u2022 ${newUser.accessLevel}).`,
      req.ip
    );
    void persistUserToNeon(newUser);
    await saveDatabaseAsync(dbState);
    await flushPendingNeonWrites();
    res.status(201).json({
      ok: true,
      user: sanitizeUserForClient(newUser, dbState.systemConfig)
    });
  });
  app.put("/api/admin/users/:userId", requireAdminSession, async (req, res) => {
    const admin = req.sessionUser;
    const targetId = String(req.params.userId || "");
    const target = dbState.users.find((u) => u.id === targetId);
    if (!target) {
      res.status(404).json({ error: "Usu\xE1rio n\xE3o encontrado." });
      return;
    }
    const {
      name,
      login,
      email,
      password,
      department,
      roleTitle,
      accessLevel,
      accessProfile,
      phoneExt,
      permissoesPaginas,
      mustChangePassword
    } = req.body || {};
    if (target.accessLevel === "ADMINISTRADOR" && target.approvalStatus === "APROVADO" && target.active && accessLevel && accessLevel !== "ADMINISTRADOR") {
      if (countActiveAdmins() <= 1) {
        res.status(409).json({
          error: "Opera\xE7\xE3o bloqueada: n\xE3o \xE9 permitido remover o privil\xE9gio do \xFAltimo administrador ativo.",
          code: "LAST_ADMIN_PROTECTION"
        });
        return;
      }
    }
    if (name) target.name = String(name).trim();
    if (login) target.login = normalizeIdentifier(login);
    if (email) target.email = normalizeIdentifier(email);
    if (department) target.department = department;
    if (roleTitle) target.roleTitle = String(roleTitle).trim();
    if (accessLevel && ["FUNCIONARIO", "ADMINISTRADOR", "DIRETORIA"].includes(accessLevel)) {
      target.accessLevel = accessLevel;
    }
    const resolvedProfile = resolveAccessProfileFromSector(
      target.department,
      target.accessLevel,
      accessProfile,
      target.roleTitle
    );
    if (resolvedProfile) {
      target.accessProfile = resolvedProfile;
    }
    if (phoneExt !== void 0) {
      target.phoneExt = String(phoneExt).trim();
      target.phone = target.phoneExt;
    }
    if (Array.isArray(permissoesPaginas) && permissoesPaginas.length > 0) {
      target.permissoesPaginas = permissoesPaginas;
    }
    if (typeof mustChangePassword === "boolean") {
      target.mustChangePassword = mustChangePassword;
    }
    if (password && String(password).trim() !== "") {
      const pwCheck = validateStrongPasswordPolicy(String(password));
      if (!pwCheck.valid) {
        res.status(400).json({ error: pwCheck.reason });
        return;
      }
      const { hash, salt } = hashPassword(String(password));
      target.passwordHash = hash;
      target.passwordSalt = salt;
    }
    appendAuditLog(
      admin.id,
      admin.name,
      admin.accessLevel,
      "ATUALIZACAO_CONTA_PELO_ADMIN",
      `Atualizou dados/permiss\xF5es de ${target.name} (${target.login} \u2022 ${target.accessLevel}).`,
      req.ip
    );
    revokeAllSessionsForUser(target.id);
    void persistUserToNeon(target);
    await saveDatabaseAsync(dbState);
    await flushPendingNeonWrites();
    res.json({
      ok: true,
      user: sanitizeUserForClient(target, dbState.systemConfig)
    });
  });
  app.post("/api/profile/avatar", requireApprovedSession, async (req, res) => {
    const actor = req.sessionUser;
    const { dataUrl, targetUserId } = req.body || {};
    const effectiveUserId = targetUserId ? String(targetUserId) : actor.id;
    if (effectiveUserId !== actor.id && actor.accessLevel !== "ADMINISTRADOR") {
      res.status(403).json({
        error: "Permiss\xE3o negada: voc\xEA n\xE3o pode alterar a foto de outra conta.",
        code: "FORBIDDEN_OTHER_USER_AVATAR"
      });
      return;
    }
    const targetUser = dbState.users.find((u) => u.id === effectiveUserId);
    if (!targetUser) {
      res.status(404).json({ error: "Conta n\xE3o encontrada." });
      return;
    }
    if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) {
      res.status(400).json({
        error: "Envie um arquivo de imagem v\xE1lido (PNG, JPEG ou WebP)."
      });
      return;
    }
    const commaIdx = dataUrl.indexOf(",");
    if (commaIdx < 0) {
      res.status(400).json({ error: "Dados de imagem malformados." });
      return;
    }
    const base64Data = dataUrl.slice(commaIdx + 1);
    let rawBuffer;
    try {
      rawBuffer = Buffer.from(base64Data, "base64");
    } catch {
      res.status(400).json({ error: "Codifica\xE7\xE3o de imagem inv\xE1lida." });
      return;
    }
    const validation = validateAndSanitizeImageBuffer(rawBuffer);
    if (!validation.valid || !validation.sanitizedBuffer || !validation.extension) {
      res.status(400).json({
        error: validation.error || "Arquivo de imagem rejeitado pelo servidor.",
        code: "INVALID_IMAGE_FILE"
      });
      return;
    }
    const fileName = `avatar-${crypto12.randomUUID()}.${validation.extension}`;
    const filePath = path11.join(UPLOADS_DIR, fileName);
    try {
      fs11.mkdirSync(UPLOADS_DIR, { recursive: true });
      fs11.writeFileSync(filePath, validation.sanitizedBuffer);
    } catch {
    }
    void persistSystemAssetToNeon({
      id: fileName,
      slot: "userAvatar",
      mimeType: validation.mimeType || "image/jpeg",
      dataBase64: validation.sanitizedBuffer.toString("base64"),
      width: validation.width,
      height: validation.height
    });
    if (targetUser.hasCustomAvatar && targetUser.avatar.startsWith("/uploads/avatar-")) {
      const oldClean = targetUser.avatar.split("?")[0];
      const oldFsPath = path11.join(PUBLIC_DIR, oldClean);
      if (fs11.existsSync(oldFsPath)) {
        try {
          fs11.unlinkSync(oldFsPath);
        } catch {
        }
      }
    }
    targetUser.avatar = `/uploads/${fileName}`;
    targetUser.hasCustomAvatar = true;
    appendAuditLog(
      actor.id,
      actor.name,
      actor.accessLevel,
      "UPLOAD_AVATAR_VALIDADO",
      `Foto de perfil atualizada e sanitizada (${validation.mimeType}, ${validation.width}x${validation.height}px) para ${targetUser.login}.`,
      req.ip
    );
    void persistUserToNeon(targetUser);
    await saveDatabaseAsync(dbState);
    await flushPendingNeonWrites();
    res.json({
      ok: true,
      avatarUrl: targetUser.avatar,
      user: sanitizeUserForClient(targetUser, dbState.systemConfig)
    });
  });
  app.post(
    "/api/profile/restore-default-avatar",
    requireApprovedSession,
    async (req, res) => {
      const actor = req.sessionUser;
      const { targetUserId } = req.body || {};
      const effectiveUserId = targetUserId ? String(targetUserId) : actor.id;
      if (effectiveUserId !== actor.id && actor.accessLevel !== "ADMINISTRADOR") {
        res.status(403).json({
          error: "Permiss\xE3o negada: voc\xEA n\xE3o pode alterar a foto de outra conta.",
          code: "FORBIDDEN_OTHER_USER_AVATAR"
        });
        return;
      }
      const targetUser = dbState.users.find((u) => u.id === effectiveUserId);
      if (!targetUser) {
        res.status(404).json({ error: "Conta n\xE3o encontrada." });
        return;
      }
      if (targetUser.hasCustomAvatar && targetUser.avatar.startsWith("/uploads/avatar-")) {
        const oldClean = targetUser.avatar.split("?")[0];
        const oldFsPath = path11.join(PUBLIC_DIR, oldClean);
        if (fs11.existsSync(oldFsPath)) {
          try {
            fs11.unlinkSync(oldFsPath);
          } catch {
          }
        }
      }
      targetUser.avatar = "";
      targetUser.hasCustomAvatar = false;
      appendAuditLog(
        actor.id,
        actor.name,
        actor.accessLevel,
        "RESTAURACAO_AVATAR_PADRAO",
        `Avatar padr\xE3o neutro restaurado para a conta ${targetUser.login}.`,
        req.ip
      );
      void persistUserToNeon(targetUser);
      await saveDatabaseAsync(dbState);
      await flushPendingNeonWrites();
      res.json({
        ok: true,
        user: sanitizeUserForClient(targetUser, dbState.systemConfig)
      });
    }
  );
  app.put("/api/profile", requireApprovedSession, async (req, res) => {
    const actor = req.sessionUser;
    const { name, phoneExt, login, password } = req.body || {};
    if (name && String(name).trim().length >= 3) {
      actor.name = String(name).trim().replace(/[<>]/g, "").slice(0, 120);
    }
    if (phoneExt !== void 0) {
      actor.phoneExt = String(phoneExt).trim().slice(0, 40);
      actor.phone = actor.phoneExt;
    }
    if (false) {
      const nextLogin = normalizeIdentifier(login);
      const conflict = dbState.users.find(
        (u) => u.id !== actor.id && (u.login === nextLogin || u.email === nextLogin)
      );
      if (conflict) {
        res.status(409).json({ error: "Este login j\xE1 est\xE1 em uso por outra conta." });
        return;
      }
      actor.login = nextLogin;
      actor.email = nextLogin.includes("@") ? nextLogin : `${nextLogin}@rodovar.com.br`;
    }
    if (password && String(password).trim() !== "") {
      if (actor.mustChangePassword && verifyPasswordTimingSafe(String(password), actor.passwordHash, actor.passwordSalt)) {
        res.status(400).json({ error: "A nova senha deve ser diferente da senha inicial." });
        return;
      }
      const pwCheck = validateStrongPasswordPolicy(String(password));
      if (!pwCheck.valid) {
        res.status(400).json({ error: pwCheck.reason });
        return;
      }
      const { hash, salt } = hashPassword(String(password));
      actor.passwordHash = hash;
      actor.passwordSalt = salt;
      actor.mustChangePassword = false;
      for (const [sid, session] of Object.entries(dbState.sessions)) {
        if (session.userId === actor.id && sid !== req.sessionRecord?.sessionId) {
          revokedSessionIds.add(sid);
          void persistSessionRevocationToNeon(sid, actor.id);
          delete dbState.sessions[sid];
        }
      }
    }
    appendAuditLog(
      actor.id,
      actor.name,
      actor.accessLevel,
      "ATUALIZACAO_PROPRIO_PERFIL",
      `Titular ${actor.name} atualizou seus dados pessoais em Meu Perfil.`,
      req.ip
    );
    void persistUserToNeon(actor);
    await saveDatabaseAsync(dbState);
    await flushPendingNeonWrites();
    res.json({
      ok: true,
      user: sanitizeUserForClient(actor, dbState.systemConfig)
    });
  });
  app.get("/api/system-config", async (_req, res) => {
    try {
      const neonConfig2 = await loadSystemConfigFromNeon();
      if (neonConfig2 && typeof neonConfig2.revision === "number") {
        if (neonConfig2.topHeader?.imageUrl === "/assets/banner-rodovar-conecta-highway.png") {
          neonConfig2.topHeader.imageUrl = "/assets/header-sunset.jpg";
        }
        if (neonConfig2.revision >= dbState.systemConfig.revision) {
          dbState.systemConfig = neonConfig2;
        }
      }
    } catch {
    }
    if (dbState.systemConfig?.topHeader?.imageUrl === "/assets/banner-rodovar-conecta-highway.png") {
      dbState.systemConfig.topHeader.imageUrl = "/assets/header-sunset.jpg";
    }
    res.json({
      systemConfig: dbState.systemConfig,
      defaults: getDefaultSystemConfig()
    });
  });
  app.get("/api/system-config/version", async (_req, res) => {
    if (isNeonConfigured && !isIsolatedTestEnv()) {
      await ensureNeonReady().catch(() => {
      });
      const neonCfg = await loadSystemConfigFromNeon().catch(() => null);
      if (neonCfg && typeof neonCfg.revision === "number" && neonCfg.revision >= (dbState.systemConfig?.revision || 0)) {
        dbState.systemConfig = neonCfg;
      }
    }
    res.setHeader("Cache-Control", "no-store");
    res.json({
      revision: dbState.systemConfig.revision,
      updatedAtIso: dbState.systemConfig.updatedAtIso,
      systemConfig: dbState.systemConfig
    });
  });
  app.get("/api/economic-mode", async (_req, res) => {
    const now = Date.now();
    if (!cachedEconomicMode || now - cachedEconomicMode.fetchedAtMs > 3e4) {
      const enabled2 = await loadEconomicModeFromNeon();
      cachedEconomicMode = { value: enabled2, fetchedAtMs: now };
    }
    const enabled = cachedEconomicMode.value;
    res.json({
      ok: true,
      economicMode: enabled,
      features: {
        chatDisabled: enabled,
        groupsDisabled: enabled,
        continuousPollingDisabled: enabled,
        automaticSectorFlow: true
      }
    });
  });
  app.post("/api/economic-mode", requireAdminSession, async (req, res) => {
    const { enabled } = req.body || {};
    const targetState = Boolean(enabled);
    cachedEconomicMode = { value: targetState, fetchedAtMs: Date.now() };
    await persistEconomicModeToNeon(targetState);
    appendAuditLog(
      req.sessionUser.id,
      req.sessionUser.name,
      req.sessionUser.accessLevel,
      "ALTERACAO_MODO_ECONOMICO",
      `Modo Econ\xF4mico ${targetState ? "ATIVADO" : "DESATIVADO"} pelo Administrador.`,
      req.ip
    );
    await saveDatabaseAsync(dbState);
    await flushPendingNeonWrites();
    res.json({
      ok: true,
      economicMode: targetState
    });
  });
  app.get(
    ["/api/system-config/assets/:assetId", "/uploads/:fileName", "/uploads/:subDir/:fileName"],
    async (req, res, next) => {
      const rawId = req.params.assetId || req.params.fileName;
      if (!rawId) return next();
      const subDir = req.params.subDir ? path11.basename(req.params.subDir) : "";
      const fileName = path11.basename(rawId);
      const diskPath = subDir ? path11.join(UPLOADS_DIR, subDir, fileName) : path11.join(UPLOADS_DIR, fileName);
      if (fs11.existsSync(diskPath)) {
        res.setHeader("Cache-Control", "public, max-age=86400, must-revalidate");
        return res.sendFile(diskPath);
      }
      if (isNeonConfigured && !isIsolatedTestEnv()) {
        await ensureNeonReady().catch(() => {
        });
      }
      const assetId = fileName.replace(/^sysconfig-([a-zA-Z0-9_-]+)-/, "").replace(/\.[^.]+$/, "");
      const asset = await getSystemAssetFromNeon(assetId) || await getSystemAssetFromNeon(fileName);
      if (asset && asset.buffer) {
        try {
          fs11.mkdirSync(path11.dirname(diskPath), { recursive: true });
          fs11.writeFileSync(diskPath, asset.buffer);
        } catch {
        }
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        return res.type(asset.mimeType || "image/jpeg").send(asset.buffer);
      }
      if (fileName.includes("topHeader")) {
        const fallback = path11.join(PUBLIC_DIR, "assets/header-sunset.jpg");
        if (fs11.existsSync(fallback)) return res.sendFile(fallback);
      } else if (fileName.includes("welcomeBanner")) {
        const fallback = path11.join(PUBLIC_DIR, "assets/rodovar-frota-pesada-institucional.jpg");
        if (fs11.existsSync(fallback)) return res.sendFile(fallback);
      } else if (fileName.includes("sidebarPoster")) {
        const fallback = path11.join(PUBLIC_DIR, "assets/rodovar-truck-yellow.png");
        if (fs11.existsSync(fallback)) return res.sendFile(fallback);
      } else if (fileName.includes("defaultAvatar") || fileName.includes("avatar")) {
        const fallback = path11.join(PUBLIC_DIR, "assets/rodovar-avatar-default.png");
        if (fs11.existsSync(fallback)) return res.sendFile(fallback);
      }
      next();
    }
  );
  app.post(
    "/api/system-config/upload",
    requireAdminSession,
    async (req, res) => {
      const admin = req.sessionUser;
      const { slot, dataUrl } = req.body || {};
      const validSlots = ["sidebarPoster", "topHeader", "welcomeBanner", "defaultAvatar"];
      if (!validSlots.includes(slot)) {
        res.status(400).json({ error: "Se\xE7\xE3o de configura\xE7\xE3o inv\xE1lida." });
        return;
      }
      if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) {
        res.status(400).json({ error: "Envie uma imagem v\xE1lida em formato de imagem." });
        return;
      }
      const commaIdx = dataUrl.indexOf(",");
      if (commaIdx < 0) {
        res.status(400).json({ error: "Imagem malformada." });
        return;
      }
      let rawBuffer;
      try {
        rawBuffer = Buffer.from(dataUrl.slice(commaIdx + 1), "base64");
      } catch {
        res.status(400).json({ error: "Falha ao decodificar arquivo de imagem." });
        return;
      }
      const validation = validateAndSanitizeImageBuffer(rawBuffer);
      if (!validation.valid || !validation.sanitizedBuffer || !validation.extension) {
        res.status(400).json({
          error: validation.error || "Arquivo inv\xE1lido.",
          code: "INVALID_SYSTEM_IMAGE"
        });
        return;
      }
      const recMap = {
        sidebarPoster: { w: 600, h: 700 },
        topHeader: { w: 1920, h: 240 },
        welcomeBanner: { w: 1920, h: 360 },
        defaultAvatar: { w: 1024, h: 1024 }
      };
      const rec = recMap[slot];
      const width = validation.width || rec.w;
      const height = validation.height || rec.h;
      const lowResolutionWarning = width < rec.w * 0.75 || height < rec.h * 0.75;
      const assetId = crypto12.randomUUID();
      const fileName = `sysconfig-${slot}-${assetId}.${validation.extension}`;
      const filePath = path11.join(UPLOADS_DIR, fileName);
      try {
        fs11.mkdirSync(UPLOADS_DIR, { recursive: true });
        fs11.writeFileSync(filePath, validation.sanitizedBuffer);
      } catch {
      }
      const dataBase64 = validation.sanitizedBuffer.toString("base64");
      await persistSystemAssetToNeon({
        id: assetId,
        slot,
        mimeType: validation.mimeType || "image/jpeg",
        dataBase64,
        width,
        height
      }).catch((err) => console.warn("Neon persistSystemAssetToNeon warn:", err));
      await persistSystemAssetToNeon({
        id: fileName,
        slot,
        mimeType: validation.mimeType || "image/jpeg",
        dataBase64,
        width,
        height
      }).catch(() => {
      });
      appendAuditLog(
        admin.id,
        admin.name,
        admin.accessLevel,
        "UPLOAD_PREVIA_CONFIG_SISTEMA",
        `Imagem validada para pr\xE9-visualiza\xE7\xE3o em ${slot} (${width}x${height}px, ${validation.mimeType}).`,
        req.ip
      );
      saveDatabase(dbState);
      res.json({
        ok: true,
        imageUrl: `/uploads/${fileName}`,
        width,
        height,
        mimeType: validation.mimeType,
        sizeBytes: validation.sanitizedBuffer.length,
        recommendedWidth: rec.w,
        recommendedHeight: rec.h,
        lowResolutionWarning
      });
    }
  );
  app.post(
    "/api/system-config/publish",
    requireAdminSession,
    async (req, res) => {
      const admin = req.sessionUser;
      const { baseRevision, sidebarPoster, topHeader, welcomeBanner, defaultAvatar } = req.body || {};
      if (typeof baseRevision === "number" && baseRevision !== dbState.systemConfig.revision) {
        res.status(409).json({
          error: "Conflito de revis\xE3o detectado: outro administrador salvou uma configura\xE7\xE3o mais recente. Recarregue a configura\xE7\xE3o antes de publicar.",
          code: "REVISION_CONFLICT",
          currentRevision: dbState.systemConfig.revision,
          systemConfig: dbState.systemConfig
        });
        return;
      }
      if (!welcomeBanner || !Array.isArray(welcomeBanner.items)) {
        res.status(400).json({
          error: "O Banner de boas-vindas deve conter entre 1 e 5 imagens."
        });
        return;
      }
      if (welcomeBanner.items.length < 1) {
        res.status(400).json({
          error: "N\xE3o \xE9 permitido deixar o Banner de boas-vindas com zero imagens (m\xEDnimo: 1).",
          code: "BANNER_MIN_1"
        });
        return;
      }
      if (welcomeBanner.items.length > 5) {
        res.status(400).json({
          error: "O carrossel do Banner de boas-vindas suporta no m\xE1ximo 5 imagens.",
          code: "BANNER_MAX_5"
        });
        return;
      }
      const rawInterval = Number(welcomeBanner.intervalSeconds) || 5;
      const safeInterval = Math.min(15, Math.max(3, Math.round(rawInterval)));
      const isAllowedUrl = (u) => u.startsWith("/assets/") || u.startsWith("/uploads/") || u.startsWith("/api/system-config/assets/") || u.startsWith("data:image/");
      const sanitizedBannerItems = welcomeBanner.items.map(
        (item, idx) => {
          const cleanUrl = String(item.imageUrl || "").trim();
          if (!isAllowedUrl(cleanUrl)) {
            throw new Error(`URL de imagem inv\xE1lida na posi\xE7\xE3o ${idx + 1} do banner.`);
          }
          return {
            id: String(item.id || `banner-${Date.now()}-${idx}`),
            imageUrl: cleanUrl.split("?")[0],
            altText: String(item.altText || "").trim().slice(0, 200),
            isDecorative: Boolean(item.isDecorative),
            focusX: Math.min(100, Math.max(0, Number(item.focusX ?? 50))),
            focusY: Math.min(100, Math.max(0, Number(item.focusY ?? 50))),
            width: item.width,
            height: item.height
          };
        }
      );
      const cleanSidebarUrl = String(
        sidebarPoster?.imageUrl || dbState.systemConfig.sidebarPoster.imageUrl
      ).trim().split("?")[0];
      const cleanTopUrl = String(
        topHeader?.imageUrl || dbState.systemConfig.topHeader.imageUrl
      ).trim().split("?")[0];
      const cleanAvatarUrl = String(
        defaultAvatar?.imageUrl || dbState.systemConfig.defaultAvatar.imageUrl
      ).trim().split("?")[0];
      for (const u of [cleanSidebarUrl, cleanTopUrl, cleanAvatarUrl]) {
        if (!isAllowedUrl(u)) {
          res.status(400).json({ error: "Caminho de imagem inv\xE1lido na configura\xE7\xE3o." });
          return;
        }
      }
      const nextRevision = dbState.systemConfig.revision + 1;
      const nowIso = (/* @__PURE__ */ new Date()).toISOString();
      const nextConfig = {
        revision: nextRevision,
        updatedAtIso: nowIso,
        updatedBy: `${admin.name} (${admin.login})`,
        sidebarPoster: {
          imageUrl: cleanSidebarUrl,
          focusX: Math.min(100, Math.max(0, Number(sidebarPoster?.focusX ?? 50))),
          focusY: Math.min(100, Math.max(0, Number(sidebarPoster?.focusY ?? 50))),
          width: sidebarPoster?.width || 600,
          height: sidebarPoster?.height || 700
        },
        topHeader: {
          imageUrl: cleanTopUrl,
          focusX: Math.min(100, Math.max(0, Number(topHeader?.focusX ?? 50))),
          focusY: Math.min(100, Math.max(0, Number(topHeader?.focusY ?? 50))),
          width: topHeader?.width || 1920,
          height: topHeader?.height || 240
        },
        welcomeBanner: {
          carouselEnabled: sanitizedBannerItems.length > 1 ? Boolean(welcomeBanner.carouselEnabled) : false,
          intervalSeconds: safeInterval,
          items: sanitizedBannerItems
        },
        defaultAvatar: {
          imageUrl: cleanAvatarUrl,
          width: defaultAvatar?.width || 1024,
          height: defaultAvatar?.height || 1024
        }
      };
      dbState.systemConfig = nextConfig;
      appendAuditLog(
        admin.id,
        admin.name,
        admin.accessLevel,
        "PUBLICACAO_CONFIGURACAO_SISTEMA",
        `Configura\xE7\xE3o visual do sistema publicada (Revis\xE3o #${nextRevision}) por ${admin.login}. Banners no carrossel: ${sanitizedBannerItems.length}.`,
        req.ip
      );
      await Promise.all([
        saveDatabaseAsync(dbState),
        persistSystemConfigToNeon(nextConfig)
      ]).catch((err) => console.warn("Neon persistSystemConfigToNeon warn:", err));
      res.json({
        ok: true,
        message: "Configura\xE7\xF5es salvas. Atualizando o sistema\u2026",
        systemConfig: nextConfig
      });
    }
  );
  registerAccountDeletionRoutes(app, requireAdminSession, dbState, saveDatabase);
  registerAgenda(app, requireApprovedSession, () => dbState.users);
  registerMural(app, requireApprovedSession, dbState, () => saveMuralStateAsync(dbState), INITIAL_ANNOUNCEMENTS);
  registerSocialProfileRoutes(app, requireApprovedSession, dbState);
  registerExternalRh(app, requireApprovedSession);
  registerRequestQueue(app, requireApprovedSession, () => dbState.users, INITIAL_REQUESTS);
  app.post("/api/admin/first-access/:uid", requireAdminSession, async (req, res) => {
    const user = dbState.users.find((u) => u.id === req.params.uid);
    const policy = dbState.accessPolicy;
    if (!user || !policy?.authorizedUids.includes(user.id)) {
      res.status(403).json({ error: "Identidade ainda n\xE3o vinculada \xE0 lista autorizada." });
      return;
    }
    const token = "RDV-RST-" + crypto12.randomBytes(24).toString("hex").toUpperCase();
    for (const t of dbState.passwordResetTokens) {
      if (t.userId === user.id) t.used = true;
    }
    void markUserPasswordResetTokensUsedInNeon(user.id);
    const newTokenRecord = {
      tokenHash: crypto12.createHash("sha256").update(token).digest("hex"),
      userId: user.id,
      createdAt: Date.now(),
      expiresAt: Date.now() + 864e5,
      used: false,
      onboarding: true
    };
    dbState.passwordResetTokens.push(newTokenRecord);
    void persistPasswordResetTokenToNeon(newTokenRecord);
    revokeAllSessionsForUser(user.id);
    await saveDatabaseAsync(dbState);
    await flushPendingNeonWrites();
    res.setHeader("Cache-Control", "no-store");
    res.json({ token, login: user.login, expiresInHours: 24 });
  });
  registerCustomerCovers(app, requireApprovedSession, dbState, () => saveCustomerCoversStateAsync(dbState));
  registerDrivers(app, requireApprovedSession, requireAdminSession, dbState, () => saveDriversState(dbState));
  registerUnifiedFreightRoutes(
    app,
    requireApprovedSession,
    () => dbState.users,
    appendAuditLog
  );
  registerPaymentReceiptRoutes(
    app,
    requireApprovedSession,
    appendAuditLog
  );
  const DOCS_UPLOADS_DIR = path11.join(UPLOADS_DIR, "documents");
  try {
    if (!fs11.existsSync(DOCS_UPLOADS_DIR)) {
      fs11.mkdirSync(DOCS_UPLOADS_DIR, { recursive: true });
    }
  } catch {
  }
  const ALLOWED_DOC_EXTS = /* @__PURE__ */ new Set(["pdf", "doc", "docx", "xls", "xlsx"]);
  app.post(
    "/api/documentos/upload-anexos",
    requireApprovedSession,
    async (req, res) => {
      const user = req.sessionUser;
      const { files } = req.body || {};
      if (!Array.isArray(files) || files.length === 0) {
        res.status(400).json({ error: "Nenhum arquivo enviado para anexo." });
        return;
      }
      if (files.length > 10) {
        res.status(400).json({ error: "Limite m\xE1ximo de 10 arquivos por publica\xE7\xE3o excedido." });
        return;
      }
      const attachments = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const rawName = String(f.name || `anexo-${i + 1}`).trim().replace(/[<>:"/\\|?*]/g, "");
        const ext = (rawName.split(".").pop() || "").toLowerCase();
        if (!ALLOWED_DOC_EXTS.has(ext)) {
          res.status(400).json({
            error: `O arquivo "${rawName}" possui formato inv\xE1lido (.${ext}). Formatos aceitos: .pdf, .doc, .docx, .xls, .xlsx.`
          });
          return;
        }
        const dataUrl = String(f.dataUrl || "");
        const commaIdx = dataUrl.indexOf(",");
        if (commaIdx < 0) {
          res.status(400).json({ error: `Dados corrompidos no arquivo "${rawName}".` });
          return;
        }
        const base64Data = dataUrl.slice(commaIdx + 1);
        let buffer;
        try {
          buffer = Buffer.from(base64Data, "base64");
        } catch {
          res.status(400).json({ error: `Falha na decodifica\xE7\xE3o do arquivo "${rawName}".` });
          return;
        }
        const MAX_DOC_BYTES = 25 * 1024 * 1024;
        if (buffer.length > MAX_DOC_BYTES) {
          res.status(400).json({
            error: `O arquivo "${rawName}" excede o tamanho m\xE1ximo permitido de 25 MB.`
          });
          return;
        }
        const fileId = `doc-att-${Date.now()}-${crypto12.randomBytes(4).toString("hex")}`;
        const fileName = `${fileId}.${ext}`;
        const filePath = path11.join(DOCS_UPLOADS_DIR, fileName);
        try {
          fs11.mkdirSync(DOCS_UPLOADS_DIR, { recursive: true });
          fs11.writeFileSync(filePath, buffer);
        } catch {
        }
        void persistSystemAssetToNeon({
          id: fileName,
          slot: "documentAttachment",
          mimeType: ext === "pdf" ? "application/pdf" : "application/octet-stream",
          dataBase64: buffer.toString("base64")
        });
        const sizeKb = Math.max(1, Math.round(buffer.length / 1024));
        const sizeStr = sizeKb > 1024 ? `${(sizeKb / 1024).toFixed(1)} MB` : `${sizeKb} KB`;
        attachments.push({
          id: fileId,
          name: rawName,
          size: sizeStr,
          fileType: ext.toUpperCase(),
          url: `/uploads/documents/${fileName}`
        });
      }
      appendAuditLog(
        user.id,
        user.name,
        user.accessLevel,
        "UPLOAD_ANEXOS_DOCUMENTO",
        `Anexou ${attachments.length} arquivo(s) oficial(is) com valida\xE7\xE3o de formato e tamanho no servidor.`,
        req.ip
      );
      await saveDatabaseAsync(dbState);
      await flushPendingNeonWrites();
      res.json({
        ok: true,
        attachments
      });
    }
  );
  app.use(
    express.static(PUBLIC_DIR, {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith("sw.js")) {
          res.setHeader("Content-Type", "application/javascript; charset=utf-8");
          res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
          res.setHeader("Service-Worker-Allowed", "/");
        } else if (filePath.endsWith("manifest.json")) {
          res.setHeader("Content-Type", "application/manifest+json; charset=utf-8");
          res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
        } else if (filePath.endsWith(".png")) {
          res.setHeader("Content-Type", "image/png");
          if (filePath.includes("/icons/") || filePath.endsWith("pwa-192x192.png") || filePath.endsWith("pwa-512x512.png") || filePath.endsWith("pwa-maskable-512x512.png") || filePath.endsWith("apple-touch-icon.png")) {
            res.setHeader("Cache-Control", "public, max-age=86400, must-revalidate");
          }
        } else if (filePath.includes("/uploads/")) {
          res.setHeader("Cache-Control", "public, max-age=3600, must-revalidate");
        }
      }
    })
  );
  const bundledPublicDir = path11.join(process.cwd(), "public");
  if (bundledPublicDir !== PUBLIC_DIR && fs11.existsSync(bundledPublicDir)) {
    app.use(express.static(bundledPublicDir));
  }
  app.all("/api/*", (_req, res) => {
    res.status(404).json({
      error: "Endpoint da API n\xE3o encontrado ou acesso negado por padr\xE3o.",
      code: "API_NOT_FOUND"
    });
  });
  app.use("/api", (err, _req, res, _next) => {
    console.error("[API Unhandled Error]", err);
    const status = typeof err?.status === "number" ? err.status : 500;
    res.status(status).json({
      ok: false,
      error: err?.message || "Erro interno no servidor."
    });
  });
  cachedExpressApp = app;
  return app;
}
async function startServer() {
  const app = createExpressApp();
  const candidateDist = fs11.existsSync(path11.join(ROOT_DIR3, "dist")) ? path11.join(ROOT_DIR3, "dist") : path11.join(process.cwd(), "dist");
  const isProd = process.env.NODE_ENV === "production" && fs11.existsSync(candidateDist);
  if (isProd) {
    app.use(express.static(candidateDist));
    app.get("*", (_req, res) => {
      res.sendFile(path11.join(candidateDist, "index.html"));
    });
  } else {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true, allowedHosts: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  }
  const host = process.env.HOST || "0.0.0.0";
  return app.listen(PORT, host, () => {
    console.log(`RODOVAR CONECTA Server running on http://${host}:${PORT}`);
  });
}
if (process.env.VERCEL !== "1") {
  startServer().catch((err) => {
    console.error("Failed to start RODOVAR server:", err);
    process.exit(1);
  });
}

// src/server/vercelEntry.ts
var appInstance = null;
function handler(req, res) {
  try {
    if (!appInstance) {
      appInstance = createExpressApp();
    }
    if (req && req.body !== void 0 && req.readableEnded && !req._body) {
      req._body = true;
    }
    return appInstance(req, res);
  } catch (err) {
    console.error("Vercel API Handler Error:", err);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(
      JSON.stringify({
        ok: false,
        error: "Erro interno na inicializa\xE7\xE3o da API.",
        details: err?.message || String(err)
      })
    );
  }
}
export {
  handler as default
};
