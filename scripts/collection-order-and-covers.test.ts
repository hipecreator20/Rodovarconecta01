import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

const makeUser = (
  id: string,
  accessProfile: string | null,
  overrides: Record<string, any> = {}
): any => ({
  id,
  name: `Operador ${id}`,
  login: id,
  email: `${id}@rodovar.com.br`,
  active: true,
  approvalStatus: 'APROVADO',
  accessLevel: 'FUNCIONARIO',
  department: 'Logística',
  roleTitle: accessProfile || 'Operador',
  accessProfile,
  ...overrides,
});

test('Capas por cliente: aguarda salvamento assíncrono, aceita PNG/JPG/WebP/GIF e envia Cache-Control no-store', async () => {
  const { registerCustomerCovers } = await import('../src/server/customerCovers');

  const users: Record<string, any> = {
    admin: makeUser('admin', null, { accessLevel: 'ADMINISTRADOR' }),
    mon: makeUser('mon', 'MONITORAMENTO'),
  };
  const db: any = {};
  let saveFinished = false;
  let saveCalls = 0;

  const app = express();
  app.use(express.json({ limit: '5mb' }));
  registerCustomerCovers(
    app,
    (req: any, res: any, next: any) => {
      const uid = String(req.headers['x-test-user'] || '');
      req.sessionUser = users[uid];
      if (!req.sessionUser) {
        res.status(401).json({ error: 'Não autenticado.' });
        return;
      }
      next();
    },
    db,
    async () => {
      await new Promise((r) => setTimeout(r, 35));
      saveFinished = true;
      saveCalls += 1;
    }
  );

  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;

  try {
    const webpDataUrl =
      'data:image/webp;base64,' +
      Buffer.concat([
        Buffer.from('RIFF'),
        Buffer.from([0x10, 0x00, 0x00, 0x00]),
        Buffer.from('WEBP'),
        Buffer.from('VP8 '),
      ]).toString('base64');

    const gifDataUrl =
      'data:image/gif;base64,' +
      Buffer.from('GIF89a\x01\x00\x01\x00\x00\x00\x00;', 'binary').toString('base64');

    const resWebp = await fetch(`${base}/api/customer-covers`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-test-user': 'mon' },
      body: JSON.stringify({ customer: 'Cliente WebP', dataUrl: webpDataUrl }),
    });
    assert.equal(resWebp.status, 200);
    assert.equal(
      saveFinished,
      true,
      'PUT /api/customer-covers deve aguardar a persistência assíncrona antes de responder 200'
    );
    assert.equal(saveCalls, 1);

    saveFinished = false;
    const resGif = await fetch(`${base}/api/customer-covers`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-test-user': 'admin' },
      body: JSON.stringify({ customer: 'Cliente GIF', dataUrl: gifDataUrl }),
    });
    assert.equal(resGif.status, 200);
    assert.equal(saveFinished, true);
    assert.equal(saveCalls, 2);

    const getRes = await fetch(`${base}/api/customer-covers`, {
      headers: { 'x-test-user': 'mon' },
    });
    assert.equal(getRes.status, 200);
    assert.match(getRes.headers.get('cache-control') || '', /no-store/);
    const body = await getRes.json();
    assert.equal(body.covers.length, 2);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});

