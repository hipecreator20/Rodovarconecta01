import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, ClipboardPaste, FileUp, Sparkles, X } from 'lucide-react';
import { parseOperationalTrafficScript, ParsedTrafficScript } from '../lib/carrierLogos';

interface ImportFreightScriptModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  onFillForm?: (parsed: Partial<ParsedTrafficScript>) => void;
  onImportDirect?: (parsed: Partial<ParsedTrafficScript>) => Promise<void>;
  fillFormLabel?: string;
  importDirectLabel?: string;
}

const formatBrlPreview = (value?: number): string => {
  if (!value || value <= 0) return '';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

export const ImportFreightScriptModal: React.FC<ImportFreightScriptModalProps> = ({
  isOpen,
  onClose,
  title = 'Importar Frete por Script (WhatsApp)',
  subtitle = 'Cole o script abaixo. Todos os campos encontrados serão importados e os ausentes ficarão em branco.',
  onFillForm,
  onImportDirect,
  fillFormLabel = 'Preencher formulário',
  importDirectLabel = 'Importar frete para a página',
}) => {
  const [scriptText, setScriptText] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg(null);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose, submitting]);

  const parsed = useMemo(() => parseOperationalTrafficScript(scriptText), [scriptText]);

  const previewFields = useMemo(
    () => [
      { label: 'Data Carregamento', value: parsed.dataCarregamento || '' },
      { label: 'Unidade', value: parsed.unidadeOperacional || '' },
      { label: 'Comercial', value: parsed.comercialResponsavel || '' },
      { label: 'Cliente', value: parsed.cliente || '' },
      { label: 'Tel. Cliente', value: parsed.telefoneCliente || '' },
      { label: 'Origem', value: parsed.origem || '' },
      { label: 'Destino', value: parsed.destino || '' },
      { label: 'Frete Empresa', value: formatBrlPreview(parsed.valorFreteEmpresa) },
      { label: 'Frete Motorista', value: formatBrlPreview(parsed.valorFreteMotorista) },
      { label: 'Motorista', value: parsed.motoristaNome || '' },
      { label: 'Tel. Motorista', value: parsed.motoristaTelefone || '' },
      { label: 'Contato Emergência', value: parsed.emergenciaNome || '' },
      { label: 'Tel. Emergência', value: parsed.emergenciaTelefone || '' },
      { label: 'Favorecido', value: parsed.favorecido || '' },
      {
        label: 'Chave PIX',
        value: parsed.chavePix ? `${parsed.chavePix}${parsed.tipoChavePix ? ` (${parsed.tipoChavePix})` : ''}` : '',
      },
      { label: 'Banco', value: parsed.banco || '' },
      { label: 'Obs. / Pagamento', value: parsed.observacoes || parsed.condicoesPagamento || '' },
    ],
    [parsed]
  );

  const filledCount = useMemo(
    () => previewFields.filter((item) => Boolean(item.value && item.value.trim())).length,
    [previewFields]
  );

  if (!isOpen) return null;

  const handlePasteFromClipboard = async () => {
    setErrorMsg(null);
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text && text.trim()) {
          setScriptText(text);
          return;
        }
      }
      setErrorMsg('Cole o script diretamente no campo abaixo com Ctrl+V.');
    } catch {
      setErrorMsg('Permissão de leitura automática indisponível. Cole com Ctrl+V no campo abaixo.');
    }
  };

  const handleFillForm = () => {
    setErrorMsg(null);
    if (!scriptText.trim() || filledCount === 0) {
      setErrorMsg('Cole um script válido antes de importar.');
      return;
    }
    onFillForm?.(parsed);
    setScriptText('');
    onClose();
  };

  const handleDirectImport = async () => {
    setErrorMsg(null);
    if (!scriptText.trim() || filledCount === 0) {
      setErrorMsg('Cole um script válido antes de importar.');
      return;
    }
    if (!parsed.cliente || !parsed.origem || !parsed.destino) {
      setErrorMsg(
        'Para criar o frete diretamente, o script precisa conter pelo menos CLIENTE, ORIGEM e DESTINO (ou clique em "Preencher formulário" para completar).'
      );
      return;
    }
    if (!onImportDirect) return;
    setSubmitting(true);
    try {
      await onImportDirect(parsed);
      setScriptText('');
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao importar frete.');
    } finally {
      setSubmitting(false);
    }
  };

  const modalNode = (
    <div
      className="fixed inset-0 z-[90] bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-hidden"
      onClick={() => !submitting && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[86dvh] min-h-0 border border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 bg-[#080B0D] text-white flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="w-4 h-4 text-[#FFD400] shrink-0" />
            <div className="min-w-0">
              <h2 className="text-xs sm:text-sm font-extrabold text-[#FFD400] uppercase tracking-wide truncate">
                {title}
              </h2>
              <p className="text-[11px] text-slate-300 truncate">{subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            className="inline-flex items-center gap-1 bg-white/15 hover:bg-white/25 text-white text-xs font-bold px-2.5 py-1 rounded-lg cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
            <span>Fechar</span>
          </button>
        </div>

        <div className="p-4 overflow-y-auto flex-1 min-h-0 space-y-3 bg-slate-50 text-xs">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-900 font-bold flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-[#E5252A] shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="font-extrabold text-slate-800">
                Cole o script completo do frete (com ou sem emojis)
              </label>
              <button
                type="button"
                onClick={() => void handlePasteFromClipboard()}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-[11px] cursor-pointer"
              >
                <ClipboardPaste className="w-3.5 h-3.5" />
                <span>Colar da área de transferência</span>
              </button>
            </div>
            <textarea
              rows={7}
              value={scriptText}
              onChange={(e) => {
                setScriptText(e.target.value);
                if (errorMsg) setErrorMsg(null);
              }}
              placeholder={`Ex:\n🗓️ DATA CARREGAMENTO: 13/11/2026\n💼 COMERCIAL: MARIVAL/CÉSAR\n🏭 UNIDADE: BA\n🏢 CLIENTE: NOME DO CLIENTE\n📞 TEL CLIENTE:\n🚚 MOTORISTA: NOME DO MOTORISTA\n📞 TEL MOTORISTA: 71-99999-9999\n📍 ORIGEM: CAMAÇARI-BA\n🏁 DESTINO: SÃO FRANCISCO DO CONDE-BA\n💵 FRETE EMP: R$ 1.518,00\n💸 FRETE MOT: R$ 900,00\n👤 FAVORECIDO: ...\n🔑 CHAVE PIX: ...\n🏛️ BANCO: ...\n📝 Obs.: PAGAMENTO INTEGRAL DO FRETE`}
              className="w-full rounded-xl border border-slate-300 bg-white p-2.5 text-xs font-mono text-slate-900 focus:outline-none focus:border-[#FFD400]"
            />
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-extrabold text-slate-800 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                Prévia da importação ({filledCount} campo(s) identificado(s))
              </span>
              <span className="text-[11px] text-slate-500">
                Campos não informados permanecem em branco
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-48 overflow-y-auto pr-1">
              {previewFields.map((item) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200/80"
                >
                  <span className="text-[11px] font-bold text-slate-600 shrink-0">{item.label}:</span>
                  {item.value ? (
                    <span className="text-[11px] font-extrabold text-slate-900 truncate text-right">
                      {item.value}
                    </span>
                  ) : (
                    <span className="text-[11px] italic text-slate-400">Em branco</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="px-4 py-3 bg-white border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            className="px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-100 cursor-pointer"
          >
            Cancelar
          </button>
          <div className="flex flex-wrap items-center gap-2">
            {onFillForm && (
              <button
                type="button"
                disabled={submitting || filledCount === 0}
                onClick={handleFillForm}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-900 bg-white hover:bg-slate-100 text-slate-900 font-extrabold text-xs cursor-pointer disabled:opacity-50"
              >
                <ClipboardPaste className="w-3.5 h-3.5" />
                <span>{fillFormLabel}</span>
              </button>
            )}
            {onImportDirect && (
              <button
                type="button"
                disabled={submitting || filledCount === 0}
                onClick={() => void handleDirectImport()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#FFD400] hover:bg-[#ffdf33] text-[#080B0D] font-black text-xs shadow-xs cursor-pointer disabled:opacity-50"
              >
                <FileUp className="w-3.5 h-3.5" />
                <span>{submitting ? 'Importando...' : importDirectLabel}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(modalNode, document.body);
  }
  return modalNode;
};
