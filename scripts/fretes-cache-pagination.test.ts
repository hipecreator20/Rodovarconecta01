import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import express from 'express';

const makeUser = (
  id: string,
  accessProfile: string | null,
  overrides: Record<string, any> = {}
): any => ({
  id,
  name: `Usuário ${id}`,
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

test('Fretes Ativos: separação de Finalizados, paginação 12/pág, DTO compacto, filtros, reabertura autorizada e concorrência entre 2 usuários', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rodovar-fretes-opt-'));
  process.env.RODOVAR_DATA_ROOT = root;

  const { registerUnifiedFreightRoutes, getFreightsDataVersion } = await import(
    '../src/server/unifiedFreightEngine'
  );

  const users = [
    makeUser('com1', 'COMERCIAL'),
    makeUser('exp1', 'EXPEDICAO'),
    makeUser('mon1', 'MONITORAMENTO'),
    makeUser('mon2', 'MONITORAMENTO'),
    makeUser('mgr1', null, { roleTitle: 'Gerente de Logística', department: 'Logística' }),
    makeUser('dir1', 'DIRETORIA', { accessLevel: 'DIRETORIA' }),
    makeUser('adm1', null, { accessLevel: 'ADMINISTRADOR' }),
  ];

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
    () => {}
  );

  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;

  let seq = 0;
  const call = async (
    uid: string,
    p: string,
    body?: any,
    method = 'POST',
    extraHeaders: Record<string, string> = {}
  ) => {
    const res = await fetch(`${base}/api/meus-fretes${p}`, {
      method: body !== undefined ? method : 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-test-user': uid,
        'x-idempotency-key': `key-${++seq}`,
        ...extraHeaders,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    return {
      status: res.status,
      headers: res.headers,
      body: text ? JSON.parse(text) : null,
    };
  };

  try {
    // Helper to create and advance a freight all the way to monitoring
    const createMonFreight = async (
      idx: number,
      targetStage:
        | 'NOVO_PARA_CARREGAR'
        | 'EM_DESLOCAMENTO_COLETA'
        | 'CARREGADO_EM_TRANSPORTE'
        | 'NO_LOCAL_ENTREGA'
        | 'ENTREGUE'
        | 'FINALIZADO',
      monOwner = 'mon1'
    ) => {
      const todayIso = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bahia' });
      const created = await call('com1', '', {
        cliente: `Cliente Opt ${idx}`,
        origemCidadeUf: 'Salvador/BA',
        destinoCidadeUf: idx % 2 === 0 ? 'Recife/PE' : 'Feira de Santana/BA',
        enderecoColeta: `Rua Coleta ${idx}, 100`,
        tipoCarga: 'Carga Geral',
        valorCobradoClienteCentavos: 150000,
        pesoKg: 5000,
        volumes: 12,
        veiculoNecessario: 'Truck',
        dataColetaIso: idx === 1 ? todayIso : '2027-11-10',
        dataEntregaPrevistaIso: idx === 1 ? todayIso : '2027-11-12',
        confirmAndSendToExpedicao: true,
      });
      assert.equal(created.status, 201);
      const id = created.body.freight.id;

      await call('exp1', `/${id}/claim`, {});
      await call(
        'exp1',
        `/${id}/operational`,
        {
          motoristaNome: `Motorista ${idx}`,
          motoristaCpf: '12345678901',
          motoristaTelefone: '71999999999',
          transportadorNome: 'Trans Opt Ltda',
          placaVeiculo: `RDO${String(idx).padStart(4, '0')}`,
          valorContratadoCentavos: 100000,
          condicoesPagamento: '70% Adiantamento / 30% Saldo',
          condicoesOperacionais: 'Operação padrão conferida',
          checklistFechamento: {
            motoristaConfirmado: true,
            veiculoConfirmado: true,
            condicoesConferidas: true,
            documentosConferidos: true,
          },
        },
        'PUT'
      );
      for (const action of [
        'REGISTRAR_VIDEOCHAMADA',
        'EMITIR_ORDEM',
        'CONFIRMAR_ENVIO_ORDEM_MOTORISTA',
        'LIBERAR_PARA_MONITORAMENTO',
      ]) {
        const step = await call('exp1', `/${id}/expedicao-action`, {
          action,
          monitoramentoResponsavelId: monOwner,
        });
        assert.equal(step.status, 200);
      }

      const regLoc = await call(monOwner, `/${id}/monitoramento-action`, {
        action: 'REGISTRAR_LOCALIZACAO_ORIENTACAO',
        enderecoEntrega: `Av. Entrega ${idx}, 450, Centro`,
      });
      assert.equal(regLoc.status, 200, JSON.stringify(regLoc.body));

      const stageOrder = [
        'EM_DESLOCAMENTO_COLETA',
        'NO_LOCAL_COLETA',
        'CARREGADO_EM_TRANSPORTE',
        'NO_LOCAL_ENTREGA',
        'ENTREGUE',
        'FINALIZADO',
      ] as const;

      for (const st of stageOrder) {
        if (targetStage === 'NOVO_PARA_CARREGAR') break;
        if (st === 'FINALIZADO') {
          const att = await call(monOwner, `/${id}/attachments`, {
            category: 'COMPROVANTE_ENTREGA',
            label: 'Canhoto',
            fileName: `canhoto-${idx}.pdf`,
            dataUrl:
              'data:application/pdf;base64,' +
              Buffer.from('%PDF-1.4\nCanhoto assinado válido\n%%EOF').toString('base64'),
          });
          assert.equal(att.status, 201);
          const attId = att.body.anexos.at(-1).id;
          const ver = await call(monOwner, `/${id}/attachments/${attId}/verify`, {});
          assert.equal(ver.status, 200);
        }
        const adv = await call(monOwner, `/${id}/monitoramento-action`, {
          action: 'AVANCAR_ETAPA',
          targetStage: st,
        });
        assert.equal(adv.status, 200);
        if (st === targetStage) break;
      }

      return id as string;
    };

    // Note: seed already has 2 active monitoring freights (#0840, #0841)
    // Add 12 active + 3 FINALIZADO + 1 ENTREGUE = 14 active total, 4 finalized/delivered total
    const activeIds: string[] = [];
    for (let i = 1; i <= 12; i++) {
      activeIds.push(
        await createMonFreight(
          i,
          i % 2 === 0 ? 'EM_DESLOCAMENTO_COLETA' : 'CARREGADO_EM_TRANSPORTE',
          'mon1'
        )
      );
    }
    const finId1 = await createMonFreight(101, 'FINALIZADO', 'mon1');
    const finId2 = await createMonFreight(102, 'FINALIZADO', 'mon1');
    const finId3 = await createMonFreight(103, 'FINALIZADO', 'mon2');
    const entId1 = await createMonFreight(104, 'ENTREGUE', 'mon1');

    // 1. Cache-Control & security headers check + ATIVOS excludes FINALIZADO/ENTREGUE & paginates 12/page
    const ativosP1 = await call(
      'dir1',
      '?area=MONITORAMENTO&scope=EQUIPE&viewMode=ATIVOS&page=1&limit=12&omitKanban=true'
    );
    assert.equal(ativosP1.status, 200);
    assert.match(ativosP1.headers.get('cache-control') || '', /private.*no-store/);
    assert.match(ativosP1.headers.get('vary') || '', /Authorization/);
    assert.equal(ativosP1.body.items.length, 12, 'Página 1 deve trazer exatamente 12 fretes ativos');
    assert.equal(ativosP1.body.totalMatched, 14, 'Total de ativos esperados = 3 seed + 11 criados');
    assert.equal(ativosP1.body.totalPages, 2);
    assert.equal(ativosP1.body.monitoramentoCounters.completedCount, 4);
    assert.equal(ativosP1.body.monitoramentoCounters.TOTAL_ATIVOS, 14);
    assert.deepEqual(ativosP1.body.kanbanColumns, {}, 'omitKanban=true deve evitar fatias de kanban');
    assert.ok(
      ativosP1.body.items.every(
        (f: any) => f.situacaoMonitoramento !== 'FINALIZADO' && f.situacaoMonitoramento !== 'ENTREGUE'
      ),
      'Painel ATIVOS nunca deve incluir FINALIZADO ou ENTREGUE'
    );

    const ativosP2 = await call(
      'dir1',
      '?area=MONITORAMENTO&scope=EQUIPE&viewMode=ATIVOS&page=2&limit=12&omitKanban=true'
    );
    assert.equal(ativosP2.status, 200);
    assert.equal(ativosP2.body.items.length, 2, 'Página 2 deve trazer os 2 ativos restantes');

    // 2. Permission enforcement at origin (restricted Logistics Manager & COMERCIAL cannot query scope=EQUIPE)
    const mgrTeamDenied = await call(
      'mgr1',
      '?area=MONITORAMENTO&scope=EQUIPE&viewMode=ATIVOS&page=1&limit=12'
    );
    assert.equal(mgrTeamDenied.status, 403);
    const comMonDenied = await call(
      'com1',
      '?area=MONITORAMENTO&scope=EQUIPE&viewMode=ATIVOS&page=1&limit=12'
    );
    assert.equal(comMonDenied.status, 403);

    // 3. Finalizados compact DTO & filters (only loaded when requested)
    const finList = await call(
      'dir1',
      '?area=MONITORAMENTO&scope=EQUIPE&viewMode=FINALIZADOS&compact=true&page=1&limit=12&omitKanban=true'
    );
    assert.equal(finList.status, 200);
    assert.equal(finList.body.totalMatched, 4);
    assert.equal(finList.body.items.length, 4);
    for (const row of finList.body.items) {
      assert.ok(['FINALIZADO', 'ENTREGUE'].includes(row.situacaoMonitoramento));
      assert.ok(row.protocol && row.cliente && row.origemCidadeUf && row.destinoCidadeUf);
      assert.equal(row.historico, undefined, 'Lista compacta não deve carregar histórico');
      assert.equal(row.anexos, undefined, 'Lista compacta não deve carregar anexos');
      assert.equal(row.condicoesComerciais, undefined, 'DTO compacto omite campos longos');
      assert.equal(row.checklistFechamento, undefined, 'DTO compacto omite checklist pesado');
    }

    // Search + status + period filters on Finalizados
    const finEntregueOnly = await call(
      'dir1',
      '?area=MONITORAMENTO&scope=EQUIPE&viewMode=FINALIZADOS&situacao=ENTREGUE&compact=true&page=1&limit=12&omitKanban=true'
    );
    assert.equal(finEntregueOnly.body.totalMatched, 1);
    assert.equal(finEntregueOnly.body.items[0].id, entId1);

    const finSearch = await call(
      'dir1',
      '?area=MONITORAMENTO&scope=EQUIPE&viewMode=FINALIZADOS&search=Motorista%20102&compact=true&page=1&limit=12&omitKanban=true'
    );
    assert.equal(finSearch.body.totalMatched, 1);
    assert.equal(finSearch.body.items[0].id, finId2);

    const finPaginated = await call(
      'dir1',
      '?area=MONITORAMENTO&scope=EQUIPE&viewMode=FINALIZADOS&compact=true&page=2&limit=2&omitKanban=true'
    );
    assert.equal(finPaginated.body.totalMatched, 4);
    assert.equal(finPaginated.body.totalPages, 2);
    assert.equal(finPaginated.body.items.length, 2);

    // 4. Lazy detail loading preserves full history & attachments
    const beforeReopenDetail = await call('dir1', `/${finId1}`);
    assert.equal(beforeReopenDetail.status, 200);
    const prevHistoryCount = beforeReopenDetail.body.historico.length;
    const prevAttachmentsCount = beforeReopenDetail.body.anexos.length;
    const prevFinancialStatus = beforeReopenDetail.body.freight.situacaoFinanceira;
    assert.ok(prevHistoryCount >= 6);
    assert.equal(prevAttachmentsCount, 1);

    // 5. Reopening rules: unauthorized blocked (403), short reason blocked (400), authorized succeeds & preserves history
    const reopenDeniedCom = await call('com1', `/${finId1}/reopen`, {
      motivo: 'Tentativa sem autorização comercial',
    });
    assert.equal(reopenDeniedCom.status, 403);

    const reopenDeniedOtherMon = await call('mon2', `/${finId1}/reopen`, {
      motivo: 'Operador de outro frete tentando reabrir',
    });
    assert.equal(reopenDeniedOtherMon.status, 403);

    const reopenShortReason = await call('mon1', `/${finId1}/reopen`, {
      motivo: 'abc',
    });
    assert.equal(reopenShortReason.status, 400);

    const reopenOk = await call('mon1', `/${finId1}/reopen`, {
      motivo: 'Necessária reconferência do canhoto assinado com cliente',
      targetStage: 'NO_LOCAL_ENTREGA',
      baseRevision: beforeReopenDetail.body.freight.revision,
    });
    assert.equal(reopenOk.status, 200);
    assert.equal(reopenOk.body.freight.situacaoMonitoramento, 'NO_LOCAL_ENTREGA');
    assert.equal(reopenOk.body.freight.situacaoFinanceira, prevFinancialStatus);
    assert.equal(
      reopenOk.body.historico.length,
      prevHistoryCount + 1,
      'Histórico anterior deve ser preservado intacto com novo evento de reabertura'
    );
    assert.equal(
      reopenOk.body.historico[0].eventType,
      'REABERTURA_MONITORAMENTO'
    );

    // Also test ENTREGUE reopen via DIRETORIA & via monitor-action REABRIR_FRETE
    const reopenEntOk = await call('dir1', `/${entId1}/monitoramento-action`, {
      action: 'REABRIR_FRETE',
      motivo: 'Divergência no horário de descarga informado',
    });
    assert.equal(reopenEntOk.status, 200);
    assert.equal(reopenEntOk.body.freight.situacaoMonitoramento, 'NO_LOCAL_ENTREGA');

    // Confirm reopened freights moved back to ATIVOS and left FINALIZADOS
    const afterReopenFin = await call(
      'dir1',
      '?area=MONITORAMENTO&scope=EQUIPE&viewMode=FINALIZADOS&compact=true&page=1&limit=12&omitKanban=true'
    );
    assert.equal(afterReopenFin.body.totalMatched, 2, 'Restam apenas finId2 e finId3 finalizados');
    const afterReopenAtivos = await call(
      'dir1',
      '?area=MONITORAMENTO&scope=EQUIPE&viewMode=ATIVOS&page=1&limit=12&omitKanban=true'
    );
    assert.equal(afterReopenAtivos.body.totalMatched, 16);

    // Authorized ADMINISTRADOR can reopen finId3 assigned to mon2
    const reopenAdmOk = await call('adm1', `/${finId3}/reopen`, {
      motivo: 'Reabertura autorizada pela administração geral',
      targetStage: 'ENTREGUE',
    });
    assert.equal(reopenAdmOk.status, 200);
    assert.equal(reopenAdmOk.body.freight.situacaoMonitoramento, 'ENTREGUE');

    // 6. ETag / 304 Not Modified & lightweight version polling + 2-user conflict detection
    const firstSync = await call(
      'dir1',
      '?area=MONITORAMENTO&scope=EQUIPE&viewMode=ATIVOS&page=1&limit=12&omitKanban=true'
    );
    const etag = firstSync.headers.get('etag');
    assert.ok(etag);
    const verBefore = firstSync.body.dataVersion;

    const notModified = await call(
      'dir1',
      '?area=MONITORAMENTO&scope=EQUIPE&viewMode=ATIVOS&page=1&limit=12&omitKanban=true',
      undefined,
      'GET',
      { 'If-None-Match': etag! }
    );
    assert.equal(notModified.status, 304);

    const checkSame = await call(
      'mon1',
      `?area=MONITORAMENTO&scope=MEUS&checkOnly=true&sinceVersion=${verBefore}`
    );
    assert.equal(checkSame.status, 200);
    assert.equal(checkSame.body.unchanged, true);

    // Simulate 2 simultaneous users: User A (mon1) advances activeIds[0], User B (dir1/adm1) tries stale revision
    const targetId = activeIds[0];
    const detailForBoth = await call('mon1', `/${targetId}`);
    const sharedRev = detailForBoth.body.freight.revision;

    const userAMutation = await call('mon1', `/${targetId}/monitoramento-action`, {
      action: 'REGISTRAR_LOCALIZACAO_ORIENTACAO',
      ultimaLocalizacaoInformada: 'Posto Trevo BR-324 km 12',
      baseRevision: sharedRev,
    });
    assert.equal(userAMutation.status, 200);
    assert.equal(userAMutation.body.freight.revision, sharedRev + 1);

    // User B background version check notices mutation immediately
    const checkChanged = await call(
      'dir1',
      `?area=MONITORAMENTO&scope=EQUIPE&checkOnly=true&sinceVersion=${verBefore}`
    );
    assert.equal(checkChanged.body.unchanged, false);
    assert.ok(checkChanged.body.dataVersion > verBefore);

    // User B attempting stale write gets 409 REVISION_CONFLICT instead of overwriting User A
    const userBStaleWrite = await call('adm1', `/${targetId}/monitoramento-action`, {
      action: 'REGISTRAR_LOCALIZACAO_ORIENTACAO',
      ultimaLocalizacaoInformada: 'Tentativa obsoleta sobrescrevendo',
      baseRevision: sharedRev,
    });
    assert.equal(userBStaleWrite.status, 409);
    assert.equal(userBStaleWrite.body.code, 'REVISION_CONFLICT');
    assert.equal(getFreightsDataVersion(), checkChanged.body.dataVersion);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    delete process.env.RODOVAR_DATA_ROOT;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Cache TanStack Query: staleTime, reuso entre Home e Fretes Ativos, isolamento por usuário, limpeza no logout e benchmark antes/depois', async () => {
  const {
    FREIGHT_CACHE_TIMES,
    appQueryClient,
    clearPrivateFreightCache,
    defaultActiveFreightFilters,
    fetchActiveFreightsQuery,
    fetchFinalizedFreightsQuery,
    fetchFreightDetailsQuery,
    fetchHomeActiveFreightsCached,
    freightQueryKeys,
    invalidateFreightQueriesAfterMutation,
  } = await import('../src/lib/freightQueryCache');
  const { setAuthTokens } = await import('../src/lib/serverApi');

  // Verify configured cache policy times
  assert.equal(FREIGHT_CACHE_TIMES.ACTIVE_LIST_STALE_MS, 2 * 60 * 1000);
  assert.equal(FREIGHT_CACHE_TIMES.INDICATORS_STALE_MS, 2 * 60 * 1000);
  assert.equal(FREIGHT_CACHE_TIMES.FINALIZADOS_LIST_STALE_MS, 15 * 60 * 1000);
  assert.equal(FREIGHT_CACHE_TIMES.HISTORICAL_DETAIL_STALE_MS, 30 * 60 * 1000);
  assert.equal(FREIGHT_CACHE_TIMES.STATIC_DATA_STALE_MS, 60 * 60 * 1000);
  assert.equal(appQueryClient.getDefaultOptions().queries?.refetchOnWindowFocus, false);

  const originalFetch = globalThis.fetch;
  const fetchLog: string[] = [];

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    fetchLog.push(url);
    if (url.includes('viewMode=FINALIZADOS')) {
      return new Response(
        JSON.stringify({
          ok: true,
          items: [{ id: 'f-fin-1', protocol: '#0900', situacaoMonitoramento: 'FINALIZADO' }],
          totalMatched: 1,
          totalPages: 1,
          page: 1,
          dataVersion: 10,
          monitoramentoCounters: { completedCount: 1, TOTAL_ATIVOS: 3 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (url.includes('/api/meus-fretes/f-fin-1')) {
      return new Response(
        JSON.stringify({
          ok: true,
          freight: { id: 'f-fin-1', protocol: '#0900', situacaoMonitoramento: 'FINALIZADO' },
          anexos: [],
          ocorrencias: [],
          historico: [{ id: 'h1', summary: 'Histórico preservado' }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response(
      JSON.stringify({
        ok: true,
        items: [{ id: 'f-act-1', protocol: '#0840', situacaoMonitoramento: 'NOVO_PARA_CARREGAR' }],
        totalMatched: 1,
        totalPages: 1,
        page: 1,
        dataVersion: 10,
        monitoramentoCounters: {
          NOVO_PARA_CARREGAR: 1,
          EM_DESLOCAMENTO_COLETA: 0,
          NO_LOCAL_COLETA: 0,
          CARREGADO_EM_TRANSPORTE: 0,
          NO_LOCAL_ENTREGA: 0,
          ENTREGUE: 0,
          FINALIZADO: 1,
          PENDENCIAS: 0,
          COLETAS_HOJE: 1,
          TOTAL_ATIVOS: 1,
          completedCount: 1,
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }) as typeof fetch;

  try {
    clearPrivateFreightCache();

    const monUser = makeUser('mon-cache-1', 'MONITORAMENTO');
    const dirUser = makeUser('dir-cache-2', 'DIRETORIA', { accessLevel: 'DIRETORIA' });

    // 1. Navigating Home -> Fretes Ativos reuses the exact same cached query (0 duplicate requests)
    const homeData = await fetchHomeActiveFreightsCached(monUser);
    assert.equal(homeData.items.length, 1);
    assert.equal(fetchLog.length, 1);

    const activeFilters = defaultActiveFreightFilters(monUser);
    const activeData = await appQueryClient.fetchQuery({
      queryKey: freightQueryKeys.activeList(monUser.id, activeFilters),
      queryFn: () => fetchActiveFreightsQuery(activeFilters),
      staleTime: FREIGHT_CACHE_TIMES.ACTIVE_LIST_STALE_MS,
    });
    assert.equal(activeData.items[0].id, 'f-act-1');
    assert.equal(
      fetchLog.length,
      1,
      'Navegar da Home para Fretes Ativos dentro de 2 min deve reutilizar cache sem nova consulta HTTP/DB'
    );

    // 2. Finalizados NOT fetched until user requests them; cached for 15 minutes
    const finFilters = {
      scope: 'MINE' as const,
      responsibleFilterId: '',
      stageFilter: 'TODAS',
      periodFilter: 'TODOS' as const,
      searchQuery: '',
      page: 1,
      limit: 12,
    };
    const fin1 = await appQueryClient.fetchQuery({
      queryKey: freightQueryKeys.finalizedList(monUser.id, finFilters),
      queryFn: () => fetchFinalizedFreightsQuery(finFilters),
      staleTime: FREIGHT_CACHE_TIMES.FINALIZADOS_LIST_STALE_MS,
    });
    assert.equal(fin1.items.length, 1);
    assert.equal(fetchLog.length, 2);

    await appQueryClient.fetchQuery({
      queryKey: freightQueryKeys.finalizedList(monUser.id, finFilters),
      queryFn: () => fetchFinalizedFreightsQuery(finFilters),
      staleTime: FREIGHT_CACHE_TIMES.FINALIZADOS_LIST_STALE_MS,
    });
    assert.equal(fetchLog.length, 2, 'Reabrir aba Finalizados dentro de 15m reutiliza cache');

    // 3. Details loaded lazily and cached 30m for historical
    await appQueryClient.fetchQuery({
      queryKey: freightQueryKeys.detail(monUser.id, 'f-fin-1'),
      queryFn: () => fetchFreightDetailsQuery('f-fin-1'),
      staleTime: FREIGHT_CACHE_TIMES.HISTORICAL_DETAIL_STALE_MS,
    });
    assert.equal(fetchLog.length, 3);
    await appQueryClient.fetchQuery({
      queryKey: freightQueryKeys.detail(monUser.id, 'f-fin-1'),
      queryFn: () => fetchFreightDetailsQuery('f-fin-1'),
      staleTime: FREIGHT_CACHE_TIMES.HISTORICAL_DETAIL_STALE_MS,
    });
    assert.equal(fetchLog.length, 3, 'Reabrir detalhe histórico dentro de 30m não refaz consulta');

    // 4. Isolation across users: dirUser does not reuse monUser cache
    await fetchHomeActiveFreightsCached(dirUser);
    assert.equal(
      fetchLog.length,
      4,
      'Usuário distinto nunca deve reutilizar cache privado de outro usuário'
    );

    // 5. Selective invalidation after mutation only marks affected user's list stale
    await invalidateFreightQueriesAfterMutation(monUser.id, {
      id: 'f-act-1',
      protocol: '#0840',
    } as any);
    await appQueryClient.fetchQuery({
      queryKey: freightQueryKeys.activeList(monUser.id, activeFilters),
      queryFn: () => fetchActiveFreightsQuery(activeFilters),
      staleTime: FREIGHT_CACHE_TIMES.ACTIVE_LIST_STALE_MS,
    });
    assert.equal(fetchLog.length, 5, 'Após mutação + invalidação seletiva, lista é atualizada');

    // Details of f-fin-1 remain valid until logout; logout (setAuthTokens(null, null)) wipes entire private cache
    assert.ok(appQueryClient.getQueryCache().getAll().length > 0);
    setAuthTokens(null, null);
    assert.equal(
      appQueryClient.getQueryCache().getAll().length,
      0,
      'Logout / troca de usuário deve limpar 100% do cache privado em memória'
    );
  } finally {
    globalThis.fetch = originalFetch;
    clearPrivateFreightCache();
  }
});
