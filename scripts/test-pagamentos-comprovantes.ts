/**
 * RODOVAR CONECTA — Suíte de Testes Automatizados:
 * Módulo de Pagamentos Mobile, Intenção de Pagamento, Web Share Target e Comprovantes
 */

const BASE_URL = 'http://localhost:3000';

class SessionClient {
  private cookies: Map<string, string> = new Map();
  public csrfToken: string = '';

  private updateCookies(res: Response) {
    const rawCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    for (const raw of rawCookies) {
      const firstPart = raw.split(';')[0];
      const eqIdx = firstPart.indexOf('=');
      if (eqIdx > 0) {
        const name = firstPart.slice(0, eqIdx).trim();
        const val = firstPart.slice(eqIdx + 1).trim();
        this.cookies.set(name, val);
      }
    }
  }

  public getCookieHeader(): string {
    return Array.from(this.cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }

  async request(path: string, options: RequestInit = {}): Promise<{ res: Response; data: any }> {
    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string> || {}),
    };
    if (!(options.body instanceof FormData) && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
    const cookieStr = this.getCookieHeader();
    if (cookieStr) headers['Cookie'] = cookieStr;
    if (this.csrfToken) headers['X-CSRF-Token'] = this.csrfToken;

    const res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers,
      redirect: options.redirect || 'manual',
    });
    this.updateCookies(res);
    let data: any = null;
    const text = await res.text();
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    return { res, data };
  }

  async login(identifier: string, password: string) {
    const { res, data } = await this.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password }),
    });
    if (res.ok && data?.csrfToken) {
      this.csrfToken = data.csrfToken;
    }
    return { res, data };
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FALHA: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ PASSOU: ${message}`);
  }
}

// Helper to build valid binary files with authentic magic bytes
function createValidPdfBuffer(tag: string = 'PIX-BANCO-001'): Buffer {
  const content = `%PDF-1.4\n1 0 obj\n<< /Title (Comprovante ${tag}) >>\nendobj\n%%EOF\n`;
  return Buffer.from(content, 'utf-8');
}

function createValidPngBuffer(tag: string = 'PNG-001'): Buffer {
  const header = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const body = Buffer.from(`IHDR-RODOVAR-${tag}`, 'utf-8');
  return Buffer.concat([header, body]);
}

function createValidJpegBuffer(tag: string = 'JPG-001'): Buffer {
  const header = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]);
  const body = Buffer.from(`JFIF-RODOVAR-${tag}`, 'utf-8');
  const footer = Buffer.from([0xFF, 0xD9]);
  return Buffer.concat([header, body, footer]);
}

async function runTests() {
  console.log('=== INICIANDO TESTES DO MÓDULO DE PAGAMENTOS & COMPROVANTES COMPARTILHADOS ===\n');

  // 1. Verificar Manifesto PWA, Service Worker e Ícones PNG
  console.log('--- 1. Verificando Manifesto PWA, Web Share Target e Service Worker ---');
  const manifestClient = new SessionClient();
  const { res: manifestRes, data: manifestData } = await manifestClient.request('/manifest.json');
  assert(manifestRes.status === 200, 'Manifesto PWA (/manifest.json) está acessível');
  assert(
    manifestData?.share_target?.action === '/receber-comprovante' &&
      manifestData?.share_target?.method === 'POST' &&
      manifestData?.share_target?.enctype === 'multipart/form-data',
    'Manifesto PWA configura share_target POST multipart/form-data em /receber-comprovante'
  );
  const shareFiles = manifestData?.share_target?.params?.files?.[0];
  assert(
    shareFiles?.name === 'comprovante' &&
      Array.isArray(shareFiles?.accept) &&
      shareFiles.accept.includes('application/pdf') &&
      shareFiles.accept.includes('image/jpeg') &&
      shareFiles.accept.includes('image/png'),
    'Share Target aceita PDF, JPEG e PNG com extensões e tipos MIME'
  );

  const { res: swRes } = await manifestClient.request('/sw.js');
  assert(swRes.status === 200, 'Service Worker (/sw.js) está disponível');

  const { res: icon192Res } = await manifestClient.request('/icons/icon-192x192.png');
  assert(icon192Res.status === 200, 'Ícone PNG 192x192 existe e é servido corretamente');

  // 2. Autenticar usuários de diferentes perfis (elenco ativo do servidor)
  console.log('\n--- 2. Autenticando Perfis para Testes de Permissão e Alçada ---');
  const vitorDiretoria = new SessionClient(); // Diretoria (financeiro=true, financeiro_confirmar=false)
  const petronioCoord = new SessionClient();  // Coordenador Financeiro (financeiro=true, financeiro_confirmar=true)
  const julianeRh = new SessionClient();      // RH (sem permissão financeiro)
  const anonClient = new SessionClient();     // Não autenticado

  const vitorLogin = await vitorDiretoria.login('vitor@rodovar.com.br', 'rodovar2027#@');
  assert(vitorLogin.res.status === 200, 'Vitor (Diretoria - emp-2, financeiro sem confirmação) autenticado');

  const petronioLogin = await petronioCoord.login('petronio.santos@rodovar.com.br', 'rodovar2027#@');
  assert(petronioLogin.res.status === 200, 'Petrônio Santos (Financeiro - emp-7, com confirmação) autenticado');

  const julianeLogin = await julianeRh.login('juliane.aquino@rodovar.com.br', 'rodovar2027#@');
  assert(julianeLogin.res.status === 200, 'Juliane Aquino (RH - emp-3, sem permissão financeiro) autenticada');

  // Criar dois fretes isolados para esta execução para não alterar registros reais nem depender de saldos já pagos
  const ts = Date.now();
  const freightAId = `frete-e2e-pag-a-${ts}`;
  const freightBId = `frete-e2e-pag-b-${ts}`;

  const createARes = await petronioCoord.request('/api/pagamentos/fretes', {
    method: 'POST',
    body: JSON.stringify({
      freight: {
        id: freightAId,
        code: `#E2E-A-${String(ts).slice(-4)}`,
        cliente: 'CLIENTE TESTE PAGAMENTO A',
        origem: 'Simões Filho - BA',
        destino: 'Aracaju - SE',
        valorTotal: 8500,
        valorAdiantamento: 5950,
        valorSaldo: 2550,
        regraTipo: 'PADRAO_70_30',
        percentualAdiantamento: 70,
        percentualSaldo: 30,
        adiantamentoPago: false,
        saldoPago: false,
        status: 'Pendente Adiantamento',
        motorista: 'Motorista Teste A',
        favorecido: 'Motorista Teste A',
        chavePix: '71999990001',
        banco: 'Banco do Brasil',
        placa: 'RDV1A01',
        entregaConfirmada: false,
        docs: { cte: true, mdfe: true, coleta: true, entrega: false },
      },
    }),
  });
  assert(createARes.res.status === 201, 'Frete isolado A criado para testes de adiantamento (R$ 5.950,00)');

  const createBRes = await petronioCoord.request('/api/pagamentos/fretes', {
    method: 'POST',
    body: JSON.stringify({
      freight: {
        id: freightBId,
        code: `#E2E-B-${String(ts).slice(-4)}`,
        cliente: 'CLIENTE TESTE PAGAMENTO B',
        origem: 'Camaçari - BA',
        destino: 'Salvador - BA',
        valorTotal: 6000,
        valorAdiantamento: 4200,
        valorSaldo: 1800,
        regraTipo: 'PADRAO_70_30',
        percentualAdiantamento: 70,
        percentualSaldo: 30,
        adiantamentoPago: false,
        saldoPago: false,
        status: 'Pendente Adiantamento',
        motorista: 'Motorista Teste B',
        favorecido: 'Motorista Teste B',
        chavePix: '71999990002',
        banco: 'Itaú',
        placa: 'RDV2B02',
        entregaConfirmada: true,
        docs: { cte: true, mdfe: true, coleta: true, entrega: true },
      },
    }),
  });
  assert(createBRes.res.status === 201, 'Frete isolado B criado para testes de saldo (R$ 1.800,00)');

  // 3. Teste de bloqueio de usuário sem autenticação ou sem permissão
  console.log('\n--- 3. Bloqueio de Usuário Sem Autenticação ou Sem Permissão ---');
  const anonRes = await anonClient.request('/api/pagamentos/intencoes');
  assert(anonRes.res.status === 401, 'Usuário não autenticado recebe 401 ao consultar intenções de pagamento');

  const julianeIntentRes = await julianeRh.request('/api/pagamentos/intencoes', {
    method: 'POST',
    body: JSON.stringify({ freightId: freightBId, installmentType: 'ADIANTAMENTO' }),
  });
  assert(
    julianeIntentRes.res.status === 403 && julianeIntentRes.data?.code === 'FORBIDDEN_FINANCEIRO',
    'Usuária sem permissão financeiro (Juliane) recebe 403 FORBIDDEN_FINANCEIRO ao preparar pagamento'
  );

  const julianeUploadRes = await julianeRh.request('/api/pagamentos/comprovantes', {
    method: 'POST',
    body: JSON.stringify({
      freightId: freightBId,
      installmentType: 'SALDO',
      fileName: 'comprovante.pdf',
      fileBase64: createValidPdfBuffer('JULIANE').toString('base64'),
    }),
  });
  assert(
    julianeUploadRes.res.status === 403 && julianeUploadRes.data?.code === 'FORBIDDEN_FINANCEIRO',
    'Usuária sem permissão financeiro (Juliane) recebe 403 ao tentar enviar comprovante'
  );

  // 4. Seleção de parcela Adiantamento vs Saldo e coerência de valores/títulos
  console.log('\n--- 4. Coerência entre Adiantamento e Saldo (Valor, Título, Identificador e Resumo) ---');
  const fretesListRes = await vitorDiretoria.request('/api/pagamentos/fretes');
  assert(fretesListRes.res.status === 200 && Array.isArray(fretesListRes.data?.freights), 'Consulta de fretes do Financeiro bem-sucedida');

  // Preparar intenção para ADIANTAMENTO no Frete A (Adiantamento = R$ 5.950,00 | Saldo = R$ 2.550,00)
  const intentAdiantamentoA = await vitorDiretoria.request('/api/pagamentos/intencoes', {
    method: 'POST',
    body: JSON.stringify({ freightId: freightAId, installmentType: 'ADIANTAMENTO' }),
  });
  assert(intentAdiantamentoA.res.status === 201, 'Intenção de pagamento criada para ADIANTAMENTO do Frete A');
  assert(
    intentAdiantamentoA.data?.intent?.installmentType === 'ADIANTAMENTO' &&
      intentAdiantamentoA.data?.intent?.installmentId === `${freightAId}:ADIANTAMENTO` &&
      intentAdiantamentoA.data?.intent?.expectedAmountBRL === 5950 &&
      intentAdiantamentoA.data?.intent?.status === 'AGUARDANDO_COMPROVANTE',
    `Intenção de Adiantamento traz installmentId="${freightAId}:ADIANTAMENTO", valor exato R$ 5.950,00 e estado AGUARDANDO_COMPROVANTE`
  );
  assert(
    intentAdiantamentoA.data?.guidance ===
      'Faça o pagamento no seu banco. Depois, compartilhe o comprovante com Rodovar Conecta.',
    'Retorna orientação exata: "Faça o pagamento no seu banco. Depois, compartilhe o comprovante com Rodovar Conecta."'
  );

  // Cancelar intenções residuais para testar fluxo de 0, 1 e >1 intenções
  const preExistingIntents = await vitorDiretoria.request('/api/pagamentos/intencoes');
  for (const oldIntent of preExistingIntents.data?.eligibleIntents || []) {
    await vitorDiretoria.request(`/api/pagamentos/intencoes/${oldIntent.id}/cancel`, {
      method: 'POST',
    });
  }

  // 5. Associação correta com 0, 1 e >1 intenções ativas + Expiração de intenção
  console.log('\n--- 5. Associação Automática com 0, 1 e >1 Intenções Ativas + Expiração ---');
  const zeroIntents = await vitorDiretoria.request('/api/pagamentos/intencoes');
  assert(
    zeroIntents.data?.associationMode === 'MANUAL_SELECT' && zeroIntents.data?.eligibleCount === 0,
    'Sem intenção ativa (0 elegíveis): modo MANUAL_SELECT permite escolher frete e parcela autorizados'
  );

  // Criar 1 intenção ativa para SALDO do Frete B (Saldo = R$ 1.800,00)
  const singleIntentRes = await vitorDiretoria.request('/api/pagamentos/intencoes', {
    method: 'POST',
    body: JSON.stringify({ freightId: freightBId, installmentType: 'SALDO' }),
  });
  const intentSaldoBId = singleIntentRes.data?.intent?.id;
  assert(
    singleIntentRes.res.status === 201 &&
      singleIntentRes.data?.intent?.installmentId === `${freightBId}:SALDO` &&
      singleIntentRes.data?.intent?.expectedAmountBRL === 1800,
    `Criada 1 intenção ativa para SALDO do Frete B com valor R$ 1.800,00 e ID ${freightBId}:SALDO`
  );

  const oneIntentCheck = await vitorDiretoria.request('/api/pagamentos/intencoes');
  assert(
    oneIntentCheck.data?.associationMode === 'SINGLE_PREFILL' &&
      oneIntentCheck.data?.eligibleCount === 1 &&
      oneIntentCheck.data?.eligibleIntents?.[0]?.id === intentSaldoBId,
    'Com 1 intenção ativa: modo SINGLE_PREFILL pré-preenche automaticamente o Frete B e a parcela SALDO'
  );

  // Criar 2ª intenção ativa para ADIANTAMENTO do Frete A
  const secondIntentRes = await vitorDiretoria.request('/api/pagamentos/intencoes', {
    method: 'POST',
    body: JSON.stringify({ freightId: freightAId, installmentType: 'ADIANTAMENTO' }),
  });
  const secondIntentId = secondIntentRes.data?.intent?.id;

  const multiIntentCheck = await vitorDiretoria.request('/api/pagamentos/intencoes');
  assert(
    multiIntentCheck.data?.associationMode === 'MULTIPLE_CHOOSE' && multiIntentCheck.data?.eligibleCount === 2,
    'Com >1 intenções ativas (2 elegíveis): modo MULTIPLE_CHOOSE pede ao usuário escolher qual intenção vincular'
  );

  // Encerrar a 2ª intenção e testar expiração automática de uma intenção vencida
  await vitorDiretoria.request(`/api/pagamentos/intencoes/${secondIntentId}/cancel`, { method: 'POST' });

  const expiredIntentCreate = await vitorDiretoria.request('/api/pagamentos/intencoes', {
    method: 'POST',
    body: JSON.stringify({
      freightId: freightAId,
      installmentType: 'SALDO',
      validitySeconds: -5, // já nasce expirada para teste
    }),
  });
  const expiredIntentId = expiredIntentCreate.data?.intent?.id;

  const afterExpirationCheck = await vitorDiretoria.request('/api/pagamentos/intencoes');
  assert(
    afterExpirationCheck.data?.eligibleCount === 1 &&
      afterExpirationCheck.data?.eligibleIntents?.[0]?.id === intentSaldoBId,
    'Intenção expirada encerra apenas a associação automática, mantendo apenas a intenção válida'
  );

  // Tentar enviar comprovante referenciando a intenção expirada
  const uploadWithExpiredIntent = await vitorDiretoria.request('/api/pagamentos/comprovantes', {
    method: 'POST',
    body: JSON.stringify({
      freightId: freightAId,
      installmentType: 'SALDO',
      intentId: expiredIntentId,
      fileName: 'expirado.pdf',
      fileBase64: createValidPdfBuffer('EXPIRADO').toString('base64'),
    }),
  });
  assert(
    uploadWithExpiredIntent.res.status === 409 && uploadWithExpiredIntent.data?.code === 'INTENT_EXPIRED',
    'Servidor rejeita associação automática com intenção expirada (409 INTENT_EXPIRED) sem apagar o frete'
  );

  // 6. Segurança entre contas: impedir que outro usuário reutilize intenção de conta anterior
  console.log('\n--- 6. Isolamento de Intenção Entre Contas Diferentes ---');
  const crossUserAttempt = await petronioCoord.request('/api/pagamentos/comprovantes', {
    method: 'POST',
    body: JSON.stringify({
      freightId: freightBId,
      installmentType: 'SALDO',
      intentId: intentSaldoBId, // Pertence a Vitor (emp-2), não a Petrônio (emp-7)
      fileName: 'comprovante_cruzado.pdf',
      fileBase64: createValidPdfBuffer('CRUZADO').toString('base64'),
    }),
  });
  assert(
    crossUserAttempt.res.status === 403 && crossUserAttempt.data?.code === 'INTENT_USER_MISMATCH',
    'Servidor bloqueia reutilização de intenção pertencente a outro usuário (403 INTENT_USER_MISMATCH)'
  );

  // 7. Rota Web Share Target (/receber-comprovante) e tratamento de texto sem arquivo
  console.log('\n--- 7. Recebimento via Web Share Target (PDF, JPEG, PNG e Texto Sem Arquivo) ---');
  const textOnlyForm = new FormData();
  textOnlyForm.append('title', 'Comprovante PIX Banco');
  textOnlyForm.append('text', 'Pagamento realizado R$ 1.260,00');
  textOnlyForm.append('url', 'https://banco.exemplo.com/comprovante/123');

  const shareTextOnlyRes = await vitorDiretoria.request('/receber-comprovante', {
    method: 'POST',
    body: textOnlyForm,
  });
  const textRedirectLoc = shareTextOnlyRes.res.headers.get('location') || '';
  assert(
    shareTextOnlyRes.res.status === 303 && textRedirectLoc.includes('serverShareId='),
    'POST /receber-comprovante com apenas texto/link redireciona (303) para /receber-comprovante?shared=1&serverShareId=... sem baixar link externo'
  );

  const textShareId = new URL(textRedirectLoc, BASE_URL).searchParams.get('serverShareId');
  const stagedTextRes = await vitorDiretoria.request(`/api/pagamentos/shared-staging/${textShareId}`);
  assert(
    stagedTextRes.res.status === 200 &&
      stagedTextRes.data?.stagedShare?.textOnly === true &&
      !stagedTextRes.data?.stagedShare?.fileBase64,
    'Item compartilhado apenas com texto/link é sinalizado com textOnly=true para exibir aviso e anexo manual'
  );

  // Agora enviar arquivo PDF real via POST /receber-comprovante
  const pdfForm = new FormData();
  const pdfBlob = new Blob([new Uint8Array(createValidPdfBuffer('SHARE-TARGET-PDF'))], {
    type: 'application/pdf',
  });
  pdfForm.append('comprovante', pdfBlob, 'pix_banco_e2e.pdf');
  pdfForm.append('title', 'Comprovante PIX');

  const sharePdfRes = await vitorDiretoria.request('/receber-comprovante', {
    method: 'POST',
    body: pdfForm,
  });
  const pdfRedirectLoc = sharePdfRes.res.headers.get('location') || '';
  assert(
    sharePdfRes.res.status === 303 && pdfRedirectLoc.includes('serverShareId='),
    'POST /receber-comprovante aceita arquivo PDF multipart/form-data'
  );

  const pdfShareId = new URL(pdfRedirectLoc, BASE_URL).searchParams.get('serverShareId');
  const stagedPdfRes = await vitorDiretoria.request(`/api/pagamentos/shared-staging/${pdfShareId}`);
  assert(
    stagedPdfRes.res.status === 200 &&
      stagedPdfRes.data?.stagedShare?.textOnly === false &&
      stagedPdfRes.data?.stagedShare?.fileName === 'pix_banco_e2e.pdf' &&
      stagedPdfRes.data?.stagedShare?.mimeType === 'application/pdf' &&
      typeof stagedPdfRes.data?.stagedShare?.fileBase64 === 'string',
    'Arquivo PDF recebido pelo Share Target fica disponível para pré-visualização e confirmação no app'
  );

  // 8. Rejeição de arquivos inválidos (SVG, EXE, cabeçalho falso) e > 10 MB
  console.log('\n--- 8. Rejeição de Tipo Inválido (SVG/EXE/Cabeçalho Falso) e Arquivo > 10 MB ---');
  const fakeSvgBuffer = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', 'utf-8');
  const invalidTypeRes = await vitorDiretoria.request('/api/pagamentos/comprovantes', {
    method: 'POST',
    body: JSON.stringify({
      freightId: freightBId,
      installmentType: 'SALDO',
      fileName: 'malicioso.svg',
      fileBase64: fakeSvgBuffer.toString('base64'),
    }),
  });
  assert(
    invalidTypeRes.res.status === 400 && invalidTypeRes.data?.code === 'INVALID_FILE_TYPE',
    'Servidor rejeita arquivo SVG/executável ou assinatura binária inválida (400 INVALID_FILE_TYPE)'
  );

  // Arquivo maior que 10 MB (10.5 MB)
  const over10MbBuffer = Buffer.alloc(10 * 1024 * 1024 + 512 * 1024, 0x41);
  Buffer.from('%PDF-1.4\n').copy(over10MbBuffer, 0);
  const largeFileRes = await vitorDiretoria.request('/api/pagamentos/comprovantes', {
    method: 'POST',
    body: JSON.stringify({
      freightId: freightBId,
      installmentType: 'SALDO',
      fileName: 'gigante.pdf',
      fileBase64: over10MbBuffer.toString('base64'),
    }),
  });
  assert(
    largeFileRes.res.status === 413 && largeFileRes.data?.code === 'FILE_TOO_LARGE',
    'Servidor rejeita arquivo maior que 10 MB com status 413 FILE_TOO_LARGE'
  );

  // 9. Salvar comprovante (PDF, JPEG, PNG), Idempotência, Hash Duplicado e Histórico de Substituição
  console.log('\n--- 9. Salvamento no Servidor, Idempotência, Hash Duplicado e Substituição sem Apagar Histórico ---');
  const idempotencyKey = `idem-test-${ts}`;
  const pdfBufferB = createValidPdfBuffer(`SALDO-B-${ts}`);

  const savePdfRes = await vitorDiretoria.request('/api/pagamentos/comprovantes', {
    method: 'POST',
    headers: { 'X-Idempotency-Key': idempotencyKey },
    body: JSON.stringify({
      freightId: freightBId,
      installmentType: 'SALDO',
      intentId: intentSaldoBId,
      fileName: 'comprovante_saldo_b.pdf',
      fileBase64: pdfBufferB.toString('base64'),
      origin: 'COMPARTILHAMENTO',
      isScheduledProof: false,
    }),
  });
  assert(
    savePdfRes.res.status === 201 &&
      savePdfRes.data?.receipt?.verificationStatus === 'AGUARDANDO_CONFERENCIA' &&
      savePdfRes.data?.receipt?.uploadStatus === 'SALVO_NO_SERVIDOR' &&
      savePdfRes.data?.receipt?.installmentType === 'SALDO' &&
      savePdfRes.data?.receipt?.installmentId === `${freightBId}:SALDO` &&
      savePdfRes.data?.receipt?.title === 'Comprovante de Saldo',
    `Comprovante PDF salvo vincula à parcela SALDO (${freightBId}:SALDO) com estado AGUARDANDO_CONFERENCIA (não marca como Pago automaticamente)`
  );

  // Verificar que o frete NÃO foi marcado como saldoPago automaticamente após o envio do comprovante
  assert(
    savePdfRes.data?.freight?.saldoVerificacaoStatus === 'AGUARDANDO_CONFERENCIA' &&
      savePdfRes.data?.freight?.saldoPago === false,
    'Estado da parcela SALDO após anexar comprovante é AGUARDANDO_CONFERENCIA e saldoPago=false'
  );

  // Testar idempotência com a mesma chave X-Idempotency-Key
  const retryIdempotentRes = await vitorDiretoria.request('/api/pagamentos/comprovantes', {
    method: 'POST',
    headers: { 'X-Idempotency-Key': idempotencyKey },
    body: JSON.stringify({
      freightId: freightBId,
      installmentType: 'SALDO',
      fileName: 'comprovante_saldo_b.pdf',
      fileBase64: pdfBufferB.toString('base64'),
    }),
  });
  assert(
    retryIdempotentRes.res.status === 200 &&
      retryIdempotentRes.data?.idempotentReplay === true &&
      retryIdempotentRes.data?.receipt?.id === savePdfRes.data?.receipt?.id,
    'Reenvio com mesma X-Idempotency-Key não duplica comprovante (idempotentReplay=true)'
  );

  // Testar envio de JPEG válido e substituição de comprovante mantendo histórico
  const jpegBuffer = createValidJpegBuffer(`SALDO-B-JPEG-${ts}`);
  const saveJpegReplacementRes = await vitorDiretoria.request('/api/pagamentos/comprovantes', {
    method: 'POST',
    body: JSON.stringify({
      freightId: freightBId,
      installmentType: 'SALDO',
      fileName: 'comprovante_substituto.jpg',
      fileBase64: jpegBuffer.toString('base64'),
      origin: 'ANEXACAO_MANUAL',
    }),
  });
  assert(
    saveJpegReplacementRes.res.status === 201 &&
      saveJpegReplacementRes.data?.receipt?.replacedReceiptId === savePdfRes.data?.receipt?.id,
    'Novo comprovante JPEG substitui o ativo da parcela SALDO referenciando replacedReceiptId sem apagar o anterior'
  );

  // Testar envio de PNG válido com mesmo hash (alerta de hash duplicado) e flag de agendamento
  const pngBuffer = createValidPngBuffer(`ADIANTAMENTO-A-PNG-${ts}`);
  const savePngRes1 = await vitorDiretoria.request('/api/pagamentos/comprovantes', {
    method: 'POST',
    body: JSON.stringify({
      freightId: freightAId,
      installmentType: 'ADIANTAMENTO',
      fileName: 'comprovante_adiantamento.png',
      fileBase64: pngBuffer.toString('base64'),
      isScheduledProof: true,
    }),
  });
  assert(
    savePngRes1.res.status === 201 &&
      savePngRes1.data?.receipt?.isScheduledProof === true &&
      savePngRes1.data?.receipt?.verificationStatus === 'AGUARDANDO_CONFERENCIA',
    'Comprovante PNG de agendamento bancário é salvo como AGUARDANDO_CONFERENCIA sem dar baixa automática'
  );

  const savePngDuplicateHashRes = await vitorDiretoria.request('/api/pagamentos/comprovantes', {
    method: 'POST',
    body: JSON.stringify({
      freightId: freightAId,
      installmentType: 'ADIANTAMENTO',
      fileName: 'comprovante_adiantamento_copia.png',
      fileBase64: pngBuffer.toString('base64'),
    }),
  });
  assert(
    savePngDuplicateHashRes.res.status === 201 &&
      savePngDuplicateHashRes.data?.receipt?.isDuplicateHashWarning === true,
    'Servidor detecta hash SHA-256 repetido e registra alerta isDuplicateHashWarning=true'
  );

  // 10. Separação entre envio de comprovante e confirmação de pagamento por usuário autorizado
  console.log('\n--- 10. Separação entre Recebimento de Comprovante e Confirmação de Baixa Bancária ---');
  const receiptToConfirmId = saveJpegReplacementRes.data.receipt.id;

  const vitorTryConfirm = await vitorDiretoria.request(
    `/api/pagamentos/comprovantes/${receiptToConfirmId}/confirmar`,
    {
      method: 'POST',
      body: JSON.stringify({
        transactionCode: 'E999888777',
      }),
    }
  );
  assert(
    vitorTryConfirm.res.status === 403 && vitorTryConfirm.data?.code === 'FORBIDDEN_CONFIRM_PAYMENT',
    'Perfil com financeiro mas sem financeiro_confirmar (Vitor - Diretoria) pode anexar comprovante, mas recebe 403 ao tentar confirmar baixa'
  );

  // Tentar confirmar comprovante de agendamento sem acknowledgeScheduledProof
  const scheduledReceiptId = savePngRes1.data.receipt.id;
  const scheduledWithoutAck = await petronioCoord.request(
    `/api/pagamentos/comprovantes/${scheduledReceiptId}/confirmar`,
    {
      method: 'POST',
      body: JSON.stringify({ acknowledgeScheduledProof: false }),
    }
  );
  assert(
    scheduledWithoutAck.res.status === 400 &&
      scheduledWithoutAck.data?.code === 'SCHEDULED_PROOF_ACK_REQUIRED',
    'Comprovante de agendamento exige ateste explícito de compensação bancária antes da confirmação'
  );

  // Financeiro (Petrônio Santos - emp-7) confirma a baixa após conferência
  const petronioConfirmRes = await petronioCoord.request(
    `/api/pagamentos/comprovantes/${receiptToConfirmId}/confirmar`,
    {
      method: 'POST',
      body: JSON.stringify({
        transactionCode: 'E12345678920261028',
      }),
    }
  );
  assert(
    petronioConfirmRes.res.status === 200 &&
      petronioConfirmRes.data?.receipt?.verificationStatus === 'PAGAMENTO_CONFIRMADO' &&
      petronioConfirmRes.data?.receipt?.verifiedByUserId === 'emp-7' &&
      petronioConfirmRes.data?.freight?.saldoPago === true &&
      petronioConfirmRes.data?.freight?.status === 'Pago',
    'Usuário autorizado (Petrônio - Financeiro) confirma o pagamento -> PAGAMENTO_CONFIRMADO e saldoPago=true'
  );

  // 11. Reabrir o frete em outra sessão/dispositivo e verificar persistência + download protegido
  console.log('\n--- 11. Reabertura em Outra Sessão/Dispositivo e Download Protegido do Binário ---');
  const secondDeviceSession = new SessionClient();
  await secondDeviceSession.login('administrador@rodovar.com.br', 'rodovar2027#@');

  const reopenHistory = await secondDeviceSession.request(`/api/pagamentos/fretes/${freightBId}/historico`);
  assert(
    reopenHistory.res.status === 200 &&
      Array.isArray(reopenHistory.data?.receipts) &&
      reopenHistory.data.receipts.length >= 2 &&
      Array.isArray(reopenHistory.data?.history) &&
      reopenHistory.data.history.some((h: any) => h.eventType === 'COMPROVANTE_SUBSTITUIDO') &&
      reopenHistory.data.history.some((h: any) => h.eventType === 'PAGAMENTO_CONFIRMADO'),
    'Outra sessão/dispositivo enxerga histórico completo de comprovantes salvos (incluindo substituído e confirmação)'
  );

  const downloadRes = await secondDeviceSession.request(
    `/api/pagamentos/comprovantes/${receiptToConfirmId}/download`
  );
  assert(
    downloadRes.res.status === 200 &&
      downloadRes.res.headers.get('content-type') === 'image/jpeg',
    'Download protegido do arquivo binário retorna status 200 e Content-Type original (image/jpeg)'
  );

  const anonDownloadRes = await anonClient.request(
    `/api/pagamentos/comprovantes/${receiptToConfirmId}/download`
  );
  assert(
    anonDownloadRes.res.status === 401,
    'Download direto sem autenticação é bloqueado com 401'
  );

  console.log('\n🎉 TODOS OS TESTES DO MÓDULO DE PAGAMENTOS E COMPROVANTES PASSARAM COM SUCESSO!');
}

runTests().catch((err) => {
  console.error('Erro inesperado na suíte de testes:', err);
  process.exit(1);
});