test('Remoção da AXD em novas operações, preservação histórica (#0840), Ordem de Coleta dupla RODOVAR/VL e "Ignorar por enquanto"', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rodovar-oc-test-'));
  process.env.RODOVAR_DATA_ROOT = root;

  const { registerUnifiedFreightRoutes } = await import('../src/server/unifiedFreightEngine');
  const { CARRIER_BRANDS, parseOperationalTrafficScript } = await import('../src/lib/carrierLogos');
  const {
    COMPANY_LEGAL_PROFILES,
    buildCollectionOrderViewModel,
    validateFreightForCollectionOrder,
    generateCollectionOrderPdfA4,
  } = await import('../src/lib/freightOrderPdfGenerator');
  const { canReleaseWithCollectionOrderOrPending } = await import(
    '../src/lib/expeditionValidation'
  );

  assert.deepEqual(CARRIER_BRANDS, ['RODOVAR', 'VL TRANSPORTES']);
  const parsedAxdScript = parseOperationalTrafficScript('EMPRESA: AXD\nCLIENTE: Teste');
  assert.notEqual(parsedAxdScript.empresaMarca, 'AXD');
  assert.equal(parsedAxdScript.empresaMarca, 'RODOVAR');

  const users = [
    makeUser('com1', 'COMERCIAL', { name: 'Ana Comercial' }),
    makeUser('exp1', 'EXPEDICAO', { name: 'Lucas Expedição' }),
    makeUser('mon1', 'MONITORAMENTO', { name: 'Bruno Monitoramento' }),
    makeUser('adm1', null, { accessLevel: 'ADMINISTRADOR', name: 'Admin Master' }),
  ];

  const auditLogs: Array<{ action: string; details: string }> = [];
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  registerUnifiedFreightRoutes(
    app,
    (req: any, res: any, next: any) => {
      const uid = String(req.headers['x-test-user'] || '');
      req.sessionUser = users.find((u) => u.id === uid);
      if (!req.sessionUser) {
        res.status(401).json({ error: 'Não autenticado.' });
        return;
      }
      next();
    },
    () => users,
    (_actorId, _actorName, _actorRole, action, details) => {
      auditLogs.push({ action, details });
    }
  );

  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;

  let reqSeq = 0;
  const call = async (uid: string, endpoint: string, body?: any, method = 'POST') => {
    const res = await fetch(`${base}/api/meus-fretes${endpoint}`, {
      method: body !== undefined ? method : 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-test-user': uid,
        'x-idempotency-key': `oc-test-${++reqSeq}`,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };

  try {
    // 1. Rejeitar criação de novo frete com AXD
    const createAxd = await call('com1', '', {
      empresaMarca: 'AXD',
      cliente: 'Cliente Bloqueado',
      origemCidadeUf: 'Salvador/BA',
      destinoCidadeUf: 'Recife/PE',
      enderecoColeta: 'Rua A, 10',
      tipoCarga: 'Bobinas',
      valorCobradoClienteCentavos: 180000,
      pesoKg: 12000,
      volumes: 4,
      veiculoNecessario: 'Carreta',
      dataColetaIso: '2026-11-20',
      dataEntregaPrevistaIso: '2026-11-22',
    });
    assert.equal(createAxd.status, 400);
    assert.equal(createAxd.body.code, 'DISCONTINUED_COMPANY_BRAND');

    // 2. Preservar registros históricos da AXD (#0840) em leitura, bloqueando nova emissão de Ordem de Coleta
    const allFreightsRes = await call('adm1', '?area=MONITORAMENTO&scope=EQUIPE&viewMode=ATIVOS&page=1&limit=50');
    assert.equal(allFreightsRes.status, 200);
    const historicalAxd = allFreightsRes.body.items.find(
      (f: any) => f.protocol === '#0840' && f.empresaMarca === 'AXD'
    );
    assert.ok(historicalAxd, 'Registro histórico #0840 com AXD deve permanecer preservado');

    const emitOnHistoricalAxd = await call('adm1', `/${historicalAxd.id}/expedicao-action`, {
      action: 'EMITIR_ORDEM',
    });
    assert.equal(emitOnHistoricalAxd.status, 400);
    assert.equal(emitOnHistoricalAxd.body.code, 'DISCONTINUED_COMPANY_BRAND');

    // 3. Criar fretes RODOVAR e VL TRANSPORTES, testar rejeição de edição para AXD e numeração sequencial por empresa
    const createFreight = async (brand: 'RODOVAR' | 'VL TRANSPORTES', suffix: string) => {
      const created = await call('com1', '', {
        empresaMarca: brand,
        cliente: `Cliente Real ${suffix}`,
        clienteCnpj: '11.222.333/0001-81',
        clienteContato: '(71) 99999-1111',
        origemCidadeUf: 'Salvador/BA',
        destinoCidadeUf: 'Belo Horizonte/MG',
        enderecoColeta: `Rua Industrial ${suffix}, 200`,
        enderecoEntrega: `Av. Destino ${suffix}, 500`,
        tipoCarga: `Carga Industrial ${suffix}`,
        valorCobradoClienteCentavos: 999900,
        observacoes: 'NOTA INTERNA SIGILOSA NAO EXIBIR NA ORDEM',
        pesoKg: 14500,
        volumes: 18,
        veiculoNecessario: 'Carreta LS',
        dataColetaIso: '2026-11-20',
        dataEntregaPrevistaIso: '2026-11-23',
        confirmAndSendToExpedicao: true,
      });
      assert.equal(created.status, 201);
      return created.body.freight.id as string;
    };

    const rdvId1 = await createFreight('RODOVAR', 'RDV-1');
    const vlId1 = await createFreight('VL TRANSPORTES', 'VL-1');
    const rdvId2 = await createFreight('RODOVAR', 'RDV-2');

    // Comercial não pode alterar empresa para AXD
    const updateToAxd = await call(
      'com1',
      `/${rdvId1}/comercial`,
      { empresaMarca: 'AXD' },
      'PUT'
    );
    assert.equal(updateToAxd.status, 400);
    assert.equal(updateToAxd.body.code, 'DISCONTINUED_COMPANY_BRAND');

    const fillOperational = async (fid: string, idx: number) => {
      const claim = await call('exp1', `/${fid}/claim`, {});
      assert.equal(claim.status, 200);
      const upd = await call(
        'exp1',
        `/${fid}/operational`,
        {
          motoristaNome: `Carlos Motorista ${idx}`,
          motoristaCpf: '12345678901',
          motoristaRg: `RG10020${idx}`,
          motoristaCnh: `CNH9900${idx}`,
          motoristaTelefone: '(71) 98888-7777',
          transportadorNome: `Transportadora Parceira ${idx}`,
          placaVeiculo: `ABC1D2${idx}`,
          placaCarreta: `XYZ9K8${idx}`,
          placaBitrem: `BIT4M5${idx}`,
          valorContratadoCentavos: 620000,
          condicoesPagamento: '70% Adiantamento / 30% Saldo',
          condicoesOperacionais: 'Uso obrigatório de capacete e bota na coleta.',
          numeroPedido: `PED-${idx}00`,
          numeroOrcamento: `ORC-${idx}00`,
          pontoReferencia: `Próximo ao anel viário ${idx}`,
          especieCarga: 'PALETIZADA',
          embalagemCarga: 'CAIXAS LACRADAS',
          valorMercadoriaCentavos: 12500000,
          quantidadeEntregas: 2,
          remetenteNome: `Remetente Real ${idx}`,
          remetenteCnpjCpf: '22.333.444/0001-99',
          remetenteEndereco: `Galpão Coleta ${idx}`,
          remetenteMunicipio: 'Salvador/BA',
          destinatarioNome: `Destinatário Real ${idx}`,
          destinatarioCnpjCpf: '33.444.555/0001-66',
          destinatarioEndereco: `Doca Entrega ${idx}`,
          destinatarioMunicipio: 'Belo Horizonte/MG',
          checklistFechamento: {
            motoristaConfirmado: true,
            veiculoConfirmado: true,
            condicoesConferidas: true,
            documentosConferidos: true,
          },
        },
        'PUT'
      );
      assert.equal(upd.status, 200);
    };

    await fillOperational(rdvId1, 1);
    await fillOperational(vlId1, 2);
    await fillOperational(rdvId2, 3);

    const emitRdv1 = await call('exp1', `/${rdvId1}/expedicao-action`, { action: 'EMITIR_ORDEM' });
    const emitVl1 = await call('exp1', `/${vlId1}/expedicao-action`, { action: 'EMITIR_ORDEM' });
    const emitRdv2 = await call('exp1', `/${rdvId2}/expedicao-action`, { action: 'EMITIR_ORDEM' });

    assert.equal(emitRdv1.status, 200);
    assert.equal(emitVl1.status, 200);
    assert.equal(emitRdv2.status, 200);

    // Numeração independente e sequencial por empresa (sem ano)
    assert.match(emitRdv1.body.loadingOrder.orderNumber, /^OC-RDV-000001$/);
    assert.match(emitVl1.body.loadingOrder.orderNumber, /^OC-VL-000001$/);
    assert.match(emitRdv2.body.loadingOrder.orderNumber, /^OC-RDV-000002$/);

    // Dados reais oficiais sem vazamento de valor cobrado do cliente, notas internas ou exemplos do PDF
    assert.equal(emitRdv1.body.loadingOrder.cnpj, COMPANY_LEGAL_PROFILES.RODOVAR.cnpj);
    assert.equal(emitVl1.body.loadingOrder.cnpj, COMPANY_LEGAL_PROFILES['VL TRANSPORTES'].cnpj);
    assert.equal(emitRdv1.body.loadingOrder.valorCobradoClienteCentavos, undefined);
    assert.equal(emitRdv1.body.loadingOrder.observacoes, undefined);

    const serializedOrders = JSON.stringify([emitRdv1.body.loadingOrder, emitVl1.body.loadingOrder]);
    for (const forbidden of [
      '999900',
      'NOTA INTERNA SIGILOSA',
      'PSI AUTOMACAO',
      'CIA DE FERRO',
      'ARMCO',
      'TIAGO DA SILVA',
    ]) {
      assert.equal(
        serializedOrders.includes(forbidden),
        false,
        `Ordem de Coleta não deve conter "${forbidden}"`
      );
    }

    const vmRdv = buildCollectionOrderViewModel(emitRdv1.body.freight, 'Lucas Expedição');
    assert.equal(vmRdv.brand, 'RODOVAR');
    assert.equal(vmRdv.seqFormatted, '000001');
    assert.equal(vmRdv.fullCode, 'OC-RDV-000001');
    assert.equal(vmRdv.company.cnpj, '49908710000103');
    assert.equal(vmRdv.company.ie, '205429099');
    assert.equal(vmRdv.pedido, 'PED-100');
    assert.equal(vmRdv.motoristaRg, 'RG100201');
    assert.equal(vmRdv.motoristaCnh, 'CNH99001');
    assert.equal(validateFreightForCollectionOrder(emitRdv1.body.freight).length, 0);

    const vmVl = buildCollectionOrderViewModel(emitVl1.body.freight, 'Lucas Expedição');
    assert.equal(vmVl.brand, 'VL TRANSPORTES');
    assert.equal(vmVl.seqFormatted, '000001');
    assert.equal(vmVl.fullCode, 'OC-VL-000001');
    assert.equal(vmVl.company.cnpj, '54506363000122');
    assert.equal(vmVl.remetenteNome, 'REMETENTE REAL 2');
    assert.equal(vmVl.destinatarioNome, 'DESTINATÁRIO REAL 2');

    // 4. Fluxo "Ignorar por enquanto" na Expedição -> Monitoramento -> Emissão Posterior
    const skipFreightId = await createFreight('VL TRANSPORTES', 'SKIP-1');
    await fillOperational(skipFreightId, 4);
    const vid = await call('exp1', `/${skipFreightId}/expedicao-action`, {
      action: 'REGISTRAR_VIDEOCHAMADA',
    });
    assert.equal(vid.status, 200);

    const skipRes = await call('exp1', `/${skipFreightId}/expedicao-action`, {
      action: 'IGNORAR_ORDEM_COLETA',
      reason: 'Cliente liberará janela de coleta amanhã cedo',
    });
    assert.equal(skipRes.status, 200);
    assert.equal(skipRes.body.freight.ordemColetaPendente, true);
    assert.equal(skipRes.body.freight.ordemCarregamentoNumero, undefined);
    assert.equal(
      skipRes.body.freight.ordemColetaIgnoradaMotivo,
      'Cliente liberará janela de coleta amanhã cedo'
    );
    assert.equal(skipRes.body.historico[0].eventType, 'ORDEM_COLETA_PENDENTE');
    assert.equal(canReleaseWithCollectionOrderOrPending(skipRes.body.freight), true);
    assert.ok(
      auditLogs.some((l) => l.action === 'EXPEDICAO_IGNORAR_ORDEM_COLETA'),
      'Deve registrar log de auditoria ao ignorar ordem de coleta'
    );

    // PDF oficial não pode ser baixado sem ordem emitida enquanto pendente
    await assert.rejects(
      () => generateCollectionOrderPdfA4(skipRes.body.freight, 'Lucas Expedição'),
      /Ignorar por enquanto/
    );

    // Liberar para monitoramento mesmo sem Ordem emitida
    const releaseRes = await call('exp1', `/${skipFreightId}/expedicao-action`, {
      action: 'LIBERAR_PARA_MONITORAMENTO',
      monitoramentoResponsavelId: 'mon1',
    });
    assert.equal(releaseRes.status, 200);
    assert.equal(releaseRes.body.freight.situacaoOperacional, 'LIBERADO_MONITORAMENTO');
    assert.equal(releaseRes.body.freight.situacaoMonitoramento, 'NOVO_PARA_CARREGAR');
    assert.equal(releaseRes.body.freight.ordemColetaPendente, true);

    // Emitir Ordem de Coleta oficial posteriormente limpa a pendência e aloca OC-VL-000002
    const lateEmit = await call('exp1', `/${skipFreightId}/expedicao-action`, {
      action: 'EMITIR_ORDEM',
    });
    assert.equal(lateEmit.status, 200);
    assert.equal(lateEmit.body.freight.ordemColetaPendente, false);
    assert.match(lateEmit.body.loadingOrder.orderNumber, /^OC-VL-000002$/);

    // 5. Importação de Script WhatsApp para a página de fretes mantendo campos ausentes em branco
    const whatsappScript = [
      '🗓️ DATA CARREGAMENTO: 13/11/2026',
      '💼 COMERCIAL: MARIVAL/CÉSAR',
      '🏭 UNIDADE: BA',
      '🏢 CLIENTE: PRINER  - JAMERSON',
      '📞 TEL CLIENTE:',
      '🚚 MOTORISTA: MARCELINO CARMO PEREIRA',
      '📞 TEL MOTORISTA: 71-99736-9167',
      '🚨 TEL EMERGÊNCIA:',
      '🚨 CONTATO EMERGÊNCIA:',
      '📍 ORIGEM: CAMAÇARI-BA',
      '🏁 DESTINO: SÃO FRANCISCO DO CONDE-BA',
      '💵 FRETE EMP: R$ 1.518,00',
      '💸 FRETE MOT: R$ 900,00',
      '👤 FAVORECIDO: MARCELINO CARMO PEREIRA',
      '🔑 CHAVE PIX: 71997369167',
      '🏛️ BANCO: Nubank',
      '📝 Obs.: PAGAMENTO INTEGRAL DO FRETE',
    ].join('\n');

    const parsedScript = parseOperationalTrafficScript(whatsappScript);
    assert.equal(parsedScript.dataCarregamento, '13/11/2026');
    assert.equal(parsedScript.dataColetaIso, '2026-11-13');
    assert.equal(parsedScript.comercialResponsavel, 'MARIVAL/CÉSAR');
    assert.equal(parsedScript.unidadeOperacional, 'BA - Salvador');
    assert.equal(parsedScript.cliente, 'PRINER - JAMERSON');
    assert.equal(parsedScript.telefoneCliente, '');
    assert.equal(parsedScript.motoristaNome, 'MARCELINO CARMO PEREIRA');
    assert.equal(parsedScript.motoristaTelefone, '71-99736-9167');
    assert.equal(parsedScript.emergenciaTelefone, '');
    assert.equal(parsedScript.emergenciaNome, '');
    assert.equal(parsedScript.origem, 'CAMAÇARI-BA');
    assert.equal(parsedScript.destino, 'SÃO FRANCISCO DO CONDE-BA');
    assert.equal(parsedScript.valorFreteEmpresa, 1518);
    assert.equal(parsedScript.valorFreteMotorista, 900);
    assert.equal(parsedScript.favorecido, 'MARCELINO CARMO PEREIRA');
    assert.equal(parsedScript.chavePix, '71997369167');
    assert.equal(parsedScript.tipoChavePix, 'Celular');
    assert.equal(parsedScript.banco, 'Nubank');
    assert.equal(parsedScript.observacoes, 'PAGAMENTO INTEGRAL DO FRETE');
    assert.equal(parsedScript.condicoesPagamento, 'Integral (100%)');
    assert.equal(parsedScript.enderecoColeta, undefined);
    assert.equal(parsedScript.tipoCarga, undefined);
    assert.equal(parsedScript.pesoKg, undefined);

    const importedRes = await call('com1', '', {
      empresaMarca: parsedScript.empresaMarca || 'RODOVAR',
      unidadeOperacional: parsedScript.unidadeOperacional || 'BA - Salvador',
      cliente: parsedScript.cliente || '',
      clienteContato: parsedScript.telefoneCliente || '',
      origemCidadeUf: parsedScript.origem || '',
      destinoCidadeUf: parsedScript.destino || '',
      enderecoColeta: parsedScript.enderecoColeta || '',
      enderecoEntrega: parsedScript.enderecoEntrega || '',
      tipoCarga: parsedScript.tipoCarga || '',
      pesoKg: parsedScript.pesoKg || 0,
      volumes: parsedScript.volumes || 0,
      veiculoNecessario: parsedScript.veiculoNecessario || '',
      dataColetaIso: parsedScript.dataColetaIso || '',
      janelaColetaInicio: '',
      janelaColetaFim: '',
      dataEntregaPrevistaIso: '',
      janelaEntregaInicio: '',
      janelaEntregaFim: '',
      valorCobradoClienteCentavos: Math.round((parsedScript.valorFreteEmpresa || 0) * 100),
      valorContratadoCentavos: Math.round((parsedScript.valorFreteMotorista || 0) * 100),
      condicoesComerciais: parsedScript.condicoesPagamento || '',
      condicoesOperacionais: '',
      condicoesPagamento: parsedScript.condicoesPagamento || '',
      observacoes: parsedScript.observacoes || '',
      comercialScriptRef: parsedScript.comercialResponsavel || '',
      motoristaNome: parsedScript.motoristaNome || '',
      motoristaTelefone: parsedScript.motoristaTelefone || '',
      emergenciaNome: parsedScript.emergenciaNome || '',
      emergenciaTelefone: parsedScript.emergenciaTelefone || '',
      favorecidoPagamento: parsedScript.favorecido || '',
      tipoChavePix: parsedScript.tipoChavePix || '',
      chavePix: parsedScript.chavePix || '',
      bancoPagamento: parsedScript.banco || '',
      confirmAndSendToExpedicao: false,
    });
    assert.equal(importedRes.status, 201);
    const imp = importedRes.body.freight;
    assert.equal(imp.cliente, 'PRINER - JAMERSON');
    assert.equal(imp.origemCidadeUf, 'CAMAÇARI-BA');
    assert.equal(imp.destinoCidadeUf, 'SÃO FRANCISCO DO CONDE-BA');
    assert.equal(imp.dataColetaIso, '2026-11-13');
    assert.equal(imp.dataEntregaPrevistaIso, '');
    assert.equal(imp.janelaColetaInicio, '');
    assert.equal(imp.enderecoColeta, '');
    assert.equal(imp.tipoCarga, '');
    assert.equal(imp.valorCobradoClienteCentavos, 151800);
    assert.equal(imp.valorContratadoCentavos, 90000);
    assert.equal(imp.motoristaNome, 'MARCELINO CARMO PEREIRA');
    assert.equal(imp.motoristaTelefone, '71-99736-9167');
    assert.equal(imp.emergenciaNome, undefined);
    assert.equal(imp.emergenciaTelefone, undefined);
    assert.equal(imp.favorecidoPagamento, 'MARCELINO CARMO PEREIRA');
    assert.equal(imp.chavePix, '71997369167');
    assert.equal(imp.bancoPagamento, 'Nubank');
    assert.equal(imp.condicoesPagamento, 'Integral (100%)');
    assert.equal(imp.observacoes, 'PAGAMENTO INTEGRAL DO FRETE');
    assert.equal(imp.comercialScriptRef, 'MARIVAL/CÉSAR');
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    delete process.env.RODOVAR_DATA_ROOT;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
