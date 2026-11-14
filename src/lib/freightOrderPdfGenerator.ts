import { ActiveCarrierBrand, CarrierBrand, OperationalUnit, UnifiedFreightRecord } from '../types';
import { getCarrierLogoPngDataUrl } from './carrierLogos';
import { formatCurrencyBRL } from './freightDatabase';

export interface FreightOrderDataForPdf {
  code: string;
  empresaMarca: CarrierBrand;
  dataCarregamento: string;
  unidadeOperacional: OperationalUnit;
  comercialResponsavel: string;
  expedicaoResponsavel: string;
  cliente: string;
  telefoneCliente: string;
  motoristaNome: string;
  motoristaTelefone: string;
  emergenciaNome: string;
  emergenciaTelefone: string;
  origem: string;
  destino: string;
  stageOrStatus: string;
  valorFreteEmpresa: number;
  valorFreteMotorista: number;
  favorecido: string;
  tipoChavePix: string;
  chavePix: string;
  banco: string;
  docsOk?: string[];
}

export interface CompanyBrandInfo {
  legalName: string;
  cnpj: string;
  unitLabel: string;
  primaryColor: [number, number, number]; // RGB
  accentColor: [number, number, number]; // RGB
}

export interface OfficialCompanyLegalProfile {
  brand: ActiveCarrierBrand;
  legalName: string;
  cnpj: string;
  ie: string;
  address: string;
  city: string;
  phone: string;
  logoPath: string;
}

export const COMPANY_LEGAL_PROFILES: Record<ActiveCarrierBrand, OfficialCompanyLegalProfile> = {
  RODOVAR: {
    brand: 'RODOVAR',
    legalName: 'RODOVAR TRANSPORTES E LOGISTICA',
    cnpj: '49908710000103',
    ie: '205429099',
    address: 'TRAVESSA ACALANTO / JARDIM DAS MARGARIDAS - SALVADOR - BA',
    city: 'SALVADOR',
    phone: '(71) 9 9920-2476',
    logoPath: '/assets/aistudio/RODOVAR-LOGO_310056c8.png',
  },
  'VL TRANSPORTES': {
    brand: 'VL TRANSPORTES',
    legalName: 'VL TRANSPORTES LTDA',
    cnpj: '54506363000122',
    ie: '',
    address: 'R JUBIABA, 292 - LUIS EDUARDO MAGALHAES - SIMOES FILHO / BA',
    city: 'SIMOES FILHO',
    phone: '(71) 9 9920-2476',
    logoPath: '/assets/aistudio/image_a37f0512.png',
  },
};

export function getCompanyBrandInfo(
  brand: CarrierBrand = 'RODOVAR',
  unit: OperationalUnit = 'BA - Salvador'
): CompanyBrandInfo {
  const isSalvador = !unit.includes('SP') && !unit.toLowerCase().includes('guarulhos');
  const unitLabel = isSalvador ? 'Unidade SSA-BA · Salvador' : 'Unidade GRU-SP · Guarulhos';

  if (brand === 'VL TRANSPORTES') {
    return {
      legalName: 'VL TRANSPORTES LTDA',
      cnpj: 'CNPJ 54.506.363/0001-22',
      unitLabel,
      primaryColor: [17, 24, 39],
      accentColor: [250, 204, 21],
    };
  }

  if (brand === 'AXD') {
    return {
      legalName: 'AXD LOGÍSTICA & TRANSPORTES LTDA (HISTÓRICO)',
      cnpj: 'Registro Histórico',
      unitLabel,
      primaryColor: [30, 41, 59],
      accentColor: [148, 163, 184],
    };
  }

  return {
    legalName: 'RODOVAR TRANSPORTES E LOGISTICA',
    cnpj: 'CNPJ 49.908.710/0001-03',
    unitLabel,
    primaryColor: [17, 24, 39],
    accentColor: [250, 204, 21],
  };
}

export function extractOrderDisplayNumber(freight: UnifiedFreightRecord): {
  seqFormatted: string;
  year: number;
  fullCode: string;
} {
  const currentYear = new Date().getFullYear();
  const year = freight.ordemColetaAno || currentYear;
  const cleanedOrderNum = freight.ordemCarregamentoNumero
    ? freight.ordemCarregamentoNumero.replace(/(?:\/|-)\d{4}$/, '')
    : '';
  if (typeof freight.ordemColetaSequencia === 'number' && freight.ordemColetaSequencia > 0) {
    const seqFormatted = String(freight.ordemColetaSequencia).padStart(6, '0');
    const prefix = freight.empresaMarca === 'VL TRANSPORTES' ? 'OC-VL-' : 'OC-RDV-';
    return {
      seqFormatted,
      year,
      fullCode: cleanedOrderNum || `${prefix}${seqFormatted}`,
    };
  }
  if (cleanedOrderNum) {
    const m = cleanedOrderNum.match(/(\d+)$/);
    if (m) {
      return {
        seqFormatted: String(parseInt(m[1], 10)).padStart(6, '0'),
        year,
        fullCode: cleanedOrderNum,
      };
    }
    return {
      seqFormatted: cleanedOrderNum,
      year,
      fullCode: cleanedOrderNum,
    };
  }
  const protoDigits = freight.protocol.replace(/\D/g, '') || '0';
  return {
    seqFormatted: String(parseInt(protoDigits, 10) || 1).padStart(6, '0'),
    year,
    fullCode: freight.protocol,
  };
}

function formatDateBrFromIso(iso?: string): string {
  if (!iso) return '—';
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }
  return iso;
}

function formatLongDatePtBr(date: Date = new Date()): string {
  const months = [
    'janeiro',
    'fevereiro',
    'março',
    'abril',
    'maio',
    'junho',
    'julho',
    'agosto',
    'setembro',
    'outubro',
    'novembro',
    'dezembro',
  ];
  const d = String(date.getDate()).padStart(2, '0');
  const m = months[date.getMonth()] || 'janeiro';
  const y = date.getFullYear();
  return `${d} de ${m} de ${y}`;
}

