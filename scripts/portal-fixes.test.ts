import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import express from 'express';
import {
  GlobalToastViewport,
  inferToastTypeFromMessage,
} from '../src/components/ui/GlobalToastViewport';
import {
  isHiddenAdministratorOperator,
  filterVisibleFreightOperators,
} from '../src/lib/serverApi';
import {
  orderedNotifications,
  notificationMatches,
} from '../src/lib/notificationNavigation';
import type { CorporateNotification, Employee } from '../src/types';

test('GlobalToastViewport classifica erro, conclusão, transferência e aviso + SSR seguro', () => {
  assert.equal(inferToastTypeFromMessage('Falha ao conectar com o servidor'), 'error');
  assert.equal(inferToastTypeFromMessage('Senha inválida ou incorreta'), 'error');
  assert.equal(inferToastTypeFromMessage('Não foi possível transferir o frete'), 'error');

  assert.equal(inferToastTypeFromMessage('Frete transferido para Elinete (Comercial)'), 'transfer');
  assert.equal(inferToastTypeFromMessage('Responsabilidade assumida na fila da Expedição'), 'transfer');

  assert.equal(inferToastTypeFromMessage('Frete concluído e entregue com sucesso'), 'success');
  assert.equal(inferToastTypeFromMessage('Senha alterada e salva no Neon'), 'success');

  assert.equal(inferToastTypeFromMessage('Verifique os documentos anexados'), 'info');

  // SSR sem window/document deve retornar string vazia sem exceção
  assert.equal(renderToStaticMarkup(React.createElement(GlobalToastViewport)), '');
});

test('Lista de operadores oculta Administrador Geral e mantém colaboradores reais', () => {
  const sample = [
    {
      id: 'emp-admin-master',
      name: 'Administrador Geral RODOVAR',
      roleTitle: 'Administrador Geral do Portal',
      department: 'Diretoria',
      avatar: '/assets/default-avatar.png',
      accessLevel: 'ADMINISTRADOR',
    },
    {
      id: 'emp-other-admin',
      name: 'Carlos SuperAdmin',
      roleTitle: 'Gestor',
      department: 'Administrativo',
      avatar: '/assets/default-avatar.png',
      accessLevel: 'ADMINISTRADOR',
    },
    {
      id: 'emp-com-1',
      name: 'Elinete Santos',
      roleTitle: 'Analista Comercial',
      department: 'Comercial',
      avatar: '/assets/default-avatar.png',
      accessLevel: 'FUNCIONARIO',
    },
    {
      id: 'emp-exp-1',
      name: 'Priscila Sousa dos Santos',
      roleTitle: 'Operadora de Expedição',
      department: 'Expedição',
      avatar: '/assets/default-avatar.png',
      accessLevel: 'FUNCIONARIO',
    },
  ];

  assert.equal(isHiddenAdministratorOperator(sample[0]), true);
  assert.equal(isHiddenAdministratorOperator(sample[1]), true);
  assert.equal(isHiddenAdministratorOperator(sample[2]), false);
  assert.equal(isHiddenAdministratorOperator(sample[3]), false);

  const visible = filterVisibleFreightOperators(sample);
  assert.deepEqual(
    visible.map((o) => o.id),
    ['emp-com-1', 'emp-exp-1']
  );
});

test('orderedNotifications deduplica mesma informação preservando estado lido e permite atualizações distintas', () => {
  const sameA: CorporateNotification = {
    id: 'n1',
    recipientId: 'user-1',
    type: 'prazo',
    dotColor: 'blue',
    title: 'Frete RDV-852 disponível para assumir na Expedição',
    subtitle: 'GERDAU AÇOS LONGOS S.A. • Simões Filho - BA -> Aracaju - SE',
    timeLabel: '14/11/2026 11:54',
    createdAtIso: '2026-11-14T11:54:00.000Z',
    read: false,
    targetSection: 'fretes_expedicao',
    targetId: 'frete-852',
  };
  const duplicateRead: CorporateNotification = {
    ...sameA,
    id: 'n2',
    createdAtIso: '2026-11-14T11:55:00.000Z',
    read: true,
  };
  const updatedStage: CorporateNotification = {
    ...sameA,
    id: 'n3',
    title: 'Frete RDV-852 liberado para Monitoramento',
    subtitle: 'Etapa atualizada pela Expedição',
    createdAtIso: '2026-11-14T12:10:00.000Z',
    read: false,
  };

  const ordered = orderedNotifications([sameA, duplicateRead, updatedStage], 'user-1');
  assert.equal(ordered.length, 2, 'Mesma informação deve aparecer 1 vez e atualização distinta é permitida');
  const firstNotice = ordered.find((n) => n.targetId === 'frete-852' && n.title.includes('disponível'));
  assert.ok(firstNotice);
  assert.equal(firstNotice.read, true, 'Se qualquer cópia já foi lida, não volta para não lida');

  assert.equal(ordered.filter((n) => notificationMatches(n, 'nao_lidas')).length, 1);
});

