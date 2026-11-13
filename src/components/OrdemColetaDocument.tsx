import React, { useMemo, useState } from 'react';
import { Check, Download, FileText, Printer, Share2, X } from 'lucide-react';
import type { UnifiedFreightRecord } from '../types';
import {
  buildCollectionOrderViewModel,
  CollectionOrderDocumentData,
  generateCollectionOrderPdfA4,
  validateFreightForCollectionOrder,
} from '../lib/freightOrderPdfGenerator';

function escapeHtml(raw: string): string {
  return String(raw || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildViaHtml(d: CollectionOrderDocumentData, viaLabel: '1ª-VIA' | '2ª-VIA', originUrl: string): string {
  const logoSrc = `${originUrl}${d.company.logoPath}`;

  if (d.brand === 'VL TRANSPORTES') {
    return `
      <div class="via-block vl-via">
        <table class="tbl">
          <tr>
            <td style="width:22%;text-align:center;vertical-align:middle;padding:4px;">
              <img src="${escapeHtml(logoSrc)}" alt="VL Transportes" style="max-height:42px;max-width:100%;object-fit:contain;" />
            </td>
            <td style="width:53%;text-align:center;vertical-align:middle;padding:4px;">
              <div class="title-lg">${escapeHtml(d.company.legalName)}</div>
              <div>CNPJ: ${escapeHtml(d.company.cnpj)} &nbsp;&nbsp;&nbsp; Fone: ${escapeHtml(d.company.phone)}</div>
              <div>${escapeHtml(d.company.address)}</div>
            </td>
            <td style="width:25%;vertical-align:middle;padding:4px;font-size:8.5px;">
              <div><strong>Modelo:</strong> Personalizado</div>
              <div><strong>Data/Hora:</strong> ${escapeHtml(d.dataHoraEmissao)}</div>
              <div><strong>Usuário:</strong> ${escapeHtml(d.usuarioResponsavel)}</div>
            </td>
          </tr>
        </table>

        <table class="tbl mt2">
          <tr class="shaded">
            <td style="width:24%;"><strong>Solicitada Em:</strong> ${escapeHtml(d.solicitadaData)}</td>
            <td style="width:14%;"><strong>às:</strong> ${escapeHtml(d.solicitadaHora)}</td>
            <td style="width:32%;text-align:center;font-weight:900;font-size:11px;">ORDEM DE COLETA</td>
            <td style="width:18%;text-align:center;font-weight:900;">Nº : ${escapeHtml(d.seqFormatted)} / ${d.year}</td>
            <td style="width:12%;text-align:right;font-weight:900;">${viaLabel}</td>
          </tr>
        </table>

        <table class="tbl mt2">
          <tr>
            <td style="width:45%;"><strong>Comercial:</strong> ${escapeHtml(d.comercial)}</td>
            <td style="width:27%;"><strong>Pedido Nº:</strong> ${escapeHtml(d.pedido)}</td>
            <td style="width:28%;"><strong>Orçamento Nº:</strong> ${escapeHtml(d.orcamento)}</td>
          </tr>
        </table>

        <table class="tbl mt2">
          <tr><td colspan="2"><strong>Cliente:</strong> ${escapeHtml(d.clienteNome)} (${escapeHtml(d.protocol)})</td></tr>
          <tr>
            <td style="width:72%;"><strong>Remetente:</strong> ${escapeHtml(d.remetenteNome)}</td>
            <td style="width:28%;"><strong>Fone:</strong> ${escapeHtml(d.remetenteTelefone)}</td>
          </tr>
          <tr><td colspan="2"><strong>Local da coleta:</strong> ${escapeHtml(d.remetenteEndereco)} — ${escapeHtml(d.remetenteMunicipio)}</td></tr>
          <tr><td colspan="2"><strong>Ponto Ref.:</strong> ${escapeHtml(d.pontoReferencia)}</td></tr>
          <tr>
            <td><strong>Destinatário:</strong> ${escapeHtml(d.destinatarioNome)}</td>
            <td><strong>Fone:</strong> ${escapeHtml(d.destinatarioTelefone)}</td>
          </tr>
          <tr><td colspan="2"><strong>Local entrega:</strong> ${escapeHtml(d.destinatarioEndereco)} — ${escapeHtml(d.destinatarioMunicipio)}</td></tr>
        </table>

        <table class="tbl mt2">
          <tr class="shaded"><td style="text-align:center;font-weight:900;">Dados do carregamento</td></tr>
          <tr><td><strong>Dados da carga:</strong> Peso Solicitado: ${escapeHtml(d.pesoBrutoFormatted)} kg &nbsp;-&nbsp; Volume Solicitado: ${escapeHtml(d.volumes)} &nbsp;-&nbsp; Valor Mercadoria: ${escapeHtml(d.valorMercadoriaFormatted)} &nbsp;-&nbsp; QTD entregas: ${escapeHtml(d.qtdEntregas)}</td></tr>
          <tr><td><strong>Conteúdo:</strong> ${escapeHtml(d.produto)} &nbsp;-&nbsp; Embalagem: ${escapeHtml(d.embalagem)}</td></tr>
          <tr><td><strong>Veículo(s):</strong> ${escapeHtml(d.tipoVeiculo)} &nbsp;|&nbsp; Placa veículo: ${escapeHtml(d.placaCavalo)} &nbsp;-&nbsp; Placa carreta: ${escapeHtml(d.placaCarreta)} &nbsp;-&nbsp; Placa bitrem: ${escapeHtml(d.placaBitrem)}</td></tr>
          <tr><td><strong>Motorista:</strong> ${escapeHtml(d.motoristaNome)} &nbsp;-&nbsp; CPF: ${escapeHtml(d.motoristaCpf)} &nbsp;-&nbsp; RG: ${escapeHtml(d.motoristaRg)}</td></tr>
          <tr><td style="min-height:24px;"><strong>Observações:</strong> ${escapeHtml(d.observacoes)}</td></tr>
        </table>

        <div class="vl-footer">
          <div>
            ${
              viaLabel === '1ª-VIA'
                ? escapeHtml(d.cidadeExtensoFooter)
                : '<strong>Chegada:</strong> ___/___/_____ às ___:___ &nbsp;&nbsp; <strong>Saída:</strong> ___/___/_____ às ___:___'
            }
          </div>
          <div class="sig-line">${escapeHtml(d.company.legalName)}</div>
        </div>
      </div>
    `;
  }

  return `
    <div class="via-block rodovar-via">
      <div class="rdv-head">
        <div class="rdv-head-left">
          <img src="${escapeHtml(logoSrc)}" alt="RODOVAR" style="max-height:36px;max-width:155px;object-fit:contain;margin-bottom:3px;" />
          <div class="title-sm">${escapeHtml(d.company.legalName)}</div>
          <div>CNPJ: ${escapeHtml(d.company.cnpj)} &nbsp;&nbsp;&nbsp; IE: ${escapeHtml(d.company.ie)}</div>
          <div>${escapeHtml(d.company.address)}</div>
        </div>
        <div class="rdv-head-right">
          <div class="shaded rdv-order-bar">
            <span>ORDEM DE COLETA</span>
            <span>Nº : ${escapeHtml(d.seqFormatted)} / ${d.year}</span>
            <span>${viaLabel}</span>
          </div>
          <div class="rdv-client-body">
            <div><strong>Cliente:</strong> ${escapeHtml(d.clienteNome)}</div>
            <div class="flex-between">
              <span><strong>Município:</strong> ${escapeHtml(d.clienteMunicipio)}</span>
              <span><strong>Telefone:</strong> ${escapeHtml(d.clienteTelefone)}</span>
            </div>
            <div class="flex-between">
              <span><strong>CNPJ/CPF:</strong> ${escapeHtml(d.clienteCnpjCpf)}</span>
              <span><strong>IE:</strong> ${escapeHtml(d.clienteIe)}</span>
            </div>
            <div><strong>Protocolo:</strong> ${escapeHtml(d.protocol)}</div>
          </div>
        </div>
      </div>

      <table class="tbl mt2">
        <tr>
          <td style="width:33%;"><strong>Comercial:</strong> ${escapeHtml(d.comercial)}</td>
          <td style="width:22%;"><strong>Orçamento:</strong> ${escapeHtml(d.orcamento)}</td>
          <td style="width:21%;"><strong>Pedido:</strong> ${escapeHtml(d.pedido)}</td>
          <td style="width:24%;"><strong>Solicitada Em:</strong> ${escapeHtml(d.solicitadaData)} ${escapeHtml(d.solicitadaHora)}</td>
        </tr>
      </table>

      <table class="tbl mt2">
        <tr class="shaded">
          <th style="width:50%;text-align:center;">LOCAL COLETA</th>
          <th style="width:50%;text-align:center;">LOCAL ENTREGA</th>
        </tr>
        <tr>
          <td style="vertical-align:top;">
            <div><strong>Remetente:</strong> ${escapeHtml(d.remetenteNome)}</div>
            <div><strong>Endereço:</strong> ${escapeHtml(d.remetenteEndereco)}</div>
            <div class="flex-between"><span><strong>Bairro:</strong> ${escapeHtml(d.remetenteBairro)}</span><span><strong>Telefone:</strong> ${escapeHtml(d.remetenteTelefone)}</span></div>
            <div class="flex-between"><span><strong>Município:</strong> ${escapeHtml(d.remetenteMunicipio)}</span><span><strong>CEP:</strong> ${escapeHtml(d.remetenteCep)}</span></div>
            <div class="flex-between"><span><strong>CNPJ/CPF:</strong> ${escapeHtml(d.remetenteCnpjCpf)}</span><span><strong>IE:</strong> ${escapeHtml(d.remetenteIe)}</span></div>
          </td>
          <td style="vertical-align:top;">
            <div><strong>Destinatário:</strong> ${escapeHtml(d.destinatarioNome)}</div>
            <div><strong>Endereço:</strong> ${escapeHtml(d.destinatarioEndereco)}</div>
            <div class="flex-between"><span><strong>Bairro:</strong> ${escapeHtml(d.destinatarioBairro)}</span><span><strong>Telefone:</strong> ${escapeHtml(d.destinatarioTelefone)}</span></div>
            <div class="flex-between"><span><strong>Município:</strong> ${escapeHtml(d.destinatarioMunicipio)}</span><span><strong>CEP:</strong> ${escapeHtml(d.destinatarioCep)}</span></div>
            <div class="flex-between"><span><strong>CNPJ/CPF:</strong> ${escapeHtml(d.destinatarioCnpjCpf)}</span><span><strong>IE:</strong> ${escapeHtml(d.destinatarioIe)}</span></div>
          </td>
        </tr>
        <tr>
          <td colspan="2"><strong>Ponto Ref.:</strong> ${escapeHtml(d.pontoReferencia)}</td>
        </tr>
      </table>

      <table class="tbl mt2">
        <tr class="shaded"><th colspan="5" style="text-align:center;">DESCRIÇÃO DA CARGA A SER COLETADA</th></tr>
        <tr style="text-align:center;font-weight:700;">
          <td style="width:33%;">Produto</td>
          <td style="width:22%;">Espécie</td>
          <td style="width:17%;">Valor</td>
          <td style="width:12%;">Volumes</td>
          <td style="width:16%;">Peso Bruto</td>
        </tr>
        <tr style="text-align:center;">
          <td>${escapeHtml(d.produto)}</td>
          <td>${escapeHtml(d.especie)}</td>
          <td>${escapeHtml(d.valorMercadoriaFormatted)}</td>
          <td>${escapeHtml(d.volumes)}</td>
          <td>${escapeHtml(d.pesoBrutoFormatted)} kg</td>
        </tr>
      </table>

      <table class="tbl mt2">
        <tr><td style="min-height:24px;"><strong>OBSERVAÇÕES:</strong> ${escapeHtml(d.observacoes)}</td></tr>
      </table>

      <table class="tbl mt2">
        <tr>
          <td style="width:38%;"><strong>Motorista:</strong> ${escapeHtml(d.motoristaNome)}</td>
          <td style="width:22%;"><strong>CPF:</strong> ${escapeHtml(d.motoristaCpf)}</td>
          <td style="width:20%;"><strong>RG:</strong> ${escapeHtml(d.motoristaRg)}</td>
          <td style="width:20%;"><strong>CNH:</strong> ${escapeHtml(d.motoristaCnh)}</td>
        </tr>
        <tr>
          <td><strong>Tipo de veículo:</strong> ${escapeHtml(d.tipoVeiculo)}</td>
          <td><strong>Placa:</strong> ${escapeHtml(d.placaCavalo)}</td>
          <td><strong>Carreta:</strong> ${escapeHtml(d.placaCarreta)}</td>
          <td><strong>Bitrem:</strong> ${escapeHtml(d.placaBitrem)}</td>
        </tr>
      </table>

      <table class="tbl mt2">
        <tr>
          <td style="width:38%;vertical-align:bottom;text-align:center;padding-top:16px;">
            <div style="text-align:left;font-weight:700;margin-bottom:10px;">Assinatura do Motorista:</div>
            <div style="border-top:1px solid #222;padding-top:2px;font-size:8.5px;">${escapeHtml(d.motoristaNome)}</div>
          </td>
          <td style="width:22%;vertical-align:middle;text-align:center;font-weight:700;">
            Data: ___/___/_____
          </td>
          <td style="width:40%;vertical-align:top;">
            <div><strong>Responsável pela Operação:</strong> ${escapeHtml(d.usuarioResponsavel)}</div>
            <div style="margin-top:14px;display:flex;align-items:flex-end;gap:6px;">
              <strong>Ass. do Recebedor:</strong>
              <span style="flex:1;border-bottom:1px solid #222;display:inline-block;height:1px;"></span>
            </div>
          </td>
        </tr>
      </table>
    </div>
  `;
}

export function buildCollectionOrderPrintHtml(
  freight: UnifiedFreightRecord,
  issuedByName?: string
): string {
  const data = buildCollectionOrderViewModel(freight, issuedByName);
  const originUrl = typeof window !== 'undefined' ? window.location.origin : '';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Ordem de Coleta ${escapeHtml(data.fullCode)} — ${escapeHtml(data.brand)}</title>
  <style>
    @page { size: A4 portrait; margin: 7mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; background: #fff; font-size: 9px; line-height: 1.28; }
    .page { width: 100%; max-width: 196mm; margin: 0 auto; }
    .via-block { border: 1px solid #334155; padding: 4px; }
    .cut-line { border-top: 1px dashed #94a3b8; margin: 5mm 0; }
    .tbl { width: 100%; border-collapse: collapse; }
    .tbl td, .tbl th { border: 1px solid #334155; padding: 2.5px 4px; font-size: 8.8px; }
    .shaded { background: #f1f5f9 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .mt2 { margin-top: 3px; }
    .title-lg { font-size: 11px; font-weight: 900; }
    .title-sm { font-size: 9.5px; font-weight: 900; }
    .rdv-head { display: flex; gap: 4px; }
    .rdv-head-left { width: 51%; border: 1px solid #334155; padding: 4px 6px; font-size: 8.5px; }
    .rdv-head-right { width: 49%; border: 1px solid #334155; display: flex; flex-direction: column; }
    .rdv-order-bar { display: flex; justify-content: space-between; font-weight: 900; font-size: 9.5px; padding: 3px 5px; border-bottom: 1px solid #334155; }
    .rdv-client-body { padding: 3px 5px; font-size: 8.5px; display: flex; flex-direction: column; gap: 2px; }
    .flex-between { display: flex; justify-content: space-between; gap: 8px; }
    .vl-footer { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 10px; padding: 2px 4px; font-size: 9px; }
    .sig-line { width: 42%; border-top: 1px solid #1e293b; text-align: center; padding-top: 2px; font-weight: 700; }
  </style>
</head>
<body>
  <div class="page">
    ${buildViaHtml(data, '1ª-VIA', originUrl)}
    <div class="cut-line"></div>
    ${buildViaHtml(data, '2ª-VIA', originUrl)}
  </div>
</body>
</html>`;
}

export function printCollectionOrderViaIframe(
  freight: UnifiedFreightRecord,
  issuedByName?: string
): void {
  const html = buildCollectionOrderPrintHtml(freight, issuedByName);
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.setAttribute('aria-hidden', 'true');
  document.body.appendChild(iframe);

  const cleanup = () => {
    setTimeout(() => {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    }, 1500);
  };

  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch {
      window.print();
    } finally {
      cleanup();
    }
  };
  iframe.srcdoc = html;
}

const ViaSheetPreview: React.FC<{ data: CollectionOrderDocumentData; viaLabel: '1ª-VIA' | '2ª-VIA' }> = ({
  data,
  viaLabel,
}) => {
  if (data.brand === 'VL TRANSPORTES') {
    return (
      <div className="bg-white border border-slate-700 p-2.5 text-[11px] text-slate-900 space-y-1.5">
        <div className="grid grid-cols-12 border border-slate-700">
          <div className="col-span-3 border-r border-slate-700 p-2 flex items-center justify-center bg-white">
            <img
              src={data.company.logoPath}
              alt="VL Transportes"
              className="max-h-12 w-auto object-contain"
            />
          </div>
          <div className="col-span-6 border-r border-slate-700 p-2 text-center flex flex-col justify-center">
            <p className="font-black text-xs">{data.company.legalName}</p>
            <p className="text-[10px]">
              CNPJ: {data.company.cnpj} &nbsp;&nbsp; Fone: {data.company.phone}
            </p>
            <p className="text-[10px]">{data.company.address}</p>
          </div>
          <div className="col-span-3 p-2 text-[10px] space-y-0.5 flex flex-col justify-center">
            <p>
              <strong>Modelo:</strong> Personalizado
            </p>
            <p>
              <strong>Data/Hora:</strong> {data.dataHoraEmissao}
            </p>
            <p className="truncate">
              <strong>Usuário:</strong> {data.usuarioResponsavel}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-12 border border-slate-700 bg-slate-100 px-2 py-1 font-bold text-[11px] items-center">
          <span className="col-span-3">Solicitada Em: {data.solicitadaData}</span>
          <span className="col-span-2">às: {data.solicitadaHora}</span>
          <span className="col-span-4 text-center font-black">ORDEM DE COLETA</span>
          <span className="col-span-2 text-center font-black">
            Nº: {data.seqFormatted} / {data.year}
          </span>
          <span className="col-span-1 text-right font-black">{viaLabel}</span>
        </div>

        <div className="grid grid-cols-12 border border-slate-700 text-[10px]">
          <div className="col-span-5 border-r border-slate-700 px-2 py-1">
            <strong>Comercial:</strong> {data.comercial}
          </div>
          <div className="col-span-3 border-r border-slate-700 px-2 py-1">
            <strong>Pedido Nº:</strong> {data.pedido}
          </div>
          <div className="col-span-4 px-2 py-1">
            <strong>Orçamento Nº:</strong> {data.orcamento}
          </div>
        </div>

        <div className="border border-slate-700 divide-y divide-slate-700 text-[10px]">
          <div className="px-2 py-1">
            <strong>Cliente:</strong> {data.clienteNome} ({data.protocol})
          </div>
          <div className="grid grid-cols-12">
            <div className="col-span-8 border-r border-slate-700 px-2 py-1">
              <strong>Remetente:</strong> {data.remetenteNome}
            </div>
            <div className="col-span-4 px-2 py-1">
              <strong>Fone:</strong> {data.remetenteTelefone}
            </div>
          </div>
          <div className="px-2 py-1">
            <strong>Local da coleta:</strong> {data.remetenteEndereco} — {data.remetenteMunicipio}
          </div>
          <div className="px-2 py-1">
            <strong>Ponto Ref.:</strong> {data.pontoReferencia}
          </div>
          <div className="grid grid-cols-12">
            <div className="col-span-8 border-r border-slate-700 px-2 py-1">
              <strong>Destinatário:</strong> {data.destinatarioNome}
            </div>
            <div className="col-span-4 px-2 py-1">
              <strong>Fone:</strong> {data.destinatarioTelefone}
            </div>
          </div>
          <div className="px-2 py-1">
            <strong>Local entrega:</strong> {data.destinatarioEndereco} — {data.destinatarioMunicipio}
          </div>
        </div>

        <div className="border border-slate-700 divide-y divide-slate-700 text-[10px]">
          <div className="bg-slate-100 text-center font-black py-1 text-[11px]">
            Dados do carregamento
          </div>
          <div className="px-2 py-1">
            <strong>Dados da carga:</strong> Peso Solicitado: {data.pesoBrutoFormatted} kg - Volume Solicitado:{' '}
            {data.volumes} - Valor Mercadoria: {data.valorMercadoriaFormatted} - QTD entregas: {data.qtdEntregas}
          </div>
          <div className="px-2 py-1">
            <strong>Conteúdo:</strong> {data.produto} - Embalagem: {data.embalagem}
          </div>
          <div className="px-2 py-1">
            <strong>Veículo(s):</strong> {data.tipoVeiculo} | Placa veículo: {data.placaCavalo} - Placa carreta:{' '}
            {data.placaCarreta} - Placa bitrem: {data.placaBitrem}
          </div>
          <div className="px-2 py-1">
            <strong>Motorista:</strong> {data.motoristaNome} - CPF: {data.motoristaCpf} - RG: {data.motoristaRg}
          </div>
          <div className="px-2 py-1.5">
            <strong>Observações:</strong> {data.observacoes}
          </div>
        </div>

        <div className="flex items-end justify-between pt-4 px-1 text-[10px]">
          <div>
            {viaLabel === '1ª-VIA' ? (
              <span>{data.cidadeExtensoFooter}</span>
            ) : (
              <span className="font-bold">
                Chegada: ___/___/_____ às ___:___ &nbsp;&nbsp; Saída: ___/___/_____ às ___:___
              </span>
            )}
          </div>
          <div className="w-56 border-t border-slate-800 text-center pt-1 font-bold">
            {data.company.legalName}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-700 p-2.5 text-[11px] text-slate-900 space-y-1.5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
        <div className="border border-slate-700 p-2 space-y-0.5">
          <img
            src={data.company.logoPath}
            alt="RODOVAR"
            className="h-9 w-auto object-contain mb-1"
          />
          <p className="font-black text-[11px]">{data.company.legalName}</p>
          <p className="text-[10px]">
            CNPJ: {data.company.cnpj} &nbsp;&nbsp; IE: {data.company.ie}
          </p>
          <p className="text-[10px]">{data.company.address}</p>
        </div>
        <div className="border border-slate-700 flex flex-col">
          <div className="bg-slate-100 border-b border-slate-700 px-2 py-1 flex items-center justify-between font-black text-[11px]">
            <span>ORDEM DE COLETA</span>
            <span>
              Nº: {data.seqFormatted} / {data.year}
            </span>
            <span>{viaLabel}</span>
          </div>
          <div className="p-2 text-[10px] space-y-0.5">
            <p>
              <strong>Cliente:</strong> {data.clienteNome}
            </p>
            <div className="flex justify-between gap-2">
              <span>
                <strong>Município:</strong> {data.clienteMunicipio}
              </span>
              <span>
                <strong>Telefone:</strong> {data.clienteTelefone}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span>
                <strong>CNPJ/CPF:</strong> {data.clienteCnpjCpf}
              </span>
              <span>
                <strong>IE:</strong> {data.clienteIe}
              </span>
            </div>
            <p>
              <strong>Protocolo:</strong> {data.protocol}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 border border-slate-700 divide-x divide-slate-700 text-[10px]">
        <div className="px-2 py-1">
          <strong>Comercial:</strong> {data.comercial}
        </div>
        <div className="px-2 py-1">
          <strong>Orçamento:</strong> {data.orcamento}
        </div>
        <div className="px-2 py-1">
          <strong>Pedido:</strong> {data.pedido}
        </div>
        <div className="px-2 py-1">
          <strong>Solicitada Em:</strong> {data.solicitadaData} {data.solicitadaHora}
        </div>
      </div>

      <div className="border border-slate-700">
        <div className="grid grid-cols-2 bg-slate-100 border-b border-slate-700 font-black text-[10px] text-center divide-x divide-slate-700">
          <div className="py-1">LOCAL COLETA</div>
          <div className="py-1">LOCAL ENTREGA</div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-slate-700 text-[10px]">
          <div className="p-2 space-y-0.5">
            <p>
              <strong>Remetente:</strong> {data.remetenteNome}
            </p>
            <p>
              <strong>Endereço:</strong> {data.remetenteEndereco}
            </p>
            <p className="flex justify-between gap-2">
              <span>
                <strong>Bairro:</strong> {data.remetenteBairro}
              </span>
              <span>
                <strong>Telefone:</strong> {data.remetenteTelefone}
              </span>
            </p>
            <p className="flex justify-between gap-2">
              <span>
                <strong>Município:</strong> {data.remetenteMunicipio}
              </span>
              <span>
                <strong>CEP:</strong> {data.remetenteCep}
              </span>
            </p>
            <p className="flex justify-between gap-2">
              <span>
                <strong>CNPJ/CPF:</strong> {data.remetenteCnpjCpf}
              </span>
              <span>
                <strong>IE:</strong> {data.remetenteIe}
              </span>
            </p>
          </div>
          <div className="p-2 space-y-0.5">
            <p>
              <strong>Destinatário:</strong> {data.destinatarioNome}
            </p>
            <p>
              <strong>Endereço:</strong> {data.destinatarioEndereco}
            </p>
            <p className="flex justify-between gap-2">
              <span>
                <strong>Bairro:</strong> {data.destinatarioBairro}
              </span>
              <span>
                <strong>Telefone:</strong> {data.destinatarioTelefone}
              </span>
            </p>
            <p className="flex justify-between gap-2">
              <span>
                <strong>Município:</strong> {data.destinatarioMunicipio}
              </span>
              <span>
                <strong>CEP:</strong> {data.destinatarioCep}
              </span>
            </p>
            <p className="flex justify-between gap-2">
              <span>
                <strong>CNPJ/CPF:</strong> {data.destinatarioCnpjCpf}
              </span>
              <span>
                <strong>IE:</strong> {data.destinatarioIe}
              </span>
            </p>
          </div>
        </div>
        <div className="border-t border-slate-700 px-2 py-1 text-[10px]">
          <strong>Ponto Ref.:</strong> {data.pontoReferencia}
        </div>
      </div>

      <div className="border border-slate-700 text-[10px]">
        <div className="bg-slate-100 border-b border-slate-700 text-center font-black py-1">
          DESCRIÇÃO DA CARGA A SER COLETADA
        </div>
        <div className="grid grid-cols-5 divide-x divide-slate-700 text-center font-bold border-b border-slate-700">
          <div className="py-1">Produto</div>
          <div className="py-1">Espécie</div>
          <div className="py-1">Valor</div>
          <div className="py-1">Volumes</div>
          <div className="py-1">Peso Bruto</div>
        </div>
        <div className="grid grid-cols-5 divide-x divide-slate-700 text-center">
          <div className="py-1.5 px-1">{data.produto}</div>
          <div className="py-1.5 px-1">{data.especie}</div>
          <div className="py-1.5 px-1">{data.valorMercadoriaFormatted}</div>
          <div className="py-1.5 px-1">{data.volumes}</div>
          <div className="py-1.5 px-1">{data.pesoBrutoFormatted} kg</div>
        </div>
      </div>

      <div className="border border-slate-700 px-2 py-1.5 text-[10px]">
        <strong>OBSERVAÇÕES:</strong> {data.observacoes}
      </div>

      <div className="border border-slate-700 divide-y divide-slate-700 text-[10px]">
        <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-slate-700">
          <div className="px-2 py-1">
            <strong>Motorista:</strong> {data.motoristaNome}
          </div>
          <div className="px-2 py-1">
            <strong>CPF:</strong> {data.motoristaCpf}
          </div>
          <div className="px-2 py-1">
            <strong>RG:</strong> {data.motoristaRg}
          </div>
          <div className="px-2 py-1">
            <strong>CNH:</strong> {data.motoristaCnh}
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-slate-700">
          <div className="px-2 py-1">
            <strong>Tipo de veículo:</strong> {data.tipoVeiculo}
          </div>
          <div className="px-2 py-1">
            <strong>Placa:</strong> {data.placaCavalo}
          </div>
          <div className="px-2 py-1">
            <strong>Carreta:</strong> {data.placaCarreta}
          </div>
          <div className="px-2 py-1">
            <strong>Bitrem:</strong> {data.placaBitrem}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 border border-slate-700 divide-y sm:divide-y-0 sm:divide-x divide-slate-700 text-[10px]">
        <div className="p-2 flex flex-col justify-between">
          <strong>Assinatura do Motorista:</strong>
          <div className="mt-5 border-t border-slate-700 text-center pt-0.5">{data.motoristaNome}</div>
        </div>
        <div className="p-2 flex items-center justify-center font-bold">Data: ___/___/_____</div>
        <div className="p-2 flex flex-col justify-between">
          <p>
            <strong>Responsável pela Operação:</strong> {data.usuarioResponsavel}
          </p>
          <p className="mt-4 flex items-end gap-2">
            <strong>Ass. do Recebedor:</strong>
            <span className="flex-1 border-b border-slate-700 inline-block" />
          </p>
        </div>
      </div>
    </div>
  );
};

interface OrdemColetaModalProps {
  freight: UnifiedFreightRecord | null;
  issuedByName?: string;
  onClose: () => void;
  onShare?: (freight: UnifiedFreightRecord) => void;
  canConfirmDriverSend?: boolean;
  actionBusy?: boolean;
  onConfirmDriverSend?: () => void;
}

export const OrdemColetaModal: React.FC<OrdemColetaModalProps> = ({
  freight,
  issuedByName,
  onClose,
  onShare,
  canConfirmDriverSend,
  actionBusy,
  onConfirmDriverSend,
}) => {
  const [pdfBusy, setPdfBusy] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const validationIssues = useMemo(() => {
    if (!freight) return [];
    if (freight.ordemColetaPendente && !freight.ordemCarregamentoNumero) {
      return ['Ordem de coleta marcada como pendente ("Ignorar por enquanto"). Gere a ordem oficial para emitir PDF.'];
    }
    return validateFreightForCollectionOrder(freight);
  }, [freight]);

  const docData = useMemo(() => {
    if (!freight || validationIssues.length > 0) return null;
    try {
      return buildCollectionOrderViewModel(freight, issuedByName);
    } catch {
      return null;
    }
  }, [freight, issuedByName, validationIssues]);

  if (!freight) return null;

  const handleDownloadPdf = async () => {
    setModalError(null);
    setPdfBusy(true);
    try {
      await generateCollectionOrderPdfA4(freight, issuedByName);
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Não foi possível gerar o PDF da Ordem de Coleta.');
    } finally {
      setPdfBusy(false);
    }
  };

  const handlePrint = () => {
    setModalError(null);
    try {
      printCollectionOrderViaIframe(freight, issuedByName);
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Não foi possível abrir a impressão.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-2xl max-w-4xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[93vh]">
        <div className="px-5 py-3.5 bg-[#080B0D] text-white flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="w-4 h-4 text-[#FFD400] shrink-0" />
            <span className="text-xs font-extrabold uppercase tracking-wider text-[#FFD400] truncate">
              Ordem de Coleta Oficial {freight.empresaMarca === 'VL TRANSPORTES' ? 'VL TRANSPORTES' : 'RODOVAR'} — {freight.protocol}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {docData && (
              <>
                <button
                  type="button"
                  disabled={pdfBusy}
                  onClick={() => void handleDownloadPdf()}
                  className="inline-flex items-center gap-1.5 bg-[#FFD400] hover:bg-[#ffdf33] text-[#080B0D] text-xs font-extrabold px-3 py-1.5 rounded-lg cursor-pointer disabled:opacity-60"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{pdfBusy ? 'Gerando PDF...' : 'Baixar PDF (2 vias A4)'}</span>
                </button>
                <button
                  type="button"
                  onClick={handlePrint}
                  className="inline-flex items-center gap-1.5 bg-white/15 hover:bg-white/25 text-white text-xs font-bold px-3 py-1.5 rounded-lg cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Imprimir</span>
                </button>
              </>
            )}
            {onShare && docData && (
              <button
                type="button"
                onClick={() => onShare(freight)}
                className="inline-flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white text-xs font-bold px-3 py-1.5 rounded-lg cursor-pointer"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>Compartilhar</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1 text-gray-300 hover:text-white cursor-pointer"
              aria-label="Fechar visualização"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 bg-slate-100 flex-1">
          {modalError && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-bold text-red-800">
              {modalError}
            </div>
          )}

          {!docData ? (
            <div className="bg-white rounded-xl border border-amber-300 p-5 space-y-2 text-xs text-slate-800">
              <p className="font-black text-sm text-amber-900">
                Ordem de Coleta indisponível para impressão/PDF
              </p>
              <ul className="list-disc pl-5 space-y-1 text-amber-900">
                {validationIssues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-600 px-1">
                <span>
                  Modelo selecionado automaticamente: <strong>{docData.brand}</strong> • Nº{' '}
                  <strong>
                    {docData.seqFormatted}/{docData.year}
                  </strong>
                </span>
                <span>Formato A4 Retrato (1ª Via + 2ª Via na mesma folha)</span>
              </div>

              <ViaSheetPreview data={docData} viaLabel="1ª-VIA" />
              <div className="border-t-2 border-dashed border-slate-400 relative">
                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-slate-100 px-2 text-[10px] font-bold text-slate-500 uppercase">
                  Linha de destaque — 2 vias na mesma folha A4
                </span>
              </div>
              <ViaSheetPreview data={docData} viaLabel="2ª-VIA" />
            </div>
          )}
        </div>

        {docData && canConfirmDriverSend && (
          <div className="px-5 py-3 bg-emerald-50 border-t border-emerald-200 flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-emerald-950">
              <p className="font-extrabold">
                Envio da Ordem de Coleta ao Motorista ({freight.motoristaNome || '—'})
              </p>
              <p className="text-[11px]">
                {freight.checklistFechamento?.ordemColetaEnviadaMotorista
                  ? `Confirmado por ${freight.checklistFechamento.ordemColetaEnviadaPorNome} em ${
                      freight.checklistFechamento.ordemColetaEnviadaEmFormatado ||
                      freight.checklistFechamento.ordemColetaEnviadaEm ||
                      ''
                    }`
                  : 'Após enviar o PDF ao motorista, confirme o envio para concluir a 5ª verificação.'}
              </p>
            </div>
            {!freight.checklistFechamento?.ordemColetaEnviadaMotorista && onConfirmDriverSend && (
              <button
                type="button"
                disabled={actionBusy}
                onClick={onConfirmDriverSend}
                className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold px-3.5 py-2 rounded-xl text-xs cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Confirmar envio ao motorista</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