export function formatPesoBr(pesoKg?: number): string {
  if (!pesoKg || pesoKg <= 0) return '0,00';
  return pesoKg.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatCentavosNumberBr(centavos?: number): string {
  if (!centavos || centavos <= 0) return '0,00';
  return (centavos / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export interface CollectionOrderDocumentData {
  brand: ActiveCarrierBrand;
  company: OfficialCompanyLegalProfile;
  seqFormatted: string;
  year: number;
  fullCode: string;
  protocol: string;
  solicitadaData: string;
  solicitadaHora: string;
  dataHoraEmissao: string;
  usuarioResponsavel: string;
  comercial: string;
  orcamento: string;
  pedido: string;
  clienteNome: string;
  clienteMunicipio: string;
  clienteTelefone: string;
  clienteCnpjCpf: string;
  clienteIe: string;
  remetenteNome: string;
  remetenteEndereco: string;
  remetenteBairro: string;
  remetenteTelefone: string;
  remetenteMunicipio: string;
  remetenteCep: string;
  remetenteCnpjCpf: string;
  remetenteIe: string;
  destinatarioNome: string;
  destinatarioEndereco: string;
  destinatarioBairro: string;
  destinatarioTelefone: string;
  destinatarioMunicipio: string;
  destinatarioCep: string;
  destinatarioCnpjCpf: string;
  destinatarioIe: string;
  pontoReferencia: string;
  produto: string;
  especie: string;
  embalagem: string;
  valorMercadoriaFormatted: string;
  volumes: string;
  pesoBrutoFormatted: string;
  qtdEntregas: string;
  observacoes: string;
  motoristaNome: string;
  motoristaCpf: string;
  motoristaRg: string;
  motoristaCnh: string;
  tipoVeiculo: string;
  placaCavalo: string;
  placaCarreta: string;
  placaBitrem: string;
  cidadeExtensoFooter: string;
}

export function validateFreightForCollectionOrder(freight: UnifiedFreightRecord): string[] {
  const issues: string[] = [];
  if (freight.empresaMarca === 'AXD') {
    issues.push(
      'Empresa AXD descontinuada para novas emissões. Selecione RODOVAR ou VL TRANSPORTES.'
    );
  }
  if (!freight.cliente || freight.cliente.trim().length < 2) issues.push('Cliente');
  if (!freight.origemCidadeUf || !freight.enderecoColeta || freight.enderecoColeta.trim().length < 3) {
    issues.push('Local e endereço de coleta');
  }
  if (!freight.destinoCidadeUf) issues.push('Cidade/UF de entrega');
  if (!freight.tipoCarga || freight.tipoCarga.trim().length < 2) issues.push('Produto / carga');
  if (!freight.pesoKg || freight.pesoKg <= 0) issues.push('Peso da carga');
  if (!freight.veiculoNecessario || freight.veiculoNecessario.trim().length < 2) {
    issues.push('Tipo de veículo');
  }
  if (!freight.motoristaNome || freight.motoristaNome.trim().length < 3) {
    issues.push('Nome do motorista');
  }
  const cpfDigits = String(freight.motoristaCpf || '').replace(/\D/g, '');
  if (cpfDigits.length !== 11) issues.push('CPF válido do motorista');
  if (!freight.placaVeiculo || freight.placaVeiculo.trim().length < 6) {
    issues.push('Placa do veículo');
  }
  return issues;
}

export function buildCollectionOrderViewModel(
  freight: UnifiedFreightRecord,
  issuedByName?: string
): CollectionOrderDocumentData {
  if (freight.empresaMarca === 'AXD') {
    throw new Error(
      'A empresa AXD foi descontinuada e não permite geração de nova Ordem de Coleta.'
    );
  }

  const brand: ActiveCarrierBrand =
    freight.empresaMarca === 'VL TRANSPORTES' ? 'VL TRANSPORTES' : 'RODOVAR';
  const company = COMPANY_LEGAL_PROFILES[brand];
  const { seqFormatted, year, fullCode } = extractOrderDisplayNumber(freight);
  const solicitadaData = formatDateBrFromIso(freight.dataColetaIso);
  const solicitadaHora = freight.janelaColetaInicio || '08:00';
  const dataHoraEmissao =
    freight.ordemCarregamentoEmitidaEm ||
    freight.updatedAtFormatted ||
    new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

  // Operational instructions only: NEVER include valorCobradoClienteCentavos, internal margin, or internal observacoes
  const operationalObs = [
    freight.instrucoesColetaEntrega,
    freight.condicoesOperacionais,
    freight.janelaColetaInicio
      ? `Janela de coleta: ${freight.janelaColetaInicio}${freight.janelaColetaFim ? ` às ${freight.janelaColetaFim}` : ''}`
      : '',
  ]
    .filter((s) => Boolean(s && s.trim()))
    .join(' • ');

  return {
    brand,
    company,
    seqFormatted,
    year,
    fullCode,
    protocol: freight.protocol,
    solicitadaData,
    solicitadaHora,
    dataHoraEmissao,
    usuarioResponsavel: (issuedByName || freight.expedicaoResponsavelNome || 'EXPEDIÇÃO').toUpperCase(),
    comercial: (freight.comercialResponsavelNome || '—').toUpperCase(),
    orcamento: freight.numeroOrcamento || freight.protocol.replace('#', ''),
    pedido: freight.numeroPedido || '—',
    clienteNome: (freight.cliente || '—').toUpperCase(),
    clienteMunicipio: (freight.origemCidadeUf || '—').toUpperCase(),
    clienteTelefone: freight.clienteContato || '—',
    clienteCnpjCpf: freight.clienteCnpj || '—',
    clienteIe: '—',
    remetenteNome: (freight.remetenteNome || freight.cliente || '—').toUpperCase(),
    remetenteEndereco: freight.remetenteEndereco || freight.enderecoColeta || '—',
    remetenteBairro: freight.remetenteBairro || '—',
    remetenteTelefone: freight.remetenteTelefone || freight.clienteContato || '—',
    remetenteMunicipio: (freight.remetenteMunicipio || freight.origemCidadeUf || '—').toUpperCase(),
    remetenteCep: freight.remetenteCep || '—',
    remetenteCnpjCpf: freight.remetenteCnpjCpf || freight.clienteCnpj || '—',
    remetenteIe: freight.remetenteIe || '—',
    destinatarioNome: (freight.destinatarioNome || freight.cliente || 'A CONFIRMAR NO DESTINO').toUpperCase(),
    destinatarioEndereco:
      freight.destinatarioEndereco ||
      freight.enderecoEntrega ||
      'A confirmar pelo Monitoramento',
    destinatarioBairro: freight.destinatarioBairro || '—',
    destinatarioTelefone: freight.destinatarioTelefone || freight.clienteContato || '—',
    destinatarioMunicipio: (freight.destinatarioMunicipio || freight.destinoCidadeUf || '—').toUpperCase(),
    destinatarioCep: freight.destinatarioCep || '—',
    destinatarioCnpjCpf: freight.destinatarioCnpjCpf || '—',
    destinatarioIe: freight.destinatarioIe || '—',
    pontoReferencia: freight.pontoReferencia || '—',
    produto: (freight.tipoCarga || '—').toUpperCase(),
    especie: (freight.especieCarga || 'CARGA GERAL').toUpperCase(),
    embalagem: (freight.embalagemCarga || freight.especieCarga || 'PALETIZADA / GRANEL').toUpperCase(),
    valorMercadoriaFormatted:
      freight.valorMercadoriaCentavos && freight.valorMercadoriaCentavos > 0
        ? formatCentavosNumberBr(freight.valorMercadoriaCentavos)
        : '—',
    volumes: freight.volumes ? String(freight.volumes) : '0',
    pesoBrutoFormatted: formatPesoBr(freight.pesoKg),
    qtdEntregas: freight.quantidadeEntregas ? String(freight.quantidadeEntregas) : '1',
    observacoes: operationalObs || 'Apresentar CNH, CRLV e EPIs no local de carregamento.',
    motoristaNome: (freight.motoristaNome || '—').toUpperCase(),
    motoristaCpf: freight.motoristaCpf || '—',
    motoristaRg: freight.motoristaRg || '—',
    motoristaCnh: freight.motoristaCnh || '—',
    tipoVeiculo: (freight.veiculoNecessario || '—').toUpperCase(),
    placaCavalo: (freight.placaVeiculo || '—').toUpperCase(),
    placaCarreta: (freight.placaCarreta || '—').toUpperCase(),
    placaBitrem: (freight.placaBitrem || '—').toUpperCase(),
    cidadeExtensoFooter: `${company.city}, ${formatLongDatePtBr(new Date())}`,
  };
}

// ============================================================================
// OFFICIAL A4 PDF GENERATOR (2 VIAS ON 1 A4 PORTRAIT PAGE — RODOVAR & VL)
// ============================================================================
export async function generateCollectionOrderPdfA4(
  freight: UnifiedFreightRecord,
  issuedByName?: string
): Promise<void> {
  if (freight.ordemColetaPendente && !freight.ordemCarregamentoNumero) {
    throw new Error(
      'Este frete está com a Ordem de Coleta marcada como pendente ("Ignorar por enquanto"). Gere a Ordem de Coleta oficial antes de baixar o PDF.'
    );
  }
  const issues = validateFreightForCollectionOrder(freight);
  if (issues.length > 0) {
    throw new Error(
      `Não é possível gerar o PDF da Ordem de Coleta. Campos obrigatórios pendentes: ${issues.join(', ')}.`
    );
  }

  const data = buildCollectionOrderViewModel(freight, issuedByName);
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  let logoDataUrl = '';
  try {
    logoDataUrl = await getCarrierLogoPngDataUrl(data.brand);
  } catch {
    logoDataUrl = '';
  }

  const pageWidth = 210;
  const margin = 8;
  const contentWidth = pageWidth - margin * 2; // 194mm

  const drawSafeText = (
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    options?: { align?: 'left' | 'center' | 'right'; maxLines?: number; lineHeight?: number }
  ) => {
    const clean = String(text || '—');
    const lines = doc.splitTextToSize(clean, Math.max(8, maxWidth));
    const maxLines = options?.maxLines ?? 1;
    const lh = options?.lineHeight ?? 3.3;
    for (let i = 0; i < Math.min(maxLines, lines.length); i++) {
      let lineStr = String(lines[i]);
      if (i === maxLines - 1 && lines.length > maxLines && lineStr.length > 3) {
        lineStr = `${lineStr.slice(0, -1).trimEnd()}…`;
      }
      doc.text(lineStr, x, y + i * lh, options?.align ? { align: options.align } : undefined);
    }
  };

  const renderRodovarVia = (startY: number, viaLabel: '1ª-VIA' | '2ª-VIA') => {
    const leftW = 97;
    const rightX = margin + leftW + 2;
    const rightW = contentWidth - leftW - 2; // 95mm
    const headerH = 26;

    doc.setDrawColor(40, 40, 40);
    doc.setLineWidth(0.28);

    // Top-left company block (logo + legal details)
    doc.rect(margin, startY, leftW, headerH);
    if (logoDataUrl) {
      doc.addImage(logoDataUrl, 'PNG', margin + 2, startY + 1.5, 42, 13.5);
    } else {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(15, 23, 42);
      doc.text('RODOVAR', margin + 3, startY + 10);
    }

    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    drawSafeText(data.company.legalName, margin + 2, startY + 18, leftW - 4);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    drawSafeText(
      `CNPJ: ${data.company.cnpj}      IE: ${data.company.ie}`,
      margin + 2,
      startY + 21.5,
      leftW - 4
    );
    drawSafeText(data.company.address, margin + 2, startY + 24.8, leftW - 4);

    // Top-right ORDEM DE COLETA & Cliente box
    doc.rect(rightX, startY, rightW, headerH);
    doc.setFillColor(243, 244, 246);
    doc.rect(rightX, startY, rightW, 6, 'F');
    doc.line(rightX, startY + 6, rightX + rightW, startY + 6);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);
    doc.text('ORDEM DE COLETA', rightX + 2, startY + 4.3);
    doc.text(`Nº :  ${data.seqFormatted}`, rightX + 41, startY + 4.3);
    doc.text(viaLabel, rightX + rightW - 2, startY + 4.3, { align: 'right' });

    doc.setFontSize(6.6);
    doc.setFont('helvetica', 'bold');
    doc.text('Cliente:', rightX + 2, startY + 10);
    doc.setFont('helvetica', 'normal');
    drawSafeText(data.clienteNome, rightX + 14, startY + 10, rightW - 16);

    doc.setFont('helvetica', 'bold');
    doc.text('Município:', rightX + 2, startY + 14);
    doc.setFont('helvetica', 'normal');
    drawSafeText(data.clienteMunicipio, rightX + 16, startY + 14, rightW - 48);

    doc.setFont('helvetica', 'bold');
    doc.text('Telefone:', rightX + 61, startY + 14);
    doc.setFont('helvetica', 'normal');
    drawSafeText(data.clienteTelefone, rightX + 73, startY + 14, 21);

    doc.setFont('helvetica', 'bold');
    doc.text('CNPJ/CPF:', rightX + 2, startY + 18);
    doc.setFont('helvetica', 'normal');
    drawSafeText(data.clienteCnpjCpf, rightX + 16, startY + 18, 38);

    doc.setFont('helvetica', 'bold');
    doc.text('IE:', rightX + 56, startY + 18);
    doc.setFont('helvetica', 'normal');
    drawSafeText(data.clienteIe, rightX + 61, startY + 18, 32);

    doc.setFont('helvetica', 'bold');
    doc.text('Protocolo:', rightX + 2, startY + 22.5);
    doc.setFont('helvetica', 'normal');
    doc.text(data.protocol, rightX + 16, startY + 22.5);

    // Row 2: Comercial | Orçamento | Pedido | Solicitada Em
    let y = startY + headerH + 1.5;
    const metaH = 6.5;
    doc.rect(margin, y, contentWidth, metaH);
    const metaCols = [64, 42, 42, 46];
    let cx = margin;
    const metaItems = [
      ['Comercial:', data.comercial],
      ['Orçamento:', data.orcamento],
      ['Pedido:', data.pedido],
      ['Solicitada Em:', `${data.solicitadaData}  ${data.solicitadaHora}`],
    ];
    metaItems.forEach(([lbl, val], idx) => {
      if (idx > 0) doc.line(cx, y, cx, y + metaH);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.text(lbl, cx + 1.5, y + 4.3);
      doc.setFont('helvetica', 'normal');
      drawSafeText(val, cx + (idx === 0 ? 15 : 17), y + 4.3, metaCols[idx] - 19);
      cx += metaCols[idx];
    });

    // Row 3: 2 Columns LOCAL COLETA | LOCAL ENTREGA + Ponto Ref.
    y += metaH + 1.5;
    const locH = 29;
    const halfW = contentWidth / 2;
    doc.rect(margin, y, contentWidth, locH);
    doc.line(margin + halfW, y, margin + halfW, y + locH - 5.5);
    doc.setFillColor(243, 244, 246);
    doc.rect(margin, y, contentWidth, 5, 'F');
    doc.line(margin, y + 5, margin + contentWidth, y + 5);
    doc.line(margin + halfW, y, margin + halfW, y + locH - 5.5);
    doc.line(margin, y + locH - 5.5, margin + contentWidth, y + locH - 5.5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.2);
    doc.text('LOCAL COLETA', margin + halfW / 2, y + 3.6, { align: 'center' });
    doc.text('LOCAL ENTREGA', margin + halfW + halfW / 2, y + 3.6, { align: 'center' });

    const drawLocationBlock = (
      bx: number,
      by: number,
      partyLabel: string,
      partyName: string,
      addr: string,
      bairro: string,
      tel: string,
      muni: string,
      cep: string,
      docId: string,
      ie: string
    ) => {
      doc.setFontSize(6.3);
      doc.setFont('helvetica', 'bold');
      doc.text(partyLabel, bx + 1.5, by + 8.5);
      doc.setFont('helvetica', 'normal');
      drawSafeText(partyName, bx + 18, by + 8.5, halfW - 20);

      doc.setFont('helvetica', 'bold');
      doc.text('Endereço:', bx + 1.5, by + 12.2);
      doc.setFont('helvetica', 'normal');
      drawSafeText(addr, bx + 15, by + 12.2, halfW - 17);

      doc.setFont('helvetica', 'bold');
      doc.text('Bairro:', bx + 1.5, by + 15.9);
      doc.setFont('helvetica', 'normal');
      drawSafeText(bairro, bx + 12, by + 15.9, 44);
      doc.setFont('helvetica', 'bold');
      doc.text('Telefone:', bx + 58, by + 15.9);
      doc.setFont('helvetica', 'normal');
      drawSafeText(tel, bx + 70, by + 15.9, 25);

      doc.setFont('helvetica', 'bold');
      doc.text('Município:', bx + 1.5, by + 19.6);
      doc.setFont('helvetica', 'normal');
      drawSafeText(muni, bx + 15, by + 19.6, 44);
      doc.setFont('helvetica', 'bold');
      doc.text('CEP:', bx + 62, by + 19.6);
      doc.setFont('helvetica', 'normal');
      drawSafeText(cep, bx + 69, by + 19.6, 25);

      doc.setFont('helvetica', 'bold');
      doc.text('CNPJ/CPF:', bx + 1.5, by + 23);
      doc.setFont('helvetica', 'normal');
      drawSafeText(docId, bx + 15, by + 23, 40);
      doc.setFont('helvetica', 'bold');
      doc.text('IE:', bx + 58, by + 23);
      doc.setFont('helvetica', 'normal');
      drawSafeText(ie, bx + 63, by + 23, 30);
    };

    drawLocationBlock(
      margin,
      y,
      'Remetente:',
      data.remetenteNome,
      data.remetenteEndereco,
      data.remetenteBairro,
      data.remetenteTelefone,
      data.remetenteMunicipio,
      data.remetenteCep,
      data.remetenteCnpjCpf,
      data.remetenteIe
    );

    drawLocationBlock(
      margin + halfW,
      y,
      'Destinatário:',
      data.destinatarioNome,
      data.destinatarioEndereco,
      data.destinatarioBairro,
      data.destinatarioTelefone,
      data.destinatarioMunicipio,
      data.destinatarioCep,
      data.destinatarioCnpjCpf,
      data.destinatarioIe
    );

    // Ponto Ref row
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.4);
    doc.text('Ponto Ref.:', margin + 1.5, y + locH - 1.8);
    doc.setFont('helvetica', 'normal');
    drawSafeText(data.pontoReferencia, margin + 16, y + locH - 1.8, contentWidth - 18);

    // Row 4: DESCRIÇÃO DA CARGA A SER COLETADA
    y += locH + 1.5;
    const cargoH = 17;
    doc.rect(margin, y, contentWidth, cargoH);
    doc.setFillColor(243, 244, 246);
    doc.rect(margin, y, contentWidth, 5, 'F');
    doc.line(margin, y + 5, margin + contentWidth, y + 5);
    doc.line(margin, y + 10, margin + contentWidth, y + 10);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.2);
    doc.text('DESCRIÇÃO DA CARGA A SER COLETADA', margin + contentWidth / 2, y + 3.6, {
      align: 'center',
    });

    const cargoCols = [64, 42, 34, 24, 30]; // total 194
    const cargoHeaders = ['Produto', 'Espécie', 'Valor', 'Volumes', 'Peso Bruto'];
    const cargoVals = [
      data.produto,
      data.especie,
      data.valorMercadoriaFormatted,
      data.volumes,
      data.pesoBrutoFormatted,
    ];
    let ccx = margin;
    cargoHeaders.forEach((h, idx) => {
      if (idx > 0) doc.line(ccx, y + 5, ccx, y + cargoH);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.text(h, ccx + cargoCols[idx] / 2, y + 8.6, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.8);
      drawSafeText(cargoVals[idx], ccx + cargoCols[idx] / 2, y + 14.2, cargoCols[idx] - 3, {
        align: 'center',
      });
      ccx += cargoCols[idx];
    });

    // Row 5: OBSERVAÇÕES
    y += cargoH + 1.5;
    const obsH = 14;
    doc.rect(margin, y, contentWidth, obsH);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.6);
    doc.text('OBSERVAÇÕES', margin + 2, y + 4);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    drawSafeText(data.observacoes, margin + 2, y + 7.8, contentWidth - 4, {
      maxLines: 2,
      lineHeight: 3.1,
    });

    // Row 6: Motorista / Veículo 4-col grid
    y += obsH + 1.5;
    const drvH = 13;
    doc.rect(margin, y, contentWidth, drvH);
    doc.line(margin, y + 6.5, margin + contentWidth, y + 6.5);
    const drvCols = [74, 42, 39, 39];
    let dcx = margin;
    const drvRow1 = [
      ['Motorista:', data.motoristaNome],
      ['CPF:', data.motoristaCpf],
      ['RG:', data.motoristaRg],
      ['CNH:', data.motoristaCnh],
    ];
    const drvRow2 = [
      ['Tipo de veículo:', data.tipoVeiculo],
      ['Placa:', data.placaCavalo],
      ['Carreta:', data.placaCarreta],
      ['Bitrem:', data.placaBitrem],
    ];
    for (let i = 0; i < 4; i++) {
      if (i > 0) doc.line(dcx, y, dcx, y + drvH);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.4);
      doc.text(drvRow1[i][0], dcx + 1.5, y + 4.3);
      doc.setFont('helvetica', 'normal');
      drawSafeText(
        drvRow1[i][1],
        dcx + (i === 0 ? 15 : 10),
        y + 4.3,
        drvCols[i] - (i === 0 ? 17 : 12)
      );

      doc.setFont('helvetica', 'bold');
      doc.text(drvRow2[i][0], dcx + 1.5, y + 10.8);
      doc.setFont('helvetica', 'normal');
      drawSafeText(
        drvRow2[i][1],
        dcx + (i === 0 ? 21 : 13),
        y + 10.8,
        drvCols[i] - (i === 0 ? 23 : 15)
      );
      dcx += drvCols[i];
    }

    // Row 7: 3-cell Signature Footer
    y += drvH + 1.5;
    const sigH = 18;
    doc.rect(margin, y, contentWidth, sigH);
    const sigCols = [74, 42, 78];
    doc.line(margin + sigCols[0], y, margin + sigCols[0], y + sigH);
    doc.line(margin + sigCols[0] + sigCols[1], y, margin + sigCols[0] + sigCols[1], y + sigH);

    // Cell 1: Assinatura do Motorista
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.4);
    doc.text('Assinatura do Motorista:', margin + 2, y + 4);
    doc.line(margin + 6, y + 12.5, margin + sigCols[0] - 6, y + 12.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.2);
    drawSafeText(data.motoristaNome, margin + sigCols[0] / 2, y + 16, sigCols[0] - 6, {
      align: 'center',
    });

    // Cell 2: Data
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.6);
    doc.text('Data:  _____/_____/_______', margin + sigCols[0] + sigCols[1] / 2, y + 11, {
      align: 'center',
    });

    // Cell 3: Responsável pela Operação & Ass. do Recebedor
    const s3x = margin + sigCols[0] + sigCols[1];
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.2);
    doc.text('Responsável pela Operação:', s3x + 2, y + 4.2);
    doc.setFont('helvetica', 'normal');
    drawSafeText(data.usuarioResponsavel, s3x + 36, y + 4.2, sigCols[2] - 38);
    doc.line(s3x + 22, y + 13.5, s3x + sigCols[2] - 4, y + 13.5);
    doc.setFont('helvetica', 'bold');
    doc.text('Ass. do Recebedor:', s3x + 2, y + 13.5);
  };

  const renderVlVia = (startY: number, viaLabel: '1ª-VIA' | '2ª-VIA') => {
    doc.setDrawColor(40, 40, 40);
    doc.setLineWidth(0.28);
    doc.setTextColor(15, 23, 42);

    // Top Header Block (Logo Left | Center Legal | Right Meta)
    const headerH = 21;
    doc.rect(margin, startY, contentWidth, headerH);
    const logoW = 40;
    const rightMetaW = 46;
    const centerW = contentWidth - logoW - rightMetaW;
    doc.line(margin + logoW, startY, margin + logoW, startY + headerH);
    doc.line(margin + logoW + centerW, startY, margin + logoW + centerW, startY + headerH);

    if (logoDataUrl) {
      doc.addImage(logoDataUrl, 'PNG', margin + 2, startY + 2, logoW - 4, headerH - 4);
    } else {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text('VL TRANSPORTES', margin + logoW / 2, startY + 12, { align: 'center' });
    }

    const cx = margin + logoW;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(data.company.legalName, cx + centerW / 2, startY + 6.5, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.text(
      `CNPJ: ${data.company.cnpj}      Fone: ${data.company.phone}`,
      cx + centerW / 2,
      startY + 12,
      { align: 'center' }
    );
    drawSafeText(data.company.address, cx + centerW / 2, startY + 17, centerW - 4, {
      align: 'center',
    });

    const rx = margin + logoW + centerW;
    doc.setFontSize(6.4);
    doc.setFont('helvetica', 'bold');
    doc.text('Modelo:', rx + 2, startY + 5.5);
    doc.setFont('helvetica', 'normal');
    doc.text('Personalizado', rx + 13, startY + 5.5);

    doc.setFont('helvetica', 'bold');
    doc.text('Data/Hora:', rx + 2, startY + 11.5);
    doc.setFont('helvetica', 'normal');
    drawSafeText(data.dataHoraEmissao, rx + 16, startY + 11.5, rightMetaW - 18);

    doc.setFont('helvetica', 'bold');
    doc.text('Usuário:', rx + 2, startY + 17.5);
    doc.setFont('helvetica', 'normal');
    drawSafeText(data.usuarioResponsavel, rx + 14, startY + 17.5, rightMetaW - 16);

    // Bar 2: Solicitada Em | às | ORDEM DE COLETA | Nº | VIA
    let y = startY + headerH + 1.5;
    const barH = 6.5;
    doc.setFillColor(243, 244, 246);
    doc.rect(margin, y, contentWidth, barH, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.8);
    doc.text(`Solicitada Em: ${data.solicitadaData}`, margin + 2, y + 4.4);
    doc.text(`às: ${data.solicitadaHora}`, margin + 44, y + 4.4);
    doc.setFontSize(8.2);
    doc.text('ORDEM DE COLETA', margin + 96, y + 4.5, { align: 'center' });
    doc.setFontSize(7.8);
    doc.text(`Nº : ${data.seqFormatted}`, margin + 150, y + 4.4, {
      align: 'center',
    });
    doc.text(viaLabel, margin + contentWidth - 2, y + 4.4, { align: 'right' });

    // Bar 3: Comercial | Pedido Nº | Orçamento Nº
    y += barH + 1.2;
    const comH = 6;
    doc.rect(margin, y, contentWidth, comH);
    doc.line(margin + 88, y, margin + 88, y + comH);
    doc.line(margin + 141, y, margin + 141, y + comH);
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'bold');
    doc.text('Comercial:', margin + 2, y + 4.1);
    doc.setFont('helvetica', 'normal');
    drawSafeText(data.comercial, margin + 16, y + 4.1, 70);

    doc.setFont('helvetica', 'bold');
    doc.text('Pedido Nº:', margin + 90, y + 4.1);
    doc.setFont('helvetica', 'normal');
    drawSafeText(data.pedido, margin + 105, y + 4.1, 34);

    doc.setFont('helvetica', 'bold');
    doc.text('Orçamento Nº:', margin + 143, y + 4.1);
    doc.setFont('helvetica', 'normal');
    drawSafeText(data.orcamento, margin + 163, y + 4.1, 29);

    // Boxed Party & Route Rows (6 compact rows)
    y += comH + 1.2;
    const rowH = 5.6;
    const drawFullRow = (lbl: string, val: string, secondLbl?: string, secondVal?: string) => {
      doc.rect(margin, y, contentWidth, rowH);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.4);
      doc.text(lbl, margin + 2, y + 3.9);
      doc.setFont('helvetica', 'normal');
      if (secondLbl) {
        doc.line(margin + 138, y, margin + 138, y + rowH);
        drawSafeText(val, margin + 24, y + 3.9, 112);
        doc.setFont('helvetica', 'bold');
        doc.text(secondLbl, margin + 140, y + 3.9);
        doc.setFont('helvetica', 'normal');
        drawSafeText(secondVal || '—', margin + 150, y + 3.9, 42);
      } else {
        drawSafeText(val, margin + 24, y + 3.9, contentWidth - 26);
      }
      y += rowH;
    };

    drawFullRow('Cliente:', `${data.clienteNome} (${data.protocol})`);
    drawFullRow('Remetente:', data.remetenteNome, 'Fone:', data.remetenteTelefone);
    drawFullRow(
      'Local da coleta:',
      `${data.remetenteEndereco} — ${data.remetenteMunicipio}`
    );
    drawFullRow('Ponto Ref.:', data.pontoReferencia);
    drawFullRow('Destinatário:', data.destinatarioNome, 'Fone:', data.destinatarioTelefone);
    drawFullRow(
      'Local entrega:',
      `${data.destinatarioEndereco} — ${data.destinatarioMunicipio}`
    );

    // Heading: Dados do carregamento
    y += 1;
    doc.setFillColor(243, 244, 246);
    doc.rect(margin, y, contentWidth, 5, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.2);
    doc.text('Dados do carregamento', margin + contentWidth / 2, y + 3.6, { align: 'center' });
    y += 5;

    drawFullRow(
      'Dados da carga:',
      `Peso Solicitado : ${data.pesoBrutoFormatted} kg  -  Volume Solicitado : ${data.volumes}  -  Valor Mercadoria : ${data.valorMercadoriaFormatted}  -  QTD entregas: ${data.qtdEntregas}`
    );
    drawFullRow('Conteúdo:', `${data.produto}  -  Embalagem: ${data.embalagem}`);
    drawFullRow(
      'Veículo (s):',
      `${data.tipoVeiculo}  |  Placa veiculo: ${data.placaCavalo}  -  Placa carreta: ${data.placaCarreta}  -  Placa bitrem: ${data.placaBitrem}`
    );
    drawFullRow(
      'Motorista:',
      `${data.motoristaNome}  -  CPF: ${data.motoristaCpf}  -  RG: ${data.motoristaRg}`
    );

    // Observações box
    const obsH = 11.5;
    doc.rect(margin, y, contentWidth, obsH);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.4);
    doc.text('Observações:', margin + 2, y + 3.9);
    doc.setFont('helvetica', 'normal');
    drawSafeText(data.observacoes, margin + 20, y + 3.9, contentWidth - 22, {
      maxLines: 2,
      lineHeight: 3.1,
    });
    y += obsH + 2;

    // Footer specific to 1ª-VIA vs 2ª-VIA
    doc.setFontSize(6.8);
    if (viaLabel === '1ª-VIA') {
      doc.setFont('helvetica', 'normal');
      doc.text(data.cidadeExtensoFooter, margin + 2, y + 6.5);
    } else {
      doc.setFont('helvetica', 'bold');
      doc.text(
        'Chegada: ____/____/______  às  ____:____       Saída: ____/____/______  às  ____:____',
        margin + 2,
        y + 6.5
      );
    }

    const sigX1 = margin + 124;
    const sigX2 = margin + contentWidth - 2;
    doc.line(sigX1, y + 5.5, sigX2, y + 5.5);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.8);
    doc.text(data.company.legalName, (sigX1 + sigX2) / 2, y + 9.2, { align: 'center' });
  };

  if (data.brand === 'VL TRANSPORTES') {
    renderVlVia(7, '1ª-VIA');
  } else {
    renderRodovarVia(7, '1ª-VIA');
  }

  // Cut separator between 1ª-VIA and 2ª-VIA on the exact same A4 page
  doc.setDrawColor(148, 163, 184);
  doc.setLineDashPattern([2, 2], 0);
  doc.line(margin, 148.5, pageWidth - margin, 148.5);
  doc.setLineDashPattern([], 0);

  if (data.brand === 'VL TRANSPORTES') {
    renderVlVia(154, '2ª-VIA');
  } else {
    renderRodovarVia(154, '2ª-VIA');
  }

  const safeBrand = data.brand === 'VL TRANSPORTES' ? 'VL_TRANSPORTES' : 'RODOVAR';
  const safeCode = data.fullCode.replace(/[^a-zA-Z0-9_-]/g, '_');
  doc.save(`Ordem_Coleta_${safeBrand}_${safeCode}.pdf`);
}

