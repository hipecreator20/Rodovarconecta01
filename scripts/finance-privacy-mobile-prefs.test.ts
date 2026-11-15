import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import {
  canViewFinancialValuesAndStats,
  normalizePortalNotificationPreferences,
  shouldUserReceiveNotification,
} from '../src/lib/permissions';
import type { Employee } from '../src/types';

function makeUser(overrides: Partial<Employee> & { id: string }): Employee {
  return {
    id: overrides.id,
    name: overrides.name || overrides.id,
    email: overrides.email || `${overrides.id}@rodovar.com.br`,
    login: overrides.login || overrides.email || `${overrides.id}@rodovar.com.br`,
    roleTitle: overrides.roleTitle || 'Colaborador',
    department: overrides.department || 'Logística',
    accessLevel: overrides.accessLevel || 'FUNCIONARIO',
    accessProfile: overrides.accessProfile,
    avatar: '/assets/default-avatar.png',
    hasCustomAvatar: false,
    approvalStatus: 'APROVADO',
    phoneExt: '71999990000',
    joinedAt: '01/01/2025',
    active: true,
    ...overrides,
  };
}

test('visibilidade financeira estrita: apenas Petrônio, Vitor, Alexandre e Ricardo veem valores e estatísticas', () => {
  const petronio = makeUser({
    id: 'emp-7',
    name: 'Petrônio Santos',
    email: 'petronio.santos@rodovar.com.br',
    department: 'Financeiro',
    accessProfile: 'FINANCEIRO',
  });
  const vitor = makeUser({
    id: 'emp-2',
    name: 'Vitor',
    email: 'vitor@rodovar.com.br',
    department: 'Diretoria',
    accessLevel: 'DIRETORIA',
    accessProfile: 'DIRETORIA',
  });
  const alexandre = makeUser({
    id: 'emp-admin-google-migrated',
    name: 'Alexandre',
    email: 'alexandre@rodovar.com.br',
    department: 'Diretoria',
    accessLevel: 'DIRETORIA',
    accessProfile: 'DIRETORIA',
  });
  const ricardo = makeUser({
    id: 'emp-diretoria-ricardo',
    name: 'Ricardo',
    email: 'ricardo@rodovar.com.br',
    department: 'Diretoria',
    accessLevel: 'DIRETORIA',
    accessProfile: 'DIRETORIA',
  });

  const admin = makeUser({
    id: 'emp-admin-master',
    name: 'Administrador Geral',
    email: 'administrador@rodovar.com.br',
    department: 'Administrativo',
    accessLevel: 'ADMINISTRADOR',
  });
  const mon = makeUser({
    id: 'emp-mon-1',
    email: 'monitoramento@rodovar.com.br',
    department: 'Monitoramento',
    accessProfile: 'MONITORAMENTO',
  });
  const com = makeUser({
    id: 'emp-com-1',
    email: 'comercial@rodovar.com.br',
    department: 'Comercial',
    accessProfile: 'COMERCIAL',
  });
  const exp = makeUser({
    id: 'emp-exp-1',
    email: 'expedicao@rodovar.com.br',
    department: 'Expedição',
    accessProfile: 'EXPEDICAO',
  });
  const outroFin = makeUser({
    id: 'emp-fin-outro',
    email: 'auxiliar.financeiro@rodovar.com.br',
    department: 'Financeiro',
    accessProfile: 'FINANCEIRO',
  });
  const outroDir = makeUser({
    id: 'emp-dir-outro',
    email: 'outro.diretor@rodovar.com.br',
    department: 'Diretoria',
    accessLevel: 'DIRETORIA',
    accessProfile: 'DIRETORIA',
  });

  assert.equal(canViewFinancialValuesAndStats(petronio), true);
  assert.equal(canViewFinancialValuesAndStats(vitor), true);
  assert.equal(canViewFinancialValuesAndStats(alexandre), true);
  assert.equal(canViewFinancialValuesAndStats(ricardo), true);

  assert.equal(canViewFinancialValuesAndStats(admin), false);
  assert.equal(canViewFinancialValuesAndStats(mon), false);
  assert.equal(canViewFinancialValuesAndStats(com), false);
  assert.equal(canViewFinancialValuesAndStats(exp), false);
  assert.equal(canViewFinancialValuesAndStats(outroFin), false);
  assert.equal(canViewFinancialValuesAndStats(outroDir), false);
});