test('unifiedFreightEngine: oculta Administrador das listas/transferências e cumpre regras de notificação', async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rodovar-portal-fixes-freight-'));
  process.env.RODOVAR_DATA_ROOT = tmpRoot;
  fs.mkdirSync(path.join(tmpRoot, 'data', 'freights-store'), { recursive: true });
  fs.mkdirSync(path.join(tmpRoot, 'data', 'freight-attachments'), { recursive: true });

  const {
    registerUnifiedFreightRoutes,
    pushFreightNotification,
  } = await import('../src/server/unifiedFreightEngine');

  const adminUser: Employee = {
    id: 'emp-admin-master',
    name: 'Administrador Geral RODOVAR',
    login: 'administrador',
    email: 'administrador@rodovar.com.br',
    roleTitle: 'Administrador Geral do Portal',
    department: 'Diretoria',
    accessLevel: 'ADMINISTRADOR',
    accessProfile: null,
    avatar: '/assets/default-avatar.png',
    active: true,
    approvalStatus: 'APROVADO',
    phoneExt: '',
    joinedAt: '01/01/2025',
  };
  const com1: Employee = {
    ...adminUser,
    id: 'emp-com-1',
    name: 'Elinete',
    login: 'elinete',
    email: 'elinete@rodovar.com.br',
    roleTitle: 'Executiva Comercial',
    department: 'Comercial',
    accessLevel: 'FUNCIONARIO',
    accessProfile: 'COMERCIAL',
  };
  const com2: Employee = {
    ...com1,
    id: 'emp-com-2',
    name: 'Suellen Aranda',
    login: 'suellen.aranda',
    email: 'suellen.aranda@rodovar.com.br',
  };
  const exp1: Employee = {
    ...com1,
    id: 'emp-exp-1',
    name: 'Priscila Santos',
    login: 'priscila.santos',
    email: 'priscila.santos@rodovar.com.br',
    roleTitle: 'Operadora de Expedição',
    department: 'Expedição',
    accessProfile: 'EXPEDICAO',
  };
  const mon1: Employee = {
    ...com1,
    id: 'emp-mon-1',
    name: 'Jairo Bahia',
    login: 'jairo.bahia',
    email: 'jairo.bahia@rodovar.com.br',
    roleTitle: 'Operador de Monitoramento',
    department: 'Monitoramento',
    accessProfile: 'MONITORAMENTO',
  };

  const users = [adminUser, com1, com2, exp1, mon1];
  const app = express();
  app.use(express.json());
  registerUnifiedFreightRoutes(
    app,
    (req: any, _res: any, next: any) => {
      const uid = String(req.headers['x-test-user'] || 'emp-com-1');
      req.sessionUser = users.find((u) => u.id === uid) || com1;
      next();
    },
    () => users,
    () => {}
  );

  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;

  try {
    // 1) Operadores nunca incluem o Administrador Geral
    const opRes = await fetch(`${base}/api/meus-fretes/operators`, {
      headers: { 'x-test-user': 'emp-com-1' },
    });
    assert.equal(opRes.status, 200);
    const opJson = await opRes.json();
    const allReturnedIds = [
      ...opJson.comercialOperators,
      ...opJson.expedicaoOperators,
      ...opJson.monitoramentoOperators,
    ].map((o: any) => o.id);
    assert.equal(
      allReturnedIds.includes('emp-admin-master'),
      false,
      'Administrador nunca deve aparecer nas listas de operadores'
    );
    assert.equal(opJson.comercialOperators.some((o: any) => o.id === 'emp-com-1'), true);
    assert.equal(opJson.expedicaoOperators.some((o: any) => o.id === 'emp-exp-1'), true);

    // 2) Criar frete e tentar transferir para o Administrador -> bloqueado (400)
    const createRes = await fetch(`${base}/api/meus-fretes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-test-user': 'emp-com-1',
        'x-idempotency-key': 'k-create-1',
      },
      body: JSON.stringify({
        cliente: 'GERDAU TESTE',
        origemCidadeUf: 'Simões Filho - BA',
        destinoCidadeUf: 'Aracaju - SE',
        valorCobradoClienteCentavos: 500000,
        valorContratadoCentavos: 350000,
      }),
    });
    assert.equal(createRes.status, 201);
    const { freight } = await createRes.json();

    const transferToAdmin = await fetch(`${base}/api/meus-fretes/${freight.id}/transfer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-test-user': 'emp-admin-master',
      },
      body: JSON.stringify({
        sector: 'COMERCIAL',
        newResponsibleId: 'emp-admin-master',
        reason: 'Teste de bloqueio',
      }),
    });
    assert.equal(
      transferToAdmin.status,
      400,
      'Transferência para Administrador deve ser rejeitada pelo backend'
    );

    // 3) Regras de notificação: mesma info 1 vez; atualização permitida; lida irreversível; deletada nunca volta
    pushFreightNotification({
      recipientId: 'emp-exp-1',
      title: 'Frete RDV-999 disponível para assumir na Expedição',
      subtitle: 'GERDAU TESTE • Simões Filho - BA -> Aracaju - SE',
      targetSection: 'fretes_expedicao',
      targetId: 'frete-test-999',
    });
    pushFreightNotification({
      recipientId: 'emp-exp-1',
      title: 'Frete RDV-999 disponível para assumir na Expedição',
      subtitle: 'GERDAU TESTE • Simões Filho - BA -> Aracaju - SE',
      targetSection: 'fretes_expedicao',
      targetId: 'frete-test-999',
    });
    // Mesma informação com dedupeKey diferente também deve ser bloqueada
    pushFreightNotification({
      recipientId: 'emp-exp-1',
      title: 'Frete RDV-999 disponível para assumir na Expedição',
      subtitle: 'GERDAU TESTE • Simões Filho - BA -> Aracaju - SE',
      targetSection: 'fretes_expedicao',
      targetId: 'frete-test-999',
      dedupeKey: 'different-key-same-info',
    });
    // Atualização da mesma informação (subtitle mudou) deve gerar nova notificação
    pushFreightNotification({
      recipientId: 'emp-exp-1',
      title: 'Frete RDV-999 disponível para assumir na Expedição',
      subtitle: 'GERDAU TESTE • Horário atualizado para 15:00',
      targetSection: 'fretes_expedicao',
      targetId: 'frete-test-999',
    });

    const list1 = await fetch(`${base}/api/meus-fretes/notifications`, {
      headers: { 'x-test-user': 'emp-exp-1' },
    }).then((r) => r.json());
    assert.equal(
      list1.notifications.length,
      2,
      'Deve conter 1 notificação original + 1 atualização, nunca duplicata idêntica'
    );

    const firstId = list1.notifications[0].id;
    const secondId = list1.notifications[1].id;

    // Marcar como lida -> não volta para não lida
    const markRes = await fetch(`${base}/api/meus-fretes/notifications/${firstId}/read`, {
      method: 'POST',
      headers: { 'x-test-user': 'emp-exp-1' },
    });
    assert.equal(markRes.status, 200);

    // Reenviar exatamente a mesma informação já lida -> não deve criar nem reabrir como não lida
    pushFreightNotification({
      recipientId: 'emp-exp-1',
      title: list1.notifications[0].title,
      subtitle: list1.notifications[0].subtitle,
      targetSection: 'fretes_expedicao',
      targetId: 'frete-test-999',
    });

    const listAfterRead = await fetch(`${base}/api/meus-fretes/notifications`, {
      headers: { 'x-test-user': 'emp-exp-1' },
    }).then((r) => r.json());
    const readItem = listAfterRead.notifications.find((n: any) => n.id === firstId);
    assert.ok(readItem);
    assert.equal(readItem.read, true, 'Após visualizada, notificação não pode voltar a ser não lida');

    // Deletar notificação -> apaga e não volta mesmo se disparar de novo a mesma info
    const delRes = await fetch(`${base}/api/meus-fretes/notifications/${secondId}`, {
      method: 'DELETE',
      headers: { 'x-test-user': 'emp-exp-1' },
    });
    assert.equal(delRes.status, 200);

    pushFreightNotification({
      recipientId: 'emp-exp-1',
      title: list1.notifications[1].title,
      subtitle: list1.notifications[1].subtitle,
      targetSection: 'fretes_expedicao',
      targetId: 'frete-test-999',
    });

    const listAfterDelete = await fetch(`${base}/api/meus-fretes/notifications`, {
      headers: { 'x-test-user': 'emp-exp-1' },
    }).then((r) => r.json());
    assert.equal(
      listAfterDelete.notifications.some((n: any) => n.id === secondId),
      false,
      'Notificação deletada não pode voltar na lista'
    );
    assert.equal(listAfterDelete.notifications.length, 1);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    process.on('exit', () => {
      try {
        fs.rmSync(tmpRoot, { recursive: true, force: true });
      } catch {
        // ignore cleanup race on exit
      }
    });
  }
});