export async function generateFreightOrderPdfA4(
  order: FreightOrderDataForPdf,
  canViewFinancialValues: boolean
): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 16;
  const contentWidth = pageWidth - margin * 2;
  const brandInfo = getCompanyBrandInfo(order.empresaMarca, order.unidadeOperacional);

  let y = 14;
  const logoBoxWidth = 52;
  const logoBoxHeight = 18;

  try {
    const logoDataUrl = await getCarrierLogoPngDataUrl(order.empresaMarca || 'RODOVAR');
    if (logoDataUrl) {
      doc.addImage(logoDataUrl, 'PNG', margin, y, logoBoxWidth, logoBoxHeight);
    }
  } catch {
    doc.setTextColor(17, 24, 39);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(order.empresaMarca || 'RODOVAR', margin, y + 12);
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(17, 24, 39);
  doc.text(brandInfo.legalName, pageWidth - margin, y + 5, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(55, 65, 81);
  doc.text(brandInfo.cnpj, pageWidth - margin, y + 10.5, { align: 'right' });

  doc.setFontSize(8);
  doc.setTextColor(107, 114, 128);
  doc.text(brandInfo.unitLabel, pageWidth - margin, y + 15.5, { align: 'right' });

  y += 22;
  doc.setFillColor(brandInfo.accentColor[0], brandInfo.accentColor[1], brandInfo.accentColor[2]);
  doc.rect(margin, y, contentWidth, 2, 'F');
  y += 6;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(17, 24, 39);
  doc.text('ORDEM DE CARREGAMENTO', margin, y + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(107, 114, 128);
  doc.text('Documento operacional', margin, y + 11.5);

  const badgeWidth = 34;
  const badgeHeight = 10;
  const badgeX = pageWidth - margin - badgeWidth;
  doc.setFillColor(17, 24, 39);
  doc.roundedRect(badgeX, y + 1, badgeWidth, badgeHeight, 1.5, 1.5, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(255, 255, 255);
  const cleanCode = order.code.startsWith('#') ? order.code : `#${order.code}`;
  doc.text(cleanCode, badgeX + badgeWidth / 2, y + 7.8, { align: 'center' });

  y += 18;
  const routeBoxHeight = 22;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, y, contentWidth, routeBoxHeight, 2, 2, 'FD');

  const halfWidth = contentWidth / 2;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(107, 114, 128);
  doc.text('ORIGEM', margin + 5, y + 5.5);
  doc.setFontSize(9.5);
  doc.setTextColor(17, 24, 39);
  doc.text(
    doc.splitTextToSize((order.origem || '-').toUpperCase(), halfWidth - 10)[0] || '-',
    margin + 5,
    y + 10.5
  );

  doc.setFontSize(7.5);
  doc.setTextColor(107, 114, 128);
  doc.text('DESTINO', margin + halfWidth + 5, y + 5.5);
  doc.setFontSize(9.5);
  doc.setTextColor(17, 24, 39);
  doc.text(
    doc.splitTextToSize((order.destino || '-').toUpperCase(), halfWidth - 10)[0] || '-',
    margin + halfWidth + 5,
    y + 10.5
  );

  doc.setFontSize(8);
  doc.text(`Carregamento: ${order.dataCarregamento || '-'}`, margin + 5, y + 18);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(75, 85, 99);
  doc.text(`Status: ${order.stageOrStatus || 'Em Trânsito'}`, margin + halfWidth + 5, y + 18);

  y += routeBoxHeight + 6;
  const drawNumberedSectionHeader = (numStr: string, titleStr: string) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(217, 119, 6);
    doc.text(numStr, margin, y + 4);
    doc.setTextColor(17, 24, 39);
    doc.text(titleStr, margin + 7, y + 4);
    doc.setDrawColor(229, 231, 235);
    doc.setLineWidth(0.3);
    doc.line(margin, y + 6.5, pageWidth - margin, y + 6.5);
    y += 11;
  };

  const draw2ColFields = (
    label1: string,
    val1: string,
    label2: string,
    val2: string,
    rowHeight = 11
  ) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(107, 114, 128);
    doc.text(label1.toUpperCase(), margin, y + 3.5);
    doc.setFontSize(8.5);
    doc.setTextColor(17, 24, 39);
    doc.text(doc.splitTextToSize(val1 || '-', halfWidth - 6)[0] || '-', margin, y + 8);

    const x2 = margin + halfWidth;
    doc.setFontSize(7);
    doc.setTextColor(107, 114, 128);
    doc.text(label2.toUpperCase(), x2, y + 3.5);
    doc.setFontSize(8.5);
    doc.setTextColor(17, 24, 39);
    doc.text(doc.splitTextToSize(val2 || '-', halfWidth - 6)[0] || '-', x2, y + 8);
    y += rowHeight;
  };

  drawNumberedSectionHeader('01', 'OPERAÇÃO E CLIENTE');
  draw2ColFields(
    'CLIENTE / EMBARCADOR',
    (order.cliente || '-').toUpperCase(),
    'TELEFONE DO CLIENTE',
    order.telefoneCliente || '—'
  );
  draw2ColFields(
    'COMERCIAL RESPONSÁVEL',
    order.comercialResponsavel || '—',
    'EXPEDIÇÃO RESPONSÁVEL',
    order.expedicaoResponsavel || '—'
  );
  y += 2;

  drawNumberedSectionHeader('02', 'MOTORISTA E CONTATO DE EMERGÊNCIA');
  draw2ColFields(
    'MOTORISTA',
    order.motoristaNome || '-',
    'TELEFONE / WHATSAPP',
    order.motoristaTelefone || '-'
  );
  draw2ColFields(
    'CONTATO DE EMERGÊNCIA / VÍNCULO',
    order.emergenciaNome || 'Contato Familiar',
    'TELEFONE DE EMERGÊNCIA',
    order.emergenciaTelefone || '-'
  );
  y += 2;

  drawNumberedSectionHeader('03', 'FINANCEIRO E PAGAMENTO');
  const freteEmpresaFormatted = canViewFinancialValues
    ? formatCurrencyBRL(order.valorFreteEmpresa || 0)
    : 'R$ ••••••';
  const freteMotoristaFormatted = canViewFinancialValues
    ? formatCurrencyBRL(order.valorFreteMotorista || 0)
    : 'R$ ••••••';

  draw2ColFields(
    'FRETE EMPRESA · COBRADO DO CLIENTE',
    freteEmpresaFormatted,
    'FRETE MOTORISTA · TERCEIRO / AGREGADO',
    freteMotoristaFormatted
  );
  draw2ColFields(
    'FAVORECIDO',
    order.favorecido || '-',
    'BANCO / INSTITUIÇÃO',
    (order.banco || '-').toUpperCase()
  );
  draw2ColFields(
    'TIPO DE CHAVE PIX',
    order.tipoChavePix || 'CPF/CNPJ',
    'CHAVE PIX DO FAVORECIDO',
    order.chavePix || '-'
  );

  if (!canViewFinancialValues) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.5);
    doc.setTextColor(107, 114, 128);
    doc.text(
      'Valores financeiros preservados como ocultos no documento de origem.',
      margin,
      y + 2
    );
  }

  const sigY = 260;
  const sigLineWidth = 52;
  doc.setDrawColor(156, 163, 175);
  doc.setLineWidth(0.4);
  doc.line(margin, sigY, margin + sigLineWidth, sigY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(75, 85, 99);
  doc.text('Expedição / Tráfego', margin + sigLineWidth / 2, sigY + 4, { align: 'center' });

  const col2X = margin + (contentWidth - sigLineWidth) / 2;
  doc.line(col2X, sigY, col2X + sigLineWidth, sigY);
  doc.text('Motorista / Transportador', col2X + sigLineWidth / 2, sigY + 4, { align: 'center' });

  const col3X = pageWidth - margin - sigLineWidth;
  doc.line(col3X, sigY, col3X + sigLineWidth, sigY);
  doc.text('Conferência financeira', col3X + sigLineWidth / 2, sigY + 4, { align: 'center' });

  const footerY = 277;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(107, 114, 128);
  const nowStr = new Date().toLocaleString('pt-BR');
  doc.text(
    `Emissão original: RODOVAR CONECTA · ${nowStr} · Protocolo ${cleanCode}`,
    margin,
    footerY
  );

  const safeBrand = (order.empresaMarca || 'RODOVAR').replace(/\s+/g, '_');
  const safeCodeText = cleanCode.replace(/[^a-zA-Z0-9]/g, '');
  doc.save(`Ordem_Carregamento_${safeBrand}_${safeCodeText}.pdf`);
}