test('fluxo integrado: redação financeira na API, upload WebP/PNG mobile, ocorrência com anexo, notificação para responsável/monitoramento e filtro de preferências', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rodovar-finance-privacy-test-'));
  process.env.RODOVAR_DATA_ROOT = root;

  const petronio = makeUser({
    id: 'emp-7',
    name: 'Petrônio Santos',
    email: 'petronio.santos@rodovar.com.br',
    department: 'Financeiro',
    accessProfile: 'FINANCEIRO',
  });
  const vitor = makeUser({
    id: 'emp-2',
    name: 'Vitor',
    email: 'vitor@rodovar.com.br',
    department: 'Diretoria',
    accessLevel: 'DIRETORIA',
    accessProfile: 'DIRETORIA',
  });
  const admin = makeUser({
    id: 'emp-admin-master',
    name: 'Administrador Geral',
    email: 'administrador@rodovar.com.br',
    department: 'Administrativo',
    accessLevel: 'ADMINISTRADOR',
  });
  const com = makeUser({
    id: 'com1',
    name: 'Comercial 1',
    email: 'com1@rodovar.com.br',
    department: 'Comercial',
    accessProfile: 'COMERCIAL',
  });
  const exp = makeUser({
    id: 'exp1',
    name: 'Expedição 1',
    email: 'exp1@rodovar.com.br',
    department: 'Expedição',
    accessProfile: 'EXPEDICAO',
  });
  const mon = makeUser({
    id: 'mon1',
    name: 'Monitoramento 1',
    email: 'mon1@rodovar.com.br',
    department: 'Monitoramento',
    accessProfile: 'MONITORAMENTO',
  });

  const users = [petronio, vitor, admin, com, exp, mon];

  const { registerUnifiedFreightRoutes } = await import('../src/server/unifiedFreightEngine');
  const { registerPaymentReceiptRoutes, validatePaymentReceiptBinary } = await import(
    '../src/server/paymentReceiptsEngine'
  );

  // 1. Validate WebP magic bytes support for mobile screenshots
  const webpBuf = Buffer.concat([
    Buffer.from('RIFF'),
    Buffer.from([0x24, 0x00, 0x00, 0x00]),
    Buffer.from('WEBP'),
    Buffer.from('VP8 '),
    Buffer.alloc(16, 0),
  ]);
  const webpCheck = validatePaymentReceiptBinary(webpBuf, 'comprovante-celular.webp');
  assert.equal(webpCheck.valid, true);
  assert.equal(webpCheck.mimeType, 'image/webp');

  const app = express();
  app.use(express.json({ limit: '15mb' }));
  registerUnifiedFreightRoutes(
    app,
    (req: any, _res: any, next: any) => {
      req.sessionUser = users.find((u) => u.id === req.headers['x-test-user']);
      next();
    },
    () => users,
    () => {}
  );
  registerPaymentReceiptRoutes(
    app,
    (req: any, _res: any, next: any) => {
      req.sessionUser = users.find((u) => u.id === req.headers['x-test-user']);
      next();
    },
    () => {}
  );

  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((r) => server.once('listening', r));
  const base = 'http://127.0.0.1:' + (server.address() as any).port;
  let seq = 0;

  const callJson = async (uid: string, urlPath: string, body?: any, method = 'POST') => {
    const r = await fetch(base + urlPath, {
      method: body ? method : 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-test-user': uid,
        'x-idempotency-key': `key-${++seq}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, body: await r.json() };
  };

  try {
    // 2. Create unified freight from Comercial -> Expedição -> Monitoramento
    const created = await callJson('com1', '/api/meus-fretes', {
      cliente: 'Cliente Privacidade Financeira Ltda',
      origemCidadeUf: 'Salvador/BA',
      destinoCidadeUf: 'Feira de Santana/BA',
      enderecoColeta: 'Rua A, 100',
      tipoCarga: 'Carga Geral',
      valorCobradoClienteCentavos: 250000,
      pesoKg: 1500,
      volumes: 12,
      veiculoNecessario: 'Truck',
      confirmAndSendToExpedicao: true,
    });
    assert.equal(created.status, 201);
    const freightId = created.body.freight.id;

    assert.equal((await callJson('exp1', `/api/meus-fretes/${freightId}/claim`, {})).status, 200);
    assert.equal(
      (
        await callJson(
          'exp1',
          `/api/meus-fretes/${freightId}/operational`,
          {
            motoristaNome: 'João Motorista',
            motoristaCpf: '12345678901',
            motoristaTelefone: '71988887777',
            transportadorNome: 'Rodovar Frota',
            placaVeiculo: 'RDV1A23',
            valorContratadoCentavos: 180000,
            condicoesPagamento: '70% Adiantamento / 30% Saldo',
            condicoesOperacionais: 'Pagamento via PIX conferido',
            chavePix: '71988887777',
            tipoChavePix: 'TELEFONE',
            checklistFechamento: {
              motoristaConfirmado: true,
              veiculoConfirmado: true,
              condicoesConferidas: true,
              documentosConferidos: true,
            },
          },
          'PUT'
        )
      ).status,
      200
    );

    for (const action of [
      'REGISTRAR_VIDEOCHAMADA',
      'EMITIR_ORDEM',
      'CONFIRMAR_ENVIO_ORDEM_MOTORISTA',
      'LIBERAR_PARA_MONITORAMENTO',
    ]) {
      const resAction = await callJson(
        'exp1',
        `/api/meus-fretes/${freightId}/expedicao-action`,
        { action, monitoramentoResponsavelId: 'mon1' }
      );
      assert.equal(resAction.status, 200);
    }

    // 3. Occurrence with attachment on Monitoramento
    const occRes = await callJson('mon1', `/api/meus-fretes/${freightId}/occurrences`, {
      title: 'Comprovante de pesagem na balança',
      category: 'ATRASO_COLETA',
      severity: 'ATENCAO',
      description: 'Anexado ticket de pesagem via celular',
      blocking: false,
      attachment: {
        fileName: 'ticket-celular.webp',
        dataUrl: `data:image/webp;base64,${webpBuf.toString('base64')}`,
      },
    });
    assert.equal(occRes.status, 201);
    assert.ok(occRes.body.occurrence.attachmentId);
    assert.equal(occRes.body.occurrence.attachmentName, 'ticket-celular.webp');
    assert.ok(
      occRes.body.anexos.some(
        (a: any) =>
          a.id === occRes.body.occurrence.attachmentId && a.fileName === 'ticket-celular.webp'
      )
    );

    // 4. Financial redaction check on /api/pagamentos/fretes
    const petronioList = await callJson('emp-7', '/api/pagamentos/fretes');
    const vitorList = await callJson('emp-2', '/api/pagamentos/fretes');
    const adminList = await callJson('emp-admin-master', '/api/pagamentos/fretes');

    const petFreight = petronioList.body.freights.find((f: any) => f.id === freightId);
    const vitFreight = vitorList.body.freights.find((f: any) => f.id === freightId);
    const admFreight = adminList.body.freights.find((f: any) => f.id === freightId);

    assert.equal(petFreight.valorTotal, 1800);
    assert.equal(vitFreight.valorTotal, 1800);
    assert.equal(admFreight.valorTotal, null);
    assert.equal(admFreight.valorAdiantamento, null);
    assert.equal(admFreight.valorSaldo, null);
    assert.equal(admFreight.chavePix, '••••••••');
    assert.equal(adminList.body.canViewFinancialStatsAndValues, false);
    assert.equal(petronioList.body.canViewFinancialStatsAndValues, true);

    // Also verify /api/meus-fretes/:freightId hides money from admin & mon1
    const admDetail = await callJson('emp-admin-master', `/api/meus-fretes/${freightId}`);
    const monDetail = await callJson('mon1', `/api/meus-fretes/${freightId}`);
    const vitDetail = await callJson('emp-2', `/api/meus-fretes/${freightId}`);
    assert.equal(admDetail.body.freight.valorContratadoCentavos, undefined);
    assert.equal(admDetail.body.freight.valorOculto, true);
    assert.equal(monDetail.body.freight.valorContratadoCentavos, undefined);
    assert.equal(monDetail.body.freight.valorOculto, true);
    assert.equal(vitDetail.body.freight.valorContratadoCentavos, 180000);

    // 5. Upload WebP mobile receipt & confirm payment -> syncs to unified freight + notifies responsible & Monitoramento
    const uploadRes = await callJson('emp-7', '/api/pagamentos/comprovantes', {
      freightId,
      installmentType: 'ADIANTAMENTO',
      origin: 'COMPARTILHAMENTO',
      fileName: 'comprovante-pix-celular.webp',
      dataUrl: `data:image/webp;base64,${webpBuf.toString('base64')}`,
      transactionCode: 'E2E-PIX-998877',
    });
    assert.equal(uploadRes.status, 201);
    const receiptId = uploadRes.body.receipt.id;

    const confirmRes = await callJson(
      'emp-7',
      `/api/pagamentos/comprovantes/${receiptId}/confirmar`,
      { transactionCode: 'E2E-PIX-998877' }
    );
    assert.equal(confirmRes.status, 200);
    assert.equal(confirmRes.body.freight.adiantamentoPago, true);

    // Check unified freight annexes synced COMPROVANTE_PAGAMENTO
    const postPayDetail = await callJson('emp-2', `/api/meus-fretes/${freightId}`);
    assert.ok(
      postPayDetail.body.anexos.some(
        (a: any) =>
          a.category === 'COMPROVANTE_PAGAMENTO' &&
          a.fileName === 'comprovante-pix-celular.webp'
      )
    );

    // 6. Check notifications created for freight responsibles (com1, exp1) and Monitoramento (mon1)
    const expNotifsBefore = await callJson('exp1', '/api/meus-fretes/notifications');
    const monNotifsBefore = await callJson('mon1', '/api/meus-fretes/notifications');
    assert.ok(
      expNotifsBefore.body.notifications.some(
        (n: any) => n.targetId === freightId && /Comprovante|Pagamento confirmado/i.test(n.title)
      )
    );
    assert.ok(
      monNotifsBefore.body.notifications.some(
        (n: any) => n.targetId === freightId && /Comprovante|Pagamento confirmado/i.test(n.title)
      )
    );

    // 7. Notification preferences filtering per collaborator
    exp.notificationPreferences = normalizePortalNotificationPreferences({
      financeiroPagamentos: false,
      ocorrenciasMonitoramento: true,
    });
    const expNotifsAfterOptOut = await callJson('exp1', '/api/meus-fretes/notifications');
    assert.equal(
      expNotifsAfterOptOut.body.notifications.some((n: any) =>
        /Comprovante|Pagamento confirmado/i.test(n.title)
      ),
      false
    );
    assert.equal(
      shouldUserReceiveNotification(exp, {
        targetSection: 'financeiro',
        title: 'Pagamento confirmado',
      }),
      false
    );
    assert.equal(
      shouldUserReceiveNotification(exp, {
        targetSection: 'fretes_ativos',
        title: 'Nova ocorrência registrada',
      }),
      true
    );
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    delete process.env.RODOVAR_DATA_ROOT;
  }
});