test('POST /api/admin/users/:userId/password altera senha de qualquer usuário com RBAC, política e login válido', async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rodovar-portal-fixes-auth-'));
  fs.mkdirSync(path.join(tmpRoot, 'data', 'freights-store'), { recursive: true });
  fs.mkdirSync(path.join(tmpRoot, 'data', 'freight-attachments'), { recursive: true });
  fs.copyFileSync('data/rodovar-server-db.json', path.join(tmpRoot, 'data', 'rodovar-server-db.json'));
  if (fs.existsSync('data/access-bindings.json')) {
    fs.copyFileSync('data/access-bindings.json', path.join(tmpRoot, 'data', 'access-bindings.json'));
  }

  const prevRoot = process.env.RODOVAR_DATA_ROOT;
  const prevSkip = process.env.RODOVAR_SKIP_AUTOSTART;
  process.env.RODOVAR_DATA_ROOT = tmpRoot;
  process.env.RODOVAR_SKIP_AUTOSTART = '1';

  let server: import('http').Server | null = null;
  try {
    const serverMod = await import('../server');
    const app = serverMod.default();
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((r) => server!.once('listening', r));
    const base = `http://127.0.0.1:${(server.address() as any).port}`;

    const dbSnapshot = JSON.parse(
      fs.readFileSync(path.join(tmpRoot, 'data', 'rodovar-server-db.json'), 'utf8')
    );
    const adminUser = dbSnapshot.users.find((u: any) => u.accessLevel === 'ADMINISTRADOR');
    const targetUser = dbSnapshot.users.find(
      (u: any) => u.accessLevel !== 'ADMINISTRADOR' && u.approvalStatus === 'APROVADO' && u.active
    );
    assert.ok(adminUser && targetUser);

    const loginUser = async (identifier: string, password: string) => {
      const res = await fetch(`${base}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password, rememberMe: false }),
      });
      return { status: res.status, data: await res.json() };
    };

    const adminAuth = await loginUser(adminUser.login || adminUser.email, 'rodovar2027#@');
    assert.equal(adminAuth.status, 200);

    const userAuth = await loginUser(targetUser.login || targetUser.email, 'rodovar2027#@');
    assert.equal(userAuth.status, 200);

    // Não administrador não pode alterar senha de terceiros -> 403
    const forbiddenRes = await fetch(
      `${base}/api/admin/users/${encodeURIComponent(targetUser.id)}/password`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Rodovar-Session': userAuth.data.sessionId,
          'X-CSRF-Token': userAuth.data.csrfToken,
        },
        body: JSON.stringify({ password: 'NovaSenha@2027#', mustChangePassword: false }),
      }
    );
    assert.equal(forbiddenRes.status, 403);

    // Senha fraca rejeitada -> 400
    const weakRes = await fetch(
      `${base}/api/admin/users/${encodeURIComponent(targetUser.id)}/password`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Rodovar-Session': adminAuth.data.sessionId,
          'X-CSRF-Token': adminAuth.data.csrfToken,
        },
        body: JSON.stringify({ password: '123', mustChangePassword: false }),
      }
    );
    assert.equal(weakRes.status, 400);

    // Admin altera senha -> 200 e senha antiga para de funcionar, nova senha funciona
    const newSecret = 'RodovarForte#2028!';
    const changeRes = await fetch(
      `${base}/api/admin/users/${encodeURIComponent(targetUser.id)}/password`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Rodovar-Session': adminAuth.data.sessionId,
          'X-CSRF-Token': adminAuth.data.csrfToken,
        },
        body: JSON.stringify({ password: newSecret, mustChangePassword: true }),
      }
    );
    assert.equal(changeRes.status, 200);
    const changeJson = await changeRes.json();
    assert.equal(changeJson.ok, true);
    assert.equal(changeJson.user.mustChangePassword, true);

    const oldLogin = await loginUser(targetUser.login || targetUser.email, 'rodovar2027#@');
    assert.equal(oldLogin.status, 401);

    const newLogin = await loginUser(targetUser.login || targetUser.email, newSecret);
    assert.equal(newLogin.status, 200);
    assert.equal(newLogin.data.user.mustChangePassword, true);
  } finally {
    if (server) {
      await new Promise<void>((r) => server!.close(() => r()));
    }
    if (prevRoot === undefined) delete process.env.RODOVAR_DATA_ROOT;
    else process.env.RODOVAR_DATA_ROOT = prevRoot;
    if (prevSkip === undefined) delete process.env.RODOVAR_SKIP_AUTOSTART;
    else process.env.RODOVAR_SKIP_AUTOSTART = prevSkip;
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});
