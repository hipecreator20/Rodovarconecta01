import {expeditionPaymentMode,effectiveExpeditionChecklist,expeditionChecklistCount,expeditionVerificationIssue} from '../lib/expeditionValidation';
import {DriverLookupButton} from './DriverCenter';
import {useGlobalLoading} from './GlobalLoading';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Download,
  FileText,
  LayoutGrid,
  List,
  Printer,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Send,
  Share2,
  ShieldCheck,
  Truck,
  Upload,
  User,
  Video,
  X,
  ClipboardPaste,
} from 'lucide-react';
import {
  Employee,
  FreightAttachmentCategory,
  OperationalFreightStatus,
  UnifiedFreightAttachment,
  UnifiedFreightHistoryEntry,
  UnifiedFreightOccurrence,
  UnifiedFreightRecord,
} from '../types';
import {
  apiClaimFreightFromQueue,
  apiDownloadFreightAttachment,
  apiExpedicaoAction,
  apiFetchFreightDetails,
  apiFetchFreightOperators,
  apiFetchFreightsList,
  apiReactivateFreight,
  apiRegisterFreightOccurrence,
  apiResolveFreightOccurrence,
  apiTransferFreightResponsibility,
  apiUpdateOperationalData,
  apiUploadFreightAttachment,
  apiVerifyFreightAttachment,
  formatCentavosToBrl,
  FreightOperatorOption,
  parseBrlInputToCentavos,
} from '../lib/serverApi';
import {
  canAccessComercialFreights,
  canTransferFreightResponsibility,
  canViewFreightTeam,
} from '../lib/permissions';
import {
  formatSituacaoMonitoramentoLabel,
  formatSituacaoOperacionalLabel,
} from './MeusFretesComercialView';
import { FreightDocumentsManager } from './FreightDocumentsManager';
import { CorporateModal } from './ui/CorporateModal';
import { OrdemColetaModal, printCollectionOrderViaIframe } from './OrdemColetaDocument';
import { ImportFreightScriptModal } from './ImportFreightScriptModal';
import { ParsedTrafficScript } from '../lib/carrierLogos';
import {
  COMPANY_LEGAL_PROFILES,
  extractOrderDisplayNumber,
} from '../lib/freightOrderPdfGenerator';

interface MeusFretesExpedicaoViewProps {
  currentUser: Employee;
  selectedFreightIdFromNotification?: string | null;
  onClearSelectedNotificationFreight?: () => void;
  onSwitchToComercial?: () => void;
}

const EXPEDICAO_BOARD_COLUMNS: {
  id: OperationalFreightStatus;
  title: string;
  subtitle: string;
  headerBg: string;
  badgeBg: string;
}[] = [
  {
    id: 'RECEBIDO',
    title: 'Recebidos',
    subtitle: 'Encaminhados pelo Comercial',
    headerBg: 'bg-amber-50 border-amber-200',
    badgeBg: 'bg-amber-100 text-amber-900',
  },
  {
    id: 'EM_PREPARACAO',
    title: 'Em preparação',
    subtitle: 'Dados, videochamada e ordem',
    headerBg: 'bg-blue-50 border-blue-200',
    badgeBg: 'bg-blue-100 text-blue-900',
  },
  {
    id: 'LIBERADO_MONITORAMENTO',
    title: 'Liberados ao Monitoramento',
    subtitle: 'Em acompanhamento pelo Operador',
    headerBg: 'bg-emerald-50 border-emerald-200',
    badgeBg: 'bg-emerald-100 text-emerald-900',
  },
];

function formatIsoDateBr(iso?: string): string {
  if (!iso) return '—';
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return iso;
  return dt.toLocaleDateString('pt-BR');
}

function getOperationalBadgeStyle(status: OperationalFreightStatus): string {
  switch (status) {
    case 'DISPONIVEL_FILA':
      return 'bg-purple-100 text-purple-900 border-purple-200';
    case 'RECEBIDO':
      return 'bg-amber-100 text-amber-900 border-amber-200';
    case 'EM_PREPARACAO':
    case 'AGUARDANDO_FECHAMENTO':
      return 'bg-blue-100 text-blue-900 border-blue-200';
    case 'LIBERADO_MONITORAMENTO':
    case 'FECHADO':
    case 'AGUARDANDO_COLETA':
    case 'EM_TRANSPORTE':
    case 'CONCLUIDO':
      return 'bg-emerald-100 text-emerald-900 border-emerald-200';
    case 'DEVOLVIDO_CORRECAO':
      return 'bg-red-100 text-red-900 border-red-200';
    case 'CANCELADO':
      return 'bg-gray-200 text-gray-700 border-gray-300';
    default:
      return 'bg-gray-100 text-gray-700 border-gray-200';
  }
}

function getInitials(name: string): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'EX';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function countCompletedVerifications(f:UnifiedFreightRecord):number {return expeditionChecklistCount(f);}

/**
 * Isolated print generator for the official "Ordem de Coleta" (RODOVAR or VL TRANSPORTES, 2 vias A4).
 * Never includes client sale value, margin, or internal commercial/operational notes.
 */
export function printIsolatedOrdemColeta(freight: UnifiedFreightRecord): void {
  if (freight.empresaMarca === 'AXD') return;
  if (freight.ordemColetaPendente && !freight.ordemCarregamentoNumero) return;
  printCollectionOrderViaIframe(freight);
}

export const MeusFretesExpedicaoView: React.FC<MeusFretesExpedicaoViewProps> = ({
  currentUser,
  selectedFreightIdFromNotification,
  onClearSelectedNotificationFreight,
  onSwitchToComercial,
}) => {
  const [freights, setFreights] = useState<UnifiedFreightRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  useGlobalLoading(loading && freights.length === 0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Open in board mode; canceled freights are reviewed in the list.
  const [displayMode, setDisplayMode] = useState<'LISTA' | 'QUADRO'>('QUADRO');
  const previousDisplayModeRef = useRef<'LISTA' | 'QUADRO'>('QUADRO');
  const [includeCanceled, setIncludeCanceled] = useState<boolean>(false);

  // Reactivate Freight State
  const [showReactivateModal, setShowReactivateModal] = useState(false);
  const [targetReactivateFreight, setTargetReactivateFreight] =
    useState<UnifiedFreightRecord | null>(null);
  const [reactivateMotivo, setReactivateMotivo] = useState('');
  const [reactivateBusy, setReactivateBusy] = useState(false);

  const canReactivate = useMemo(() => {
    return (
      currentUser.accessLevel === 'ADMINISTRADOR' ||
      currentUser.accessLevel === 'DIRETORIA' ||
      currentUser.role === 'ADMIN' ||
      currentUser.role === 'DIRETORIA' ||
      currentUser.role === 'GERENCIA_LOGISTICA' ||
      currentUser.role === 'SUPERVISAO_EXPEDICAO'
    );
  }, [currentUser]);

  const handleToggleIncludeCanceled = (checked: boolean) => {
    if (checked) {
      if (!includeCanceled) previousDisplayModeRef.current = displayMode;
      setDisplayMode('LISTA');
      setIncludeCanceled(true);
      setStatusFilter('CANCELADO');
      setSelectedFreight(null);
    } else {
      setIncludeCanceled(false);
      setStatusFilter('TODOS');
      setDisplayMode(previousDisplayModeRef.current);
    }
  };

  const handleConfirmReactivate = async () => {
    if (!targetReactivateFreight) return;
    if (!reactivateMotivo.trim()) {
      setErrorMsg('Informe o motivo corporativo da reativação.');
      return;
    }
    setReactivateBusy(true);
    try {
      const res = await apiReactivateFreight(targetReactivateFreight.id, {
        reason: reactivateMotivo.trim(),
        targetStage: targetReactivateFreight.preCancelOperacional || 'RECEBIDO',
      });
      if (!res.ok || !res.freight) {
        setErrorMsg(res.error || 'Erro ao reativar frete.');
        return;
      }
      const updated = res.freight;
      setFreights((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
      if (selectedFreight?.id === updated.id) {
        setSelectedFreight(updated);
        syncOperationalFormFromRecord(updated);
      }
      setShowReactivateModal(false);
      setTargetReactivateFreight(null);
      setReactivateMotivo('');
      showToast(`Frete ${updated.protocol} reativado com sucesso.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao reativar frete.');
    } finally {
      setReactivateBusy(false);
    }
  };

  // Scope & Filters
  const [viewScope, setViewScope] = useState<'MINE' | 'TEAM' | 'QUEUE'>('MINE');
  const [responsibleFilterId, setResponsibleFilterId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('TODOS');
  const [periodFilter, setPeriodFilter] = useState<'HOJE' | 'SEMANA' | 'MES' | 'TODOS'>('TODOS');

  // Operators list
  const [expedicaoOperators, setExpedicaoOperators] = useState<FreightOperatorOption[]>([]);
  const [monitoramentoOperators, setMonitoramentoOperators] = useState<FreightOperatorOption[]>([]);
  const [canViewTeam, setCanViewTeam] = useState<boolean>(() => canViewFreightTeam(currentUser));

  // Selected Freight & Detail Sub-collections
  const [selectedFreight, setSelectedFreight] = useState<UnifiedFreightRecord | null>(null);
  const [detailAnexos, setDetailAnexos] = useState<UnifiedFreightAttachment[]>([]);
  const [detailOcorrencias, setDetailOcorrencias] = useState<UnifiedFreightOccurrence[]>([]);
  const [detailHistorico, setDetailHistorico] = useState<UnifiedFreightHistoryEntry[]>([]);
  const [activeDetailTab, setActiveDetailTab] = useState<
    'PREPARACAO' | 'VERIFICACOES' | 'OCORRENCIAS' | 'ANEXOS' | 'HISTORICO'
  >('PREPARACAO');

  // Operational Form Fields inside Drawer
  const [opEnderecoColeta, setOpEnderecoColeta] = useState('');
  const [opClienteContato, setOpClienteContato] = useState('');
  const [opInstrucoesColetaEntrega, setOpInstrucoesColetaEntrega] = useState('');
  const [opTipoCarga, setOpTipoCarga] = useState('');
  const [opPesoKg, setOpPesoKg] = useState('');
  const [opVolumes, setOpVolumes] = useState('');
  const [opVeiculoNecessario, setOpVeiculoNecessario] = useState('');
  const [opJanelaColetaInicio, setOpJanelaColetaInicio] = useState('');
  const [opJanelaColetaFim, setOpJanelaColetaFim] = useState('');
  const [opDataEntregaPrevistaIso, setOpDataEntregaPrevistaIso] = useState('');

  const [opMotoristaNome, setOpMotoristaNome] = useState('');
  const [opMotoristaCpf, setOpMotoristaCpf] = useState('');
  const [opMotoristaTelefone, setOpMotoristaTelefone] = useState('');
  const [opTransportadorNome, setOpTransportadorNome] = useState('');
  const [opTransportadorDoc, setOpTransportadorDoc] = useState('');
  const [opPlacaVeiculo, setOpPlacaVeiculo] = useState('');
  const [opPlacaCarreta, setOpPlacaCarreta] = useState('');
  const [opValorContratadoReais, setOpValorContratadoReais] = useState('');
  const [opCondicoesPagamento, setOpCondicoesPagamento] = useState(
    '70% Adiantamento / 30% Saldo na Entrega'
  );
  const [opFavorecidoPagamento, setOpFavorecidoPagamento] = useState('');
  const [opBancoPagamento, setOpBancoPagamento] = useState('');
  const [opTipoChavePix, setOpTipoChavePix] = useState<string>('CPF/CNPJ');
  const [opChavePix, setOpChavePix] = useState('');
  const [opCondicoesOperacionais, setOpCondicoesOperacionais] = useState('');
  const [opObservacoes, setOpObservacoes] = useState('');
  const [opMonitoramentoResponsavelId, setOpMonitoramentoResponsavelId] = useState('');

  // Extended Ordem de Coleta Optional Fields
  const [showComplementosOrdem, setShowComplementosOrdem] = useState(false);
  const [opMotoristaRg, setOpMotoristaRg] = useState('');
  const [opMotoristaCnh, setOpMotoristaCnh] = useState('');
  const [opPlacaBitrem, setOpPlacaBitrem] = useState('');
  const [opNumeroPedido, setOpNumeroPedido] = useState('');
  const [opNumeroOrcamento, setOpNumeroOrcamento] = useState('');
  const [opPontoReferencia, setOpPontoReferencia] = useState('');
  const [opEspecieCarga, setOpEspecieCarga] = useState('');
  const [opEmbalagemCarga, setOpEmbalagemCarga] = useState('');
  const [opValorMercadoriaReais, setOpValorMercadoriaReais] = useState('');
  const [opQuantidadeEntregas, setOpQuantidadeEntregas] = useState('1');
  const [opRemetenteNome, setOpRemetenteNome] = useState('');
  const [opRemetenteCnpjCpf, setOpRemetenteCnpjCpf] = useState('');
  const [opRemetenteIe, setOpRemetenteIe] = useState('');
  const [opRemetenteTelefone, setOpRemetenteTelefone] = useState('');
  const [opRemetenteEndereco, setOpRemetenteEndereco] = useState('');
  const [opRemetenteBairro, setOpRemetenteBairro] = useState('');
  const [opRemetenteMunicipio, setOpRemetenteMunicipio] = useState('');
  const [opRemetenteCep, setOpRemetenteCep] = useState('');
  const [opDestinatarioNome, setOpDestinatarioNome] = useState('');
  const [opDestinatarioCnpjCpf, setOpDestinatarioCnpjCpf] = useState('');
  const [opDestinatarioIe, setOpDestinatarioIe] = useState('');
  const [opDestinatarioTelefone, setOpDestinatarioTelefone] = useState('');
  const [opDestinatarioEndereco, setOpDestinatarioEndereco] = useState('');
  const [opDestinatarioBairro, setOpDestinatarioBairro] = useState('');
  const [opDestinatarioMunicipio, setOpDestinatarioMunicipio] = useState('');
  const [opDestinatarioCep, setOpDestinatarioCep] = useState('');

  // 5 Functional Verifications State
  const [chkMotorista, setChkMotorista] = useState(false);
  const [chkVeiculo, setChkVeiculo] = useState(false);
  const [chkCondicoesEDocs, setChkCondicoesEDocs] = useState(false);
  const [chkVideochamada, setChkVideochamada] = useState(false);
  const [chkVideochamadaObs, setChkVideochamadaObs] = useState('');
  const [chkOrdemEnviada, setChkOrdemEnviada] = useState(false);

  const [savingOp, setSavingOp] = useState(false);
  const verificationLock = useRef(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [validationMissingItems, setValidationMissingItems] = useState<string[]>([]);

  // Return to Comercial Modal
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnObservation, setReturnObservation] = useState('');

  // Printable Order Modal & "Ignorar por enquanto" Modal & Script Import Modal
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [showSkipOrderModal, setShowSkipOrderModal] = useState(false);
  const [skipOrderReason, setSkipOrderReason] = useState('');
  const [isScriptModalOpen, setIsScriptModalOpen] = useState(false);

  // Occurrence creation state
  const [occTitulo, setOccTitulo] = useState('');
  const [occDescricao, setOccDescricao] = useState('');
  const [occSeveridade, setOccSeveridade] = useState<'BAIXA' | 'MEDIA' | 'IMPEDITIVA'>('MEDIA');
  const [occBusy, setOccBusy] = useState(false);

  // Attachment upload state
  const [attCategory, setAttCategory] = useState<FreightAttachmentCategory>('CTE');
  const [attBusy, setAttBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Transfer responsibility state
  const [transferTargetId, setTransferTargetId] = useState('');
  const [transferMotivo, setTransferMotivo] = useState('');
  const [transferBusy, setTransferBusy] = useState(false);

  const hasDualProfile = useMemo(() => canAccessComercialFreights(currentUser), [currentUser]);
  const isSupervisor = useMemo(() => canTransferFreightResponsibility(currentUser), [currentUser]);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg((prev) => (prev === msg ? null : prev));
    }, 4000);
  };

  const syncOperationalFormFromRecord = useCallback((f: UnifiedFreightRecord) => {
    setOpEnderecoColeta(f.enderecoColeta || '');
    setOpClienteContato(f.clienteContato || '');
    setOpInstrucoesColetaEntrega(f.instrucoesColetaEntrega || f.condicoesOperacionais || '');
    setOpTipoCarga(f.tipoCarga || '');
    setOpPesoKg(f.pesoKg ? String(f.pesoKg) : '');
    setOpVolumes(f.volumes ? String(f.volumes) : '');
    setOpVeiculoNecessario(f.veiculoNecessario || '');
    setOpJanelaColetaInicio(f.janelaColetaInicio || '08:00');
    setOpJanelaColetaFim(f.janelaColetaFim || '18:00');
    setOpDataEntregaPrevistaIso(f.dataEntregaPrevistaIso || '');

    setOpMotoristaNome(f.motoristaNome || '');
    setOpMotoristaCpf(f.motoristaCpf || '');
    setOpMotoristaTelefone(f.motoristaTelefone || '');
    setOpTransportadorNome(f.transportadorNome || '');
    setOpTransportadorDoc(f.transportadorDocumento || '');
    setOpPlacaVeiculo(f.placaVeiculo || '');
    setOpPlacaCarreta(f.placaCarreta || '');
    setOpValorContratadoReais(
      typeof f.valorContratadoCentavos === 'number' && f.valorContratadoCentavos > 0
        ? (f.valorContratadoCentavos / 100).toFixed(2).replace('.', ',')
        : ''
    );
    setOpCondicoesPagamento(
      expeditionPaymentMode(f.condicoesPagamento)
    );
    setOpFavorecidoPagamento(
      f.favorecidoPagamento || f.transportadorNome || f.motoristaNome || ''
    );
    setOpBancoPagamento(f.bancoPagamento || '');
    setOpTipoChavePix(f.tipoChavePix || 'CPF/CNPJ');
    setOpChavePix(f.chavePix || f.motoristaCpf || '');
    setOpCondicoesOperacionais(f.condicoesOperacionais || f.instrucoesColetaEntrega || '');
    setOpObservacoes(f.observacoes || '');
    setOpMonitoramentoResponsavelId(f.monitoramentoResponsavelId || '');

    setOpMotoristaRg(f.motoristaRg || '');
    setOpMotoristaCnh(f.motoristaCnh || '');
    setOpPlacaBitrem(f.placaBitrem || '');
    setOpNumeroPedido(f.numeroPedido || '');
    setOpNumeroOrcamento(f.numeroOrcamento || '');
    setOpPontoReferencia(f.pontoReferencia || '');
    setOpEspecieCarga(f.especieCarga || '');
    setOpEmbalagemCarga(f.embalagemCarga || '');
    setOpValorMercadoriaReais(
      typeof f.valorMercadoriaCentavos === 'number' && f.valorMercadoriaCentavos > 0
        ? (f.valorMercadoriaCentavos / 100).toFixed(2).replace('.', ',')
        : ''
    );
    setOpQuantidadeEntregas(f.quantidadeEntregas ? String(f.quantidadeEntregas) : '1');
    setOpRemetenteNome(f.remetenteNome || '');
    setOpRemetenteCnpjCpf(f.remetenteCnpjCpf || '');
    setOpRemetenteIe(f.remetenteIe || '');
    setOpRemetenteTelefone(f.remetenteTelefone || '');
    setOpRemetenteEndereco(f.remetenteEndereco || '');
    setOpRemetenteBairro(f.remetenteBairro || '');
    setOpRemetenteMunicipio(f.remetenteMunicipio || '');
    setOpRemetenteCep(f.remetenteCep || '');
    setOpDestinatarioNome(f.destinatarioNome || '');
    setOpDestinatarioCnpjCpf(f.destinatarioCnpjCpf || '');
    setOpDestinatarioIe(f.destinatarioIe || '');
    setOpDestinatarioTelefone(f.destinatarioTelefone || '');
    setOpDestinatarioEndereco(f.destinatarioEndereco || '');
    setOpDestinatarioBairro(f.destinatarioBairro || '');
    setOpDestinatarioMunicipio(f.destinatarioMunicipio || '');
    setOpDestinatarioCep(f.destinatarioCep || '');

    const c = effectiveExpeditionChecklist(f);
    setChkMotorista(Boolean(c?.motoristaConfirmado));
    setChkVeiculo(Boolean(c?.veiculoConfirmado));
    setChkCondicoesEDocs(Boolean(c?.condicoesConferidas && c?.documentosConferidos));
    setChkVideochamada(Boolean(c?.videochamadaRealizada));
    setChkVideochamadaObs(c?.videochamadaObservacoes || '');
    setChkOrdemEnviada(Boolean(c?.ordemColetaEnviadaMotorista));
    setValidationMissingItems([]);
  }, []);

  const loadFreightFullDetails = useCallback(
    async (freightId: string) => {
      try {
        const res = await apiFetchFreightDetails(freightId);
        if (res.ok && res.freight) {
          setSelectedFreight(res.freight);
          syncOperationalFormFromRecord(res.freight);
          setDetailAnexos(res.anexos || []);
          setDetailOcorrencias(res.ocorrencias || []);
          setDetailHistorico(res.historico || []);
        }
      } catch (err) {
        console.debug('Freight detail load info:', err);
      }
    },
    [syncOperationalFormFromRecord]
  );

  const loadOperators = useCallback(async () => {
    try {
      const res = await apiFetchFreightOperators();
      setExpedicaoOperators(res.expedicaoOperators || []);
      setMonitoramentoOperators(res.monitoramentoOperators || []);
      if (res.permissions) {
        setCanViewTeam(Boolean(res.permissions.canViewTeam));
      }
    } catch (err) {
      console.debug('Load operators info:', err);
    }
  }, []);

  const loadFreights = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const scopeParam =
        viewScope === 'QUEUE' ? 'DISPONIVEIS' : viewScope === 'TEAM' ? 'EQUIPE' : 'MEUS';
      const res = await apiFetchFreightsList({
        area: 'EXPEDICAO',
        scope: scopeParam,
        responsavelId: viewScope === 'TEAM' && responsibleFilterId ? responsibleFilterId : undefined,
        includeCanceled: includeCanceled || statusFilter === 'CANCELADO',
        limit: 100,
      });

      if (!res.ok) {
        setErrorMsg(res.error || 'Falha ao carregar fila da Expedição.');
        return;
      }

      setFreights(res.items || []);
      setSelectedFreight((prev) => {
        if (!prev) return null;
        const updated = (res.items || []).find((f) => f.id === prev.id);
        return updated || prev;
      });
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Falha ao carregar fila operacional da Expedição.'
      );
    } finally {
      setLoading(false);
    }
  }, [viewScope, responsibleFilterId, statusFilter, includeCanceled]);

  useEffect(() => {
    void loadOperators();
  }, [loadOperators]);

  useEffect(() => {
    void loadFreights();
  }, [loadFreights]);

  // Handle opening specific freight from notification click
  useEffect(() => {
    if (!selectedFreightIdFromNotification) return;
    setDisplayMode('LISTA');
    void loadFreightFullDetails(selectedFreightIdFromNotification).finally(() => {
      if (onClearSelectedNotificationFreight) onClearSelectedNotificationFreight();
    });
  }, [
    selectedFreightIdFromNotification,
    loadFreightFullDetails,
    onClearSelectedNotificationFreight,
  ]);

  // Filtered freights
  const filteredFreights = useMemo(() => {
    const now = new Date();
    const todayIso = now.toISOString().slice(0, 10);

    return freights.filter((f) => {
      if (f.situacaoOperacional === 'CANCELADO' && !includeCanceled && statusFilter !== 'CANCELADO') {
        return false;
      }

      if (statusFilter !== 'TODOS' && f.situacaoOperacional !== statusFilter) {
        return false;
      }

      if (periodFilter !== 'TODOS') {
        const refDate = f.dataColetaIso || f.createdAtIso.slice(0, 10);
        if (periodFilter === 'HOJE' && refDate !== todayIso) return false;
        if (periodFilter === 'SEMANA') {
          const diffDays =
            Math.abs(new Date(refDate).getTime() - now.getTime()) / (1000 * 3600 * 24);
          if (diffDays > 7) return false;
        }
        if (periodFilter === 'MES' && refDate.slice(0, 7) !== todayIso.slice(0, 7)) {
          return false;
        }
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const match =
          f.protocol.toLowerCase().includes(q) ||
          f.cliente.toLowerCase().includes(q) ||
          f.origemCidadeUf.toLowerCase().includes(q) ||
          f.destinoCidadeUf.toLowerCase().includes(q) ||
          (f.motoristaNome || '').toLowerCase().includes(q) ||
          (f.placaVeiculo || '').toLowerCase().includes(q) ||
          (f.comercialResponsavelNome || '').toLowerCase().includes(q) ||
          (f.monitoramentoResponsavelNome || '').toLowerCase().includes(q);
        if (!match) return false;
      }

      return true;
    });
  }, [freights, statusFilter, periodFilter, searchQuery]);

  // Summary counters
  const summaryStats = useMemo(() => {
    const base = freights.filter((f) => f.situacaoOperacional !== 'CANCELADO');
    return {
      disponiveisFila: base.filter((f) => f.situacaoOperacional === 'DISPONIVEL_FILA').length,
      recebidos: base.filter((f) => f.situacaoOperacional === 'RECEBIDO').length,
      emPreparacao: base.filter(
        (f) =>
          f.situacaoOperacional === 'EM_PREPARACAO' ||
          f.situacaoOperacional === 'AGUARDANDO_FECHAMENTO'
      ).length,
      liberadosMonitoramento: base.filter(
        (f) =>
          f.situacaoOperacional === 'LIBERADO_MONITORAMENTO' ||
          f.situacaoOperacional === 'FECHADO' ||
          f.situacaoOperacional === 'AGUARDANDO_COLETA' ||
          f.situacaoOperacional === 'EM_TRANSPORTE' ||
          f.situacaoOperacional === 'CONCLUIDO'
      ).length,
      comPendencia: base.filter((f) => f.ocorrenciasAbertasCount > 0 || f.devolvidoParaCorrecao)
        .length,
    };
  }, [freights]);

  const handleSelectFreight = (f: UnifiedFreightRecord) => {
    setSelectedFreight(f);
    syncOperationalFormFromRecord(f);
    void loadFreightFullDetails(f.id);
  };

  const handleClaimFreight = async (freight: UnifiedFreightRecord) => {
    setActionBusy(true);
    setErrorMsg(null);
    try {
      const res = await apiClaimFreightFromQueue(freight.id);
      if (!res.ok || !res.freight) {
        setErrorMsg(res.error || 'Erro ao assumir frete.');
        return;
      }
      const claimed = res.freight;
      setFreights((prev) => prev.map((f) => (f.id === claimed.id ? claimed : f)));
      setSelectedFreight(claimed);
      syncOperationalFormFromRecord(claimed);
      void loadFreightFullDetails(claimed.id);
      showToast(`Frete ${claimed.protocol} assumido em sua fila da Expedição.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao assumir frete.');
    } finally {
      setActionBusy(false);
    }
  };

  const persistPreparationData = async (options?: {
    overrideChecklist?: Partial<{
      motoristaConfirmado: boolean;
      veiculoConfirmado: boolean;
      condicoesConferidas: boolean;
      documentosConferidos: boolean;
      videochamadaRealizada: boolean;
      videochamadaObservacoes: string;
      ordemColetaEnviadaMotorista: boolean;
    }>;
    silentToast?: boolean;
  }): Promise<UnifiedFreightRecord | null> => {
    if (!selectedFreight) return null;
    setSavingOp(true);
    setErrorMsg(null);
    setValidationMissingItems([]);

    try {
      const nextMotorista =
        options?.overrideChecklist?.motoristaConfirmado ?? selectedFreight.checklistFechamento?.motoristaConfirmado ?? false;
      const nextVeiculo =
        options?.overrideChecklist?.veiculoConfirmado ?? selectedFreight.checklistFechamento?.veiculoConfirmado ?? false;
      const nextCondicoesDocs =
        options?.overrideChecklist?.condicoesConferidas ?? selectedFreight.checklistFechamento?.condicoesConferidas ?? false;
      const nextVideochamada =
        options?.overrideChecklist?.videochamadaRealizada ?? chkVideochamada;
      const nextVideoObs =
        options?.overrideChecklist?.videochamadaObservacoes ?? chkVideochamadaObs;
      const nextOrdemEnviada =
        options?.overrideChecklist?.ordemColetaEnviadaMotorista ?? selectedFreight.checklistFechamento?.ordemColetaEnviadaMotorista ?? false;

      const res = await apiUpdateOperationalData(selectedFreight.id, {
        baseRevision: selectedFreight.revision,
        enderecoColeta: opEnderecoColeta,
        clienteContato: opClienteContato,
        instrucoesColetaEntrega: opInstrucoesColetaEntrega,
        tipoCarga: opTipoCarga,
        pesoKg: opPesoKg ? Number(opPesoKg) : undefined,
        volumes: opVolumes ? Number(opVolumes) : undefined,
        veiculoNecessario: opVeiculoNecessario,
        janelaColetaInicio: opJanelaColetaInicio,
        janelaColetaFim: opJanelaColetaFim,
        dataEntregaPrevistaIso: opDataEntregaPrevistaIso || undefined,
        motoristaNome: opMotoristaNome,
        motoristaCpf: opMotoristaCpf,
        motoristaTelefone: opMotoristaTelefone,
        transportadorNome: opTransportadorNome,
        transportadorDocumento: opTransportadorDoc,
        placaVeiculo: opPlacaVeiculo.toUpperCase(),
        placaCarreta: opPlacaCarreta.toUpperCase(),
        valorContratadoCentavos: opValorContratadoReais
          ? parseBrlInputToCentavos(opValorContratadoReais)
          : undefined,
        condicoesOperacionais: opCondicoesOperacionais || opInstrucoesColetaEntrega,
        condicoesPagamento: opCondicoesPagamento,
        favorecidoPagamento: opFavorecidoPagamento,
        bancoPagamento: opBancoPagamento,
        tipoChavePix: opTipoChavePix,
        chavePix: opChavePix,
        observacoes: opObservacoes,
        motoristaRg: opMotoristaRg,
        motoristaCnh: opMotoristaCnh,
        placaBitrem: opPlacaBitrem.toUpperCase(),
        numeroPedido: opNumeroPedido,
        numeroOrcamento: opNumeroOrcamento,
        pontoReferencia: opPontoReferencia,
        especieCarga: opEspecieCarga,
        embalagemCarga: opEmbalagemCarga,
        valorMercadoriaCentavos: opValorMercadoriaReais
          ? parseBrlInputToCentavos(opValorMercadoriaReais)
          : undefined,
        quantidadeEntregas: opQuantidadeEntregas ? Number(opQuantidadeEntregas) : undefined,
        remetenteNome: opRemetenteNome,
        remetenteCnpjCpf: opRemetenteCnpjCpf,
        remetenteIe: opRemetenteIe,
        remetenteTelefone: opRemetenteTelefone,
        remetenteEndereco: opRemetenteEndereco,
        remetenteBairro: opRemetenteBairro,
        remetenteMunicipio: opRemetenteMunicipio,
        remetenteCep: opRemetenteCep,
        destinatarioNome: opDestinatarioNome,
        destinatarioCnpjCpf: opDestinatarioCnpjCpf,
        destinatarioIe: opDestinatarioIe,
        destinatarioTelefone: opDestinatarioTelefone,
        destinatarioEndereco: opDestinatarioEndereco,
        destinatarioBairro: opDestinatarioBairro,
        destinatarioMunicipio: opDestinatarioMunicipio,
        destinatarioCep: opDestinatarioCep,
        monitoramentoResponsavelId: opMonitoramentoResponsavelId || null,
        checklistFechamento: {
          motoristaConfirmado: nextMotorista,
          veiculoConfirmado: nextVeiculo,
          condicoesConferidas: nextCondicoesDocs,
          documentosConferidos: nextCondicoesDocs,
          videochamadaRealizada: nextVideochamada,
          videochamadaObservacoes: nextVideoObs,
          ordemColetaEnviadaMotorista: nextOrdemEnviada,
        },
      });

      if (!res.ok || !res.freight) {
        setErrorMsg(res.error || 'Erro ao salvar dados da Expedição.');
        return null;
      }

      const saved = res.freight;
      setFreights((prev) => prev.map((f) => (f.id === saved.id ? saved : f)));
      setSelectedFreight(saved);
      syncOperationalFormFromRecord(saved);
      if (res.historico) setDetailHistorico(res.historico);
      if (!options?.silentToast) {
        showToast(`Dados de preparação salvos no frete ${saved.protocol}.`);
      }
      return saved;
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao salvar dados da Expedição.');
      return null;
    } finally {
      setSavingOp(false);
    }
  };

  const handleToggleVerification = async (
    key: 'MOTORISTA' | 'VEICULO' | 'CONDICOES_DOCS' | 'VIDEOCHAMADA' | 'ORDEM_ENVIADA',
    nextVal: boolean
  ) => {
    if (!selectedFreight || verificationLock.current || savingOp || actionBusy) return;
    const draft = {...selectedFreight,motoristaNome:opMotoristaNome,motoristaCpf:opMotoristaCpf,motoristaTelefone:opMotoristaTelefone,placaVeiculo:opPlacaVeiculo,veiculoNecessario:opVeiculoNecessario,condicoesOperacionais:opCondicoesOperacionais||opInstrucoesColetaEntrega,condicoesPagamento:opCondicoesPagamento,valorContratadoCentavos:parseBrlInputToCentavos(opValorContratadoReais)};
    const issue=nextVal?expeditionVerificationIssue(draft,key):null;
    if(issue){setErrorMsg(issue.message);if(issue.field){setActiveDetailTab('PREPARACAO');requestAnimationFrame(()=>document.getElementById(issue.field)?.focus());}return;}
    verificationLock.current = true;
    try {
    const saved = await persistPreparationData({
      overrideChecklist: {
        ...(key==='MOTORISTA'?{motoristaConfirmado:nextVal}:{}),
        ...(key==='VEICULO'?{veiculoConfirmado:nextVal}:{}),
        ...(key==='CONDICOES_DOCS'?{condicoesConferidas:nextVal,documentosConferidos:nextVal}:{}),
        ...(key==='VIDEOCHAMADA'?{videochamadaRealizada:nextVal}:{}),
        ...(key==='ORDEM_ENVIADA'?{ordemColetaEnviadaMotorista:nextVal}:{}),
      },
      silentToast: true,
    });
    if (!saved) syncOperationalFormFromRecord(selectedFreight);
    } finally { verificationLock.current = false; }
  };

  const handleEmitirOrdemColeta = async () => {
    if (!selectedFreight) return;
    setActionBusy(true);
    setErrorMsg(null);
    try {
      const saved = await persistPreparationData({ silentToast: true });
      if (!saved) return;
      const target = saved;
      const res = await apiExpedicaoAction(target.id, {
        action: 'EMITIR_ORDEM',
        baseRevision: target.revision,
      });
      if (!res.ok || !res.freight) {
        setErrorMsg(res.error || 'Erro ao gerar Ordem de Coleta.');
        return;
      }
      const updated = res.freight;
      setFreights((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
      setSelectedFreight(updated);
      syncOperationalFormFromRecord(updated);
      if (res.historico) setDetailHistorico(res.historico);
      setShowOrderModal(true);
      showToast(`Ordem de Coleta gerada para o frete ${updated.protocol}.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao gerar Ordem de Coleta.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleConfirmarEnvioOrdemAoMotorista = async () => {
    if (!selectedFreight) return;
    setActionBusy(true);
    setErrorMsg(null);
    try {
      const res = await apiExpedicaoAction(selectedFreight.id, {
        action: 'CONFIRMAR_ENVIO_ORDEM_MOTORISTA',
        baseRevision: selectedFreight.revision,
      });
      if (!res.ok || !res.freight) {
        setErrorMsg(res.error || 'Erro ao confirmar envio da Ordem de Coleta.');
        return;
      }
      const updated = res.freight;
      setFreights((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
      setSelectedFreight(updated);
      syncOperationalFormFromRecord(updated);
      if (res.historico) setDetailHistorico(res.historico);
      showToast(`Envio da Ordem de Coleta ao motorista confirmado (${updated.protocol}).`);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Erro ao confirmar envio da Ordem de Coleta.'
      );
    } finally {
      setActionBusy(false);
    }
  };

  const handleIgnorarOrdemColeta = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFreight) return;
    setActionBusy(true);
    setErrorMsg(null);
    try {
      const saved = await persistPreparationData({ silentToast: true });
      const target = saved || selectedFreight;
      const res = await apiExpedicaoAction(target.id, {
        action: 'IGNORAR_ORDEM_COLETA',
        motivo: skipOrderReason.trim() || undefined,
        baseRevision: target.revision,
      });
      if (!res.ok || !res.freight) {
        setErrorMsg(res.error || 'Não foi possível adiar a Ordem de Coleta.');
        return;
      }
      const updated = res.freight;
      setFreights((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
      setSelectedFreight(updated);
      syncOperationalFormFromRecord(updated);
      if (res.historico) setDetailHistorico(res.historico);
      setShowSkipOrderModal(false);
      setSkipOrderReason('');
      showToast(
        `Ordem de coleta marcada como pendente no frete ${updated.protocol}. Você já pode liberar para Monitoramento ou emitir depois.`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao adiar Ordem de Coleta.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleShareOrdemColeta = async (freight: UnifiedFreightRecord) => {
    const activeBrand = freight.empresaMarca === 'VL TRANSPORTES' ? 'VL TRANSPORTES' : 'RODOVAR';
    const company = COMPANY_LEGAL_PROFILES[activeBrand];
    const orderDisplay = extractOrderDisplayNumber(freight);
    const shareText = [
      `*ORDEM DE COLETA ${activeBrand} Nº ${orderDisplay.seqFormatted}/${orderDisplay.year} — FRETE ${freight.protocol}*`,
      `CNPJ: ${company.cnpj}`,
      `Origem: ${freight.origemCidadeUf} (${freight.enderecoColeta || '—'})`,
      `Destino: ${freight.destinoCidadeUf} (${freight.enderecoEntrega || '—'})`,
      `Coleta: ${formatIsoDateBr(freight.dataColetaIso)} ${freight.janelaColetaInicio || ''}`,
      `Carga: ${freight.tipoCarga || '—'} ${freight.pesoKg ? `(${freight.pesoKg} kg)` : ''}`,
      `Motorista: ${freight.motoristaNome || '—'} (CPF: ${freight.motoristaCpf || '—'})`,
      `Placas: ${freight.placaVeiculo || '—'} ${freight.placaCarreta ? `/ ${freight.placaCarreta}` : ''}`,
      `Instruções: ${freight.instrucoesColetaEntrega || freight.condicoesOperacionais || 'Apresentar documentos e EPIs no local.'}`,
    ].join('\n');

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: `Ordem de Coleta ${orderDisplay.seqFormatted}/${orderDisplay.year} — ${activeBrand}`,
          text: shareText,
        });
        return;
      } catch {
        // fallback to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(shareText);
      showToast('Resumo da Ordem de Coleta copiado para envio ao motorista.');
    } catch {
      showToast('Use "Baixar PDF (2 vias A4)" ou "Imprimir" para enviar a Ordem ao motorista.');
    }
  };

  const handleLiberarParaMonitoramento = async () => {
    if (!selectedFreight || actionBusy || savingOp || verificationLock.current) return;
    setErrorMsg(null);
    setValidationMissingItems([]);

    const missing: string[] = [];
    if (!opEnderecoColeta.trim()) missing.push('Endereço de coleta');
    // Endereço detalhado de entrega é opcional na Expedição (Requirement 2)
    if (!opTipoCarga.trim()) missing.push('Material / tipo de carga');
    if (!opVeiculoNecessario.trim()) missing.push('Tipo de veículo');
    if (!(Number(opPesoKg)>0)) missing.push('Peso da carga maior que zero (Dados Operacionais)');
    if (!opMotoristaNome.trim()) missing.push('Nome completo do motorista');
    const cleanCpf = opMotoristaCpf.replace(/\D/g, '');
    if (cleanCpf.length !== 11) missing.push('CPF válido do motorista (11 dígitos)');
    const cleanPhone = opMotoristaTelefone.replace(/\D/g, '');
    if (cleanPhone.length < 10) missing.push('Telefone válido do motorista');
    if (!opPlacaVeiculo.trim()) missing.push('Placa do veículo');
    const missingConditions = (opCondicoesOperacionais || opInstrucoesColetaEntrega).trim().length < 3;
    const missingPayment = !expeditionPaymentMode(opCondicoesPagamento);
    if(missingPayment) missing.push('Condições de pagamento: selecione 70/30, 80/20 ou Integral em Dados Operacionais');
    if (missingConditions) missing.push('Condições operacionais: preencha na aba Dados Operacionais (mínimo 3 caracteres)');
    const valorCentavos = parseBrlInputToCentavos(opValorContratadoReais);
    if (valorCentavos <= 0) missing.push('Valor contratado do motorista maior que zero');
    if (!chkMotorista) missing.push('Verificação: Dados do motorista conferidos');
    if (!chkVeiculo) missing.push('Verificação: Veículo conferido');
    if (!chkCondicoesEDocs) missing.push('Verificação: Condições e documentos conferidos');
    if (!chkVideochamada) missing.push('Verificação: Videochamada realizada com o motorista');
    if (!chkOrdemEnviada && !selectedFreight.ordemColetaPendente) {
      missing.push(
        'Verificação: Ordem de coleta enviada ao motorista (ou clique em "Ignorar por enquanto")'
      );
    }
    if (!opMonitoramentoResponsavelId) {
      missing.push('Seleção do Operador de Monitoramento responsável');
    }

    if (missing.length > 0) {
      if (missingConditions || missingPayment) {
        setActiveDetailTab('PREPARACAO');
        requestAnimationFrame(()=>document.getElementById(missingConditions?'exp-operational-conditions':'exp-payment-mode')?.focus());
      }
      setValidationMissingItems(missing);
      setErrorMsg(
        `Para liberar ao Monitoramento, conclua os ${missing.length} item(ns) pendente(s) abaixo.`
      );
      return;
    }

    setActionBusy(true);
    try {
      const saved = await persistPreparationData({ silentToast: true });
      if (!saved) return;

      const res = await apiExpedicaoAction(saved.id, {
        action: 'LIBERAR_PARA_MONITORAMENTO',
        monitoramentoResponsavelId: opMonitoramentoResponsavelId,
        baseRevision: saved.revision,
      });

      if (!res.ok || !res.freight) {
        if (res.missingFields && res.missingFields.length > 0) {
          setValidationMissingItems(res.missingFields);
        }
        setErrorMsg(res.error || 'Erro ao liberar frete para o Monitoramento.');
        return;
      }

      const updated = res.freight;
      setFreights((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
      setSelectedFreight(updated);
      syncOperationalFormFromRecord(updated);
      if (res.historico) setDetailHistorico(res.historico);
      showToast(
        `Frete ${updated.protocol} liberado para Monitoramento (${updated.monitoramentoResponsavelNome || 'Operador'})!`
      );
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Erro ao liberar frete para o Monitoramento.'
      );
    } finally {
      setActionBusy(false);
    }
  };

  const handleReturnToComercial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFreight) return;
    if (!returnObservation.trim()) {
      setErrorMsg('Informe o motivo da devolução para o Comercial.');
      return;
    }
    setActionBusy(true);
    setErrorMsg(null);
    try {
      const res = await apiExpedicaoAction(selectedFreight.id, {
        action: 'DEVOLVER_COMERCIAL',
        motivo: returnObservation.trim(),
        baseRevision: selectedFreight.revision,
      });
      if (!res.ok || !res.freight) {
        setErrorMsg(res.error || 'Erro ao devolver ao Comercial.');
        return;
      }
      const updated = res.freight;
      setFreights((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
      setSelectedFreight(updated);
      setShowReturnModal(false);
      setReturnObservation('');
      showToast(`Frete ${updated.protocol} devolvido ao Comercial com justificativa.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao devolver ao Comercial.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleCreateOccurrence = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFreight || !occTitulo.trim()) return;
    setOccBusy(true);
    try {
      const res = await apiRegisterFreightOccurrence(selectedFreight.id, {
        title: occTitulo.trim(),
        description: occDescricao.trim(),
        severity: occSeveridade,
      });
      if (!res.ok || !res.freight) {
        setErrorMsg(res.error || 'Erro ao registrar ocorrência.');
        return;
      }
      const updated = res.freight;
      setFreights((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
      setSelectedFreight(updated);
      if (res.ocorrencias) setDetailOcorrencias(res.ocorrencias);
      if (res.historico) setDetailHistorico(res.historico);
      setOccTitulo('');
      setOccDescricao('');
      showToast('Ocorrência operacional registrada.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao registrar ocorrência.');
    } finally {
      setOccBusy(false);
    }
  };

  const handleResolveOccurrence = async (occId: string) => {
    if (!selectedFreight) return;
    setOccBusy(true);
    try {
      const res = await apiResolveFreightOccurrence(selectedFreight.id, occId);
      if (!res.ok || !res.freight) {
        setErrorMsg(res.error || 'Erro ao resolver ocorrência.');
        return;
      }
      const updated = res.freight;
      setFreights((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
      setSelectedFreight(updated);
      if (res.ocorrencias) setDetailOcorrencias(res.ocorrencias);
      if (res.historico) setDetailHistorico(res.historico);
      showToast('Ocorrência marcada como resolvida.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao resolver ocorrência.');
    } finally {
      setOccBusy(false);
    }
  };

  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedFreight) return;
    if (file.size > 10 * 1024 * 1024) {
      setErrorMsg('O arquivo excede o limite de 10 MB.');
      return;
    }

    setAttBusy(true);
    setErrorMsg(null);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Falha ao ler arquivo.'));
        reader.readAsDataURL(file);
      });

      const res = await apiUploadFreightAttachment(selectedFreight.id, {
        category: attCategory,
        fileName: file.name,
        label: file.name,
        dataUrl,
      });

      if (!res.ok || !res.freight) {
        setErrorMsg(res.error || 'Erro ao enviar anexo.');
        return;
      }

      const updated = res.freight;
      setFreights((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
      setSelectedFreight(updated);
      if (res.anexos) setDetailAnexos(res.anexos);
      if (res.historico) setDetailHistorico(res.historico);
      showToast(`Anexo "${file.name}" vinculado ao frete.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao enviar anexo.');
    } finally {
      setAttBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleVerifyAttachment = async (attId: string) => {
    if (!selectedFreight) return;
    setAttBusy(true);
    try {
      const res = await apiVerifyFreightAttachment(selectedFreight.id, attId, true);
      if (!res.ok || !res.freight) {
        setErrorMsg(res.error || 'Erro ao conferir anexo.');
        return;
      }
      const updated = res.freight;
      setFreights((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
      setSelectedFreight(updated);
      if (res.anexos) setDetailAnexos(res.anexos);
      if (res.historico) setDetailHistorico(res.historico);
      showToast('Documento/comprovante conferido.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao conferir anexo.');
    } finally {
      setAttBusy(false);
    }
  };

  const handleTransferExpedicao = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFreight || !transferTargetId || !transferMotivo.trim()) return;
    setTransferBusy(true);
    try {
      const res = await apiTransferFreightResponsibility(selectedFreight.id, {
        sector: 'EXPEDICAO',
        newResponsibleId: transferTargetId,
        reason: transferMotivo.trim(),
        baseRevision: selectedFreight.revision,
      });
      if (!res.ok || !res.freight) {
        setErrorMsg(res.error || 'Erro ao transferir responsabilidade.');
        return;
      }
      const updated = res.freight;
      setFreights((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
      setSelectedFreight(updated);
      if (res.historico) setDetailHistorico(res.historico);
      setTransferTargetId('');
      setTransferMotivo('');
      showToast('Responsabilidade operacional transferida.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao transferir responsabilidade.');
    } finally {
      setTransferBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed bottom-5 right-5 z-50 bg-[#080B0D] text-white border-l-4 border-[#FFD400] px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2.5 text-xs font-bold max-w-md">
          <CheckCircle2 className="w-4 h-4 text-[#FFD400] shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* 1. HEADER BANNER */}
      <div
        className="relative overflow-hidden rounded-2xl p-5 mb-5 text-white shadow-md border border-white/10 flex flex-col lg:flex-row lg:items-center justify-between gap-3"
        style={{
          background: "linear-gradient(90deg, #061019 0%, rgba(6,16,25,0.92) 38%, rgba(6,16,25,0.48) 72%, rgba(6,16,25,0.12) 100%), url('/assets/banner-rodovar-conecta-highway.png') center right / cover no-repeat #101a24"
        }}
      >
        <div className="relative z-10">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              Meus Fretes — Expedição
            </h1><DriverLookupButton/>
            {hasDualProfile && onSwitchToComercial && (
              <button
                type="button"
                onClick={onSwitchToComercial}
                className="inline-flex items-center gap-1.5 text-[11px] font-extrabold bg-[#FFD400] text-slate-950 px-3 py-1 rounded-lg hover:bg-[#ffe033] transition cursor-pointer"
              >
                <ArrowRight className="w-3.5 h-3.5" />
                <span>Ir para Comercial</span>
              </button>
            )}
          </div>
          <p className="text-xs text-gray-200 font-medium mt-1">
            Preparação operacional, conferência dos 5 itens, videochamada com motorista, emissão da Ordem de Coleta e liberação para o Monitoramento
          </p>
        </div>

        <div className="relative z-10 flex flex-wrap items-center gap-2.5">
          <div className="inline-flex items-center gap-2 bg-black/40 backdrop-blur-sm border border-white/15 rounded-full pl-1.5 pr-3.5 py-1 shadow-2xs">
            <div className="w-7 h-7 rounded-full bg-[#FFD400] text-[#080B0D] font-black text-xs flex items-center justify-center">
              {getInitials(currentUser.name)}
            </div>
            <span className="text-xs font-extrabold text-white">
              {currentUser.name.split(' ').slice(0, 2).join(' ')}
            </span>
            <span className="text-xs text-gray-300">•</span>
            <span className="text-xs font-semibold text-[#FFD400]">Expedição</span>
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {errorMsg && (
        <div className="bg-red-50 border border-red-200 text-red-900 rounded-xl p-3 text-xs font-bold flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-[#E5252A] shrink-0 mt-0.5" />
            <div>
              <span>{errorMsg}</span>
              {validationMissingItems.length > 0 && (
                <ul className="mt-1.5 list-disc list-inside space-y-0.5 text-[11px] font-semibold text-red-800">
                  {validationMissingItems.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setErrorMsg(null);
              setValidationMissingItems([]);
            }}
            className="text-red-700 hover:text-red-950 font-black cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 2. TOP SUMMARY CARDS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl p-3.5 border border-gray-200/80 shadow-2xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200/60 flex items-center justify-center text-amber-700 shrink-0">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-gray-500">Recebidos / Na fila</p>
            <p className="text-xl font-black text-amber-800 tabular-nums leading-tight">
              {summaryStats.recebidos + summaryStats.disponiveisFila}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-3.5 border border-gray-200/80 shadow-2xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200/60 flex items-center justify-center text-blue-700 shrink-0">
            <Video className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-gray-500">Em preparação</p>
            <p className="text-xl font-black text-blue-800 tabular-nums leading-tight">
              {summaryStats.emPreparacao}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-3.5 border border-gray-200/80 shadow-2xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200/60 flex items-center justify-center text-emerald-700 shrink-0">
            <Truck className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-gray-500">Liberados ao Monitoramento</p>
            <p className="text-xl font-black text-emerald-700 tabular-nums leading-tight">
              {summaryStats.liberadosMonitoramento}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-3.5 border border-gray-200/80 shadow-2xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-50 border border-red-200/60 flex items-center justify-center text-[#E5252A] shrink-0">
            <AlertCircle className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-gray-500">Com pendências</p>
            <p className="text-xl font-black text-[#E5252A] tabular-nums leading-tight">
              {summaryStats.comPendencia}
            </p>
          </div>
        </div>
      </div>

      {/* 3. FILTER & VIEW MODE BAR */}
      <div className="bg-white rounded-2xl p-3 border border-gray-200/80 shadow-2xs flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[240px]">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar frete, cliente, placa ou motorista..."
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#F3F5F7] border border-gray-200 text-xs text-[#15191D] placeholder-gray-400 focus:outline-none focus:border-[#FFD400]"
            />
          </div>

          <div className="inline-flex items-center gap-1.5 bg-[#F3F5F7] border border-gray-200 rounded-xl px-2.5 py-1.5 text-xs">
            <Calendar className="w-3.5 h-3.5 text-gray-500" />
            <select
              value={periodFilter}
              onChange={(e) =>
                setPeriodFilter(e.target.value as 'HOJE' | 'SEMANA' | 'MES' | 'TODOS')
              }
              className="bg-transparent font-semibold text-[#15191D] focus:outline-none cursor-pointer"
            >
              <option value="TODOS">Todos os dias</option>
              <option value="HOJE">Coletas de hoje</option>
              <option value="SEMANA">Esta semana</option>
              <option value="MES">Este mês</option>
            </select>
          </div>

          <div className="inline-flex items-center gap-1.5 bg-[#F3F5F7] border border-gray-200 rounded-xl px-2.5 py-1.5 text-xs">
            <User className="w-3.5 h-3.5 text-gray-500" />
            <select
              value={
                viewScope === 'MINE'
                  ? 'MINE'
                  : viewScope === 'QUEUE'
                  ? 'QUEUE'
                  : responsibleFilterId || 'TEAM'
              }
              onChange={(e) => {
                const val = e.target.value;
                if (val === 'MINE') {
                  setViewScope('MINE');
                  setResponsibleFilterId('');
                } else if (val === 'QUEUE') {
                  setViewScope('QUEUE');
                  setResponsibleFilterId('');
                } else if (val === 'TEAM') {
                  setViewScope('TEAM');
                  setResponsibleFilterId('');
                } else {
                  setViewScope('TEAM');
                  setResponsibleFilterId(val);
                }
              }}
              className="bg-transparent font-semibold text-[#15191D] focus:outline-none cursor-pointer"
            >
              <option value="MINE">
                Minha fila ({currentUser.name.split(' ')[0]})
              </option>
              <option value="QUEUE">
                Disponíveis na fila ({summaryStats.disponiveisFila})
              </option>
              {canViewTeam && <option value="TEAM">Equipe: Todos da Expedição</option>}
              {canViewTeam &&
                expedicaoOperators.map((op) => (
                  <option key={op.id} value={op.id}>
                    Expedição: {op.name}
                  </option>
                ))}
            </select>
          </div>

          <div className="inline-flex items-center gap-1.5 bg-[#F3F5F7] border border-gray-200 rounded-xl px-2.5 py-1.5 text-xs">
            <select
              value={includeCanceled ? 'CANCELADO' : statusFilter}
              onChange={(e) => {
                const val = e.target.value;
                if (val === 'CANCELADO') {
                  handleToggleIncludeCanceled(true);
                } else {
                  if (includeCanceled) {
                    handleToggleIncludeCanceled(false);
                  }
                  setStatusFilter(val);
                }
              }}
              className="bg-transparent font-semibold text-[#15191D] focus:outline-none cursor-pointer"
            >
              <option value="TODOS">Etapa: Todas</option>
              <option value="DISPONIVEL_FILA">Disponível na fila</option>
              <option value="RECEBIDO">Recebidos</option>
              <option value="EM_PREPARACAO">Em preparação</option>
              <option value="LIBERADO_MONITORAMENTO">Liberados ao Monitoramento</option>
              <option value="DEVOLVIDO_CORRECAO">Devolvidos para correção</option>
              <option value="CANCELADO">Cancelados</option>
            </select>
          </div>

          <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeCanceled}
              onChange={(e) => handleToggleIncludeCanceled(e.target.checked)}
              className="rounded border-gray-300 text-[#080B0D] focus:ring-[#FFD400]"
            />
            <span>Mostrar cancelados</span>
          </label>
        </div>

        {/* Display Mode Toggle */}
        <div className="inline-flex items-center bg-[#F3F5F7] p-1 rounded-xl border border-gray-200">
          <button
            type="button"
            onClick={() => setDisplayMode('LISTA')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-extrabold transition cursor-pointer ${
              displayMode === 'LISTA'
                ? 'bg-[#FFD400] text-[#080B0D] shadow-2xs'
                : 'text-gray-600 hover:text-[#15191D]'
            }`}
          >
            <List className="w-3.5 h-3.5" />
            <span>Lista</span>
          </button>
          <button
            type="button"
            onClick={() => {
              if (includeCanceled) {
                setIncludeCanceled(false);
                setStatusFilter('TODOS');
              }
              setDisplayMode('QUADRO');
            }}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-extrabold transition cursor-pointer ${
              displayMode === 'QUADRO'
                ? 'bg-[#FFD400] text-[#080B0D] shadow-2xs'
                : 'text-gray-600 hover:text-[#15191D]'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>Quadro</span>
          </button>
        </div>
      </div>

      {/* 4. MAIN WORKSPACE: OPERATIONAL LIST OR KANBAN BOARD */}
      {displayMode === 'LISTA' ? (
        <div className="bg-white rounded-2xl border border-gray-200/80 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#F3F5F7] border-b border-gray-200 text-[11px] font-extrabold text-gray-500 uppercase tracking-wider">
                    <th className="py-3 px-3.5">Frete</th>
                    <th className="py-3 px-3">Cliente e rota</th>
                    <th className="py-3 px-3">Coleta</th>
                    <th className="py-3 px-3">Motorista / Placa</th>
                    <th className="py-3 px-3">Verificações</th>
                    <th className="py-3 px-3.5 text-right">Etapa</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-xs">
                  {loading && filteredFreights.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-gray-400">
                        <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-1.5 text-gray-400" />
                        Carregando fila da Expedição...
                      </td>
                    </tr>
                  ) : filteredFreights.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-gray-400 font-medium">
                        {includeCanceled || statusFilter === 'CANCELADO'
                          ? 'Nenhum frete cancelado encontrado na fila selecionada.'
                          : 'Nenhum frete encontrado na fila selecionada.'}
                      </td>
                    </tr>
                  ) : (
                    filteredFreights.map((f) => {
                      const isSelected = selectedFreight?.id === f.id;
                      const verifCount = countCompletedVerifications(f);
                      return (
                        <tr
                          key={f.id}
                          onClick={() => handleSelectFreight(f)}
                          className={`cursor-pointer transition-colors ${
                            isSelected ? 'bg-[#FFFDF0]' : 'hover:bg-gray-50/90'
                          }`}
                        >
                          <td className="py-3 px-3.5 align-top">
                            <div
                              className={`pl-2 border-l-4 ${
                                isSelected ? 'border-[#FFD400]' : 'border-transparent'
                              }`}
                            >
                              <p className="font-black text-[#15191D] text-xs">{f.protocol}</p>
                              <p className="text-[10px] text-gray-400">
                                Com.: {f.comercialResponsavelNome.split(' ')[0]}
                              </p>
                            </div>
                          </td>

                          <td className="py-3 px-3 align-top">
                            <p className="font-extrabold text-[#15191D]">{f.cliente}</p>
                            <p className="text-[11px] text-gray-600 mt-0.5">
                              {f.origemCidadeUf} → {f.destinoCidadeUf}
                            </p>
                            {f.camposPendentesExpedicao &&
                              f.camposPendentesExpedicao.length > 0 &&
                              f.situacaoOperacional !== 'LIBERADO_MONITORAMENTO' && (
                                <span className="inline-block mt-1 text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                                  Completar: {f.camposPendentesExpedicao.slice(0, 2).join(', ')}
                                  {f.camposPendentesExpedicao.length > 2
                                    ? ` +${f.camposPendentesExpedicao.length - 2}`
                                    : ''}
                                </span>
                              )}
                          </td>

                          <td className="py-3 px-3 align-top whitespace-nowrap">
                            <p className="font-bold text-[#15191D]">
                              {formatIsoDateBr(f.dataColetaIso)}
                            </p>
                            <p className="text-[11px] text-gray-500">
                              {f.janelaColetaInicio || '08:00'}
                              {f.janelaColetaFim ? ` - ${f.janelaColetaFim}` : ''}
                            </p>
                          </td>

                          <td className="py-3 px-3 align-top">
                            {f.motoristaNome ? (
                              <>
                                <p className="font-bold text-[#15191D]">{f.motoristaNome}</p>
                                <p className="text-[11px] text-gray-500 font-mono">
                                  {f.placaVeiculo || 'Sem placa'}
                                </p>
                              </>
                            ) : (
                              <span className="inline-block bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-extrabold px-2 py-0.5 rounded-md">
                                Definir motorista
                              </span>
                            )}
                          </td>

                          <td className="py-3 px-3 align-top whitespace-nowrap">
                            <span
                              className={`inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-md ${
                                verifCount === 5
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : 'bg-gray-100 text-gray-700 border border-gray-200'
                              }`}
                            >
                              <ShieldCheck className="w-3 h-3" />
                              {verifCount}/5 itens
                            </span>
                            {f.checklistFechamento?.videochamadaRealizada && (
                              <span className="block text-[10px] font-bold text-blue-700 mt-0.5">
                                ✓ Videochamada OK
                              </span>
                            )}
                          </td>

                          <td className="py-3 px-3.5 align-top text-right">
                            <div className="flex flex-col items-end gap-1">
                              <span
                                className={`inline-block text-[10px] font-extrabold px-2.5 py-1 rounded-md border whitespace-normal text-right leading-tight ${getOperationalBadgeStyle(
                                  f.situacaoOperacional
                                )}`}
                              >
                                {formatSituacaoOperacionalLabel(f.situacaoOperacional)}
                              </span>
                              {(f.situacaoOperacional === 'LIBERADO_MONITORAMENTO' ||
                                f.situacaoOperacional === 'EM_TRANSPORTE' ||
                                f.situacaoOperacional === 'CONCLUIDO') && (
                                <span className="text-[10px] font-bold text-emerald-700">
                                  Monit.: {formatSituacaoMonitoramentoLabel(f.situacaoMonitoramento)}
                                </span>
                              )}
                              {f.ordemColetaPendente && !f.ordemCarregamentoNumero && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                                  <Clock className="w-2.5 h-2.5" />
                                  Ordem de coleta pendente
                                </span>
                              )}
                              {f.situacaoOperacional === 'DISPONIVEL_FILA' && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void handleClaimFreight(f);
                                  }}
                                  className="text-[10px] font-extrabold bg-[#FFD400] hover:bg-[#ffdf33] text-[#080B0D] px-2.5 py-1 rounded-md shadow-2xs cursor-pointer"
                                >
                                  Assumir frete
                                </button>
                              )}
                              {f.situacaoOperacional === 'CANCELADO' && canReactivate && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setTargetReactivateFreight(f);
                                    setReactivateMotivo('');
                                    setShowReactivateModal(true);
                                  }}
                                  className="inline-flex items-center gap-1 text-[10px] font-extrabold bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 px-2 py-0.5 rounded cursor-pointer mt-1"
                                >
                                  <RotateCcw className="w-2.5 h-2.5" />
                                  <span>Reativar</span>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
        </div>
      ) : (
        /* 4B. KANBAN BOARD VIEW FOR EXPEDIÇÃO (Recebidos → Em preparação → Liberados ao Monitoramento) */
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 items-start">
          {EXPEDICAO_BOARD_COLUMNS.map((col) => {
            const items = filteredFreights.filter((f) => {
              if (col.id === 'RECEBIDO') {
                return (
                  f.situacaoOperacional === 'RECEBIDO' ||
                  f.situacaoOperacional === 'DISPONIVEL_FILA'
                );
              }
              if (col.id === 'EM_PREPARACAO') {
                return (
                  f.situacaoOperacional === 'EM_PREPARACAO' ||
                  f.situacaoOperacional === 'AGUARDANDO_FECHAMENTO' ||
                  f.situacaoOperacional === 'DEVOLVIDO_CORRECAO'
                );
              }
              return (
                f.situacaoOperacional === 'LIBERADO_MONITORAMENTO' ||
                f.situacaoOperacional === 'FECHADO' ||
                f.situacaoOperacional === 'AGUARDANDO_COLETA' ||
                f.situacaoOperacional === 'EM_TRANSPORTE' ||
                f.situacaoOperacional === 'CONCLUIDO'
              );
            });

            return (
              <div
                key={col.id}
                className="bg-[#EBEEF2] rounded-2xl p-3 border border-gray-200/90 flex flex-col min-h-[420px]"
              >
                <div
                  className={`rounded-xl px-3 py-2.5 mb-3 border flex items-center justify-between ${col.headerBg}`}
                >
                  <div>
                    <h3 className="text-xs font-black text-[#15191D] uppercase tracking-wide">
                      {col.title}
                    </h3>
                    <p className="text-[10px] text-gray-500 font-medium">{col.subtitle}</p>
                  </div>
                  <span
                    className={`text-xs font-black px-2.5 py-0.5 rounded-full tabular-nums ${col.badgeBg}`}
                  >
                    {items.length}
                  </span>
                </div>

                <div className="space-y-2.5 flex-1">
                  {items.length === 0 ? (
                    <div className="text-center py-10 px-3 text-xs text-gray-400 border border-dashed border-gray-300 rounded-xl">
                      Nenhum frete nesta etapa
                    </div>
                  ) : (
                    items.map((f) => {
                      const verifCount = countCompletedVerifications(f);
                      return (
                        <div
                          key={f.id}
                          onClick={() => handleSelectFreight(f)}
                          className="bg-white rounded-xl p-3.5 border border-gray-200/90 shadow-2xs hover:shadow-md hover:border-[#FFD400] transition cursor-pointer space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <span className="bg-[#080B0D] text-[#FFD400] text-[11px] font-black px-2 py-0.5 rounded">
                              {f.protocol}
                            </span>
                            <span className="text-[10px] font-extrabold text-gray-600">
                              {verifCount}/5 verificações
                            </span>
                          </div>
                          <div>
                            <p className="text-xs font-extrabold text-[#15191D]">{f.cliente}</p>
                            <p className="text-[11px] text-gray-600">
                              {f.origemCidadeUf} → {f.destinoCidadeUf}
                            </p>
                          </div>
                          <div className="pt-1 border-t border-gray-100 flex items-center justify-between text-[10px] text-gray-500">
                            <span>Coleta: {formatIsoDateBr(f.dataColetaIso)}</span>
                            <span className="font-bold text-[#15191D]">
                              {f.motoristaNome || 'Definir motorista'}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* =====================================================================
          MODAL: PREPARAÇÃO OPERACIONAL DO FRETE — EXPEDIÇÃO (CORPORATEMODAL)
      ===================================================================== */}
      {selectedFreight && (
        <CorporateModal
          isOpen={Boolean(selectedFreight)}
          onClose={() => setSelectedFreight(null)}
          title={`Frete ${selectedFreight.protocol} — ${selectedFreight.cliente}`}
          subtitle={`Rota: ${selectedFreight.origemCidadeUf} → ${selectedFreight.destinoCidadeUf} • Comercial: ${selectedFreight.comercialResponsavelNome} • Expedição: ${selectedFreight.expedicaoResponsavelNome || currentUser.name}`}
          maxWidth="2xl"
          badge={
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className={`text-[11px] font-extrabold px-2.5 py-0.5 rounded-md border ${getOperationalBadgeStyle(
                  selectedFreight.situacaoOperacional
                )}`}
              >
                {formatSituacaoOperacionalLabel(selectedFreight.situacaoOperacional)}
              </span>
              {selectedFreight.situacaoOperacional === 'LIBERADO_MONITORAMENTO' && (
                <span className="text-[11px] font-extrabold px-2.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-200">
                  {formatSituacaoMonitoramentoLabel(selectedFreight.situacaoMonitoramento)}
                </span>
              )}
              {selectedFreight.situacaoOperacional === 'CANCELADO' && canReactivate && (
                <button
                  type="button"
                  onClick={() => {
                    setTargetReactivateFreight(selectedFreight);
                    setReactivateMotivo('');
                    setShowReactivateModal(true);
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-[#FFD400] hover:bg-[#ffdf33] text-[#080B0D] font-extrabold text-[11px] rounded-md cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reativar Frete</span>
                </button>
              )}
            </div>
          }
          footer={
            <div className="flex flex-wrap items-center justify-between w-full gap-3">
              <div className="text-[11px] text-gray-500">
                Campos marcados com <span className="text-[#E5252A] font-bold">*</span> são obrigatórios para liberação ao Monitoramento.
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedFreight(null)}
                  className="px-4 py-2 rounded-xl border border-gray-300 text-gray-700 font-bold text-xs hover:bg-gray-100 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={savingOp}
                  onClick={() => void persistPreparationData()}
                  className="px-4 py-2 rounded-xl border border-gray-900 bg-white hover:bg-gray-100 text-[#080B0D] font-extrabold text-xs flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  {savingOp ? 'Salvando...' : 'Salvar Dados de Preparação'}
                </button>
                <button
                  type="button"
                  disabled={actionBusy || savingOp}
                  onClick={handleLiberarParaMonitoramento}
                  className="px-5 py-2 rounded-xl bg-[#FFD400] hover:bg-[#ffdf33] text-[#080B0D] font-black text-xs shadow-xs flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  {selectedFreight.situacaoOperacional === 'LIBERADO_MONITORAMENTO'
                    ? 'Atualizar Liberação no Monitoramento'
                    : 'Confirmar e Liberar p/ Monitoramento'}
                </button>
              </div>
            </div>
          }
        >
          <div className="space-y-5 text-xs">
            {/* Error & Missing Items Banner inside Modal */}
            {errorMsg && (
              <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-900 text-xs flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <div className="font-bold flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-[#E5252A] shrink-0" />
                    <span>{errorMsg}</span>
                  </div>
                  {validationMissingItems.length > 0 && (
                    <ul className="list-disc list-inside text-[11px] text-red-800 space-y-0.5 pl-1">
                      {validationMissingItems.map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setErrorMsg(null);
                    setValidationMissingItems([]);
                  }}
                  className="text-red-700 hover:text-red-950 font-black cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Claim banner if in shared queue */}
            {selectedFreight.situacaoOperacional === 'DISPONIVEL_FILA' && (
              <div className="bg-purple-50 border border-purple-200 rounded-2xl p-4 flex items-center justify-between gap-3">
                <div className="text-xs text-purple-950">
                  <p className="font-extrabold">Frete disponível na fila compartilhada</p>
                  <p className="text-[11px]">
                    Assuma este frete para vincular à sua responsabilidade na Expedição.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={() => void handleClaimFreight(selectedFreight)}
                  className="bg-[#FFD400] hover:bg-[#ffdf33] text-[#080B0D] text-xs font-extrabold px-4 py-2 rounded-xl shadow-xs shrink-0 cursor-pointer"
                >
                  Assumir agora
                </button>
              </div>
            )}

            {/* Modal Sub-navigation Tabs */}
            <div className="flex flex-wrap gap-1.5 bg-[#F3F5F7] p-1.5 rounded-xl border border-gray-200">
              {[
                { id: 'PREPARACAO', label: '1. Dados Operacionais' },
                {
                  id: 'VERIFICACOES',
                  label: `2. Verificações (${countCompletedVerifications(selectedFreight)}/5)`,
                },
                {
                  id: 'ANEXOS',
                  label: `Anexos (${detailAnexos.length})`,
                },
                {
                  id: 'OCORRENCIAS',
                  label: `Ocorrências (${selectedFreight.ocorrenciasAbertasCount})`,
                },
                {
                  id: 'HISTORICO',
                  label: 'Histórico',
                },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveDetailTab(tab.id as typeof activeDetailTab)}
                  className={`px-3.5 py-2 text-xs font-extrabold rounded-lg transition cursor-pointer whitespace-nowrap ${
                    activeDetailTab === tab.id
                      ? 'bg-[#080B0D] text-[#FFD400] shadow-xs'
                      : 'text-gray-600 hover:text-[#15191D] hover:bg-white/60'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* TAB 1: PREPARAÇÃO OPERACIONAL (CARDS 1 A 4 IGUAIS AO COMERCIAL) */}
            {activeDetailTab === 'PREPARACAO' && (
              <div className="space-y-4">
                <div className="p-3 rounded-xl bg-amber-50/90 border border-amber-200 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs text-amber-950">
                    <strong>Preencher por Script (WhatsApp):</strong> Importe motorista, telefone, frete motorista, favorecido, PIX, banco e observações (campos ausentes permanecem em branco).
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsScriptModalOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#080B0D] text-[#FFD400] font-extrabold text-xs hover:bg-slate-800 cursor-pointer"
                  >
                    <ClipboardPaste className="w-3.5 h-3.5" />
                    Importar Script
                  </button>
                </div>

                {/* CARD 1: ROTA, COLETA, ENTREGA E CARGA */}
                <div className="bg-[#F8FAFC] border border-gray-200/90 rounded-2xl p-4 space-y-3.5 shadow-2xs">
                  <div className="flex items-center justify-between pb-2 border-b border-gray-200">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-[#FFD400] text-[#080B0D] font-black flex items-center justify-center text-xs">
                        1
                      </div>
                      <h3 className="font-black text-sm text-[#080B0D] uppercase tracking-wide">
                        Coleta, Entrega, Carga e Veículo
                      </h3>
                    </div>
                    <span className="text-[11px] font-bold text-gray-500">
                      {selectedFreight.origemCidadeUf} → {selectedFreight.destinoCidadeUf}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-bold text-gray-700 mb-1">
                        Endereço de Coleta ({selectedFreight.origemCidadeUf}){' '}
                        <span className="text-[#E5252A]">*</span>
                      </label>
                      <input
                        type="text"
                        value={opEnderecoColeta}
                        onChange={(e) => setOpEnderecoColeta(e.target.value)}
                        placeholder="Rua, número, galpão, doca..."
                        className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-xs focus:outline-none focus:border-[#FFD400]"
                      />
                    </div>

                    <div className="sm:col-span-2 rounded-xl border border-gray-200 bg-white p-3 text-xs text-gray-600">
                      <strong className="text-[#080B0D]">Endereço de entrega — Monitoramento:</strong>{' '}
                      <span>
                        {selectedFreight.enderecoEntrega ||
                          'A confirmar e registrar pelo operador de Monitoramento.'}
                      </span>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-gray-700 mb-1">
                        Contato Local Coleta/Entrega
                      </label>
                      <input
                        type="text"
                        value={opClienteContato}
                        onChange={(e) => setOpClienteContato(e.target.value)}
                        placeholder="Nome e telefone"
                        className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-xs focus:outline-none focus:border-[#FFD400]"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-bold text-gray-700 mb-1">
                          Janela Início
                        </label>
                        <input
                          type="text"
                          value={opJanelaColetaInicio}
                          onChange={(e) => setOpJanelaColetaInicio(e.target.value)}
                          placeholder="08:00"
                          className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-xs font-semibold focus:outline-none focus:border-[#FFD400]"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-gray-700 mb-1">
                          Janela Fim
                        </label>
                        <input
                          type="text"
                          value={opJanelaColetaFim}
                          onChange={(e) => setOpJanelaColetaFim(e.target.value)}
                          placeholder="18:00"
                          className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-xs font-semibold focus:outline-none focus:border-[#FFD400]"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-gray-700 mb-1">
                        Previsão de Entrega
                      </label>
                      <input
                        type="date"
                        value={opDataEntregaPrevistaIso}
                        onChange={(e) => setOpDataEntregaPrevistaIso(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-xs font-semibold focus:outline-none focus:border-[#FFD400]"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-gray-700 mb-1">
                        Material / Descrição da Carga <span className="text-[#E5252A]">*</span>
                      </label>
                      <input
                        type="text"
                        value={opTipoCarga}
                        onChange={(e) => setOpTipoCarga(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-xs focus:outline-none focus:border-[#FFD400]"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-gray-700 mb-1">
                        Peso Estimado (kg) <span className="text-[#E5252A]">*</span>
                      </label>
                      <input
                        type="number"
                        value={opPesoKg}
                        onChange={(e) => setOpPesoKg(e.target.value)}
                        placeholder="Ex.: 28000"
                        className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-xs focus:outline-none focus:border-[#FFD400]"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-gray-700 mb-1">
                        Volumes / Paletes
                      </label>
                      <input
                        type="number"
                        value={opVolumes}
                        onChange={(e) => setOpVolumes(e.target.value)}
                        placeholder="Ex.: 24"
                        className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-xs focus:outline-none focus:border-[#FFD400]"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-bold text-gray-700 mb-1">
                        Tipo de Veículo Exigido <span className="text-[#E5252A]">*</span>
                      </label>
                      <input
                        type="text"
                        value={opVeiculoNecessario}
                        onChange={(e) => setOpVeiculoNecessario(e.target.value)}
                        placeholder="Ex.: Carreta Sider, Bitrem, Truck Baú..."
                        className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-xs focus:outline-none focus:border-[#FFD400]"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-bold text-gray-700 mb-1">
                        Instruções de Coleta e Entrega (impressas na Ordem de Coleta)
                      </label>
                      <textarea
                        rows={2}
                        value={opInstrucoesColetaEntrega}
                        onChange={(e) => setOpInstrucoesColetaEntrega(e.target.value)}
                        placeholder="EPIs obrigatórios, doca de apresentação, contato na portaria..."
                        className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-xs focus:outline-none focus:border-[#FFD400]"
                      />
                    </div>
                  </div>
                </div>

                {/* CARD 2: MOTORISTA, TRANSPORTADORA E PLACAS */}
                <div className="bg-[#F8FAFC] border border-gray-200/90 rounded-2xl p-4 space-y-3.5 shadow-2xs">
                  <div className="flex items-center gap-2 pb-2 border-b border-gray-200">
                    <div className="w-6 h-6 rounded-lg bg-[#FFD400] text-[#080B0D] font-black flex items-center justify-center text-xs">
                      2
                    </div>
                    <h3 className="font-black text-sm text-[#080B0D] uppercase tracking-wide">
                      Motorista, Transportadora e Placas
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-1">
                      <label className="block text-[11px] font-bold text-gray-700 mb-1">
                        Nome Completo do Motorista <span className="text-[#E5252A]">*</span>
                      </label>
                      <input
                        type="text"
                        id="exp-driver-name"
                        value={opMotoristaNome}
                        onChange={(e) => setOpMotoristaNome(e.target.value)}
                        placeholder="Ex.: José Carlos Pereira"
                        className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl font-bold text-xs focus:outline-none focus:border-[#FFD400]"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-gray-700 mb-1">
                        CPF do Motorista <span className="text-[#E5252A]">*</span>
                      </label>
                      <input
                        type="text"
                        id="exp-driver-cpf"
                        value={opMotoristaCpf}
                        onChange={(e) => setOpMotoristaCpf(e.target.value)}
                        placeholder="000.000.000-00"
                        className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl font-mono text-xs focus:outline-none focus:border-[#FFD400]"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-gray-700 mb-1">
                        Telefone / WhatsApp <span className="text-[#E5252A]">*</span>
                      </label>
                      <input
                        type="text"
                        id="exp-driver-phone"
                        value={opMotoristaTelefone}
                        onChange={(e) => setOpMotoristaTelefone(e.target.value)}
                        placeholder="(71) 9 8845-1290"
                        className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-xs focus:outline-none focus:border-[#FFD400]"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-gray-700 mb-1">
                        Transportadora / Proprietário
                      </label>
                      <input
                        type="text"
                        value={opTransportadorNome}
                        onChange={(e) => setOpTransportadorNome(e.target.value)}
                        placeholder="Razão social ou nome"
                        className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-xs focus:outline-none focus:border-[#FFD400]"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-gray-700 mb-1">
                        CNPJ / CPF Proprietário
                      </label>
                      <input
                        type="text"
                        value={opTransportadorDoc}
                        onChange={(e) => setOpTransportadorDoc(e.target.value)}
                        placeholder="00.000.000/0001-00"
                        className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl font-mono text-xs focus:outline-none focus:border-[#FFD400]"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-bold text-gray-700 mb-1">
                          Placa Veículo <span className="text-[#E5252A]">*</span>
                        </label>
                        <input
                          type="text"
                          id="exp-vehicle-plate"
                          value={opPlacaVeiculo}
                          onChange={(e) => setOpPlacaVeiculo(e.target.value.toUpperCase())}
                          placeholder="ABC-1D23"
                          className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-xs font-mono uppercase font-bold focus:outline-none focus:border-[#FFD400]"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-gray-700 mb-1">
                          Placa Carreta
                        </label>
                        <input
                          type="text"
                          value={opPlacaCarreta}
                          onChange={(e) => setOpPlacaCarreta(e.target.value.toUpperCase())}
                          placeholder="XYZ-9E87"
                          className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-xs font-mono uppercase focus:outline-none focus:border-[#FFD400]"
                        />
                      </div>
                    </div>
                  </div>

                  {/* DADOS COMPLEMENTARES PARA ORDEM DE COLETA (RG/CNH/BITREM/REMETENTE/DESTINATÁRIO/CARGA) */}
                  <div className="pt-2 border-t border-gray-200/80">
                    <button
                      type="button"
                      onClick={() => setShowComplementosOrdem((prev) => !prev)}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-white border border-gray-200 hover:border-[#FFD400] text-xs font-extrabold text-[#15191D] cursor-pointer transition"
                    >
                      <span>
                        Dados complementares da Ordem de Coleta (RG/CNH, Bitrem, Remetente/Destinatário, Pedido/Orçamento)
                      </span>
                      {showComplementosOrdem ? (
                        <ChevronUp className="w-4 h-4 text-gray-500" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-gray-500" />
                      )}
                    </button>

                    {showComplementosOrdem && (
                      <div className="mt-3 p-3.5 bg-white rounded-xl border border-gray-200 space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                          <div>
                            <label className="block text-[11px] font-bold text-gray-700 mb-1">RG do Motorista</label>
                            <input
                              type="text"
                              value={opMotoristaRg}
                              onChange={(e) => setOpMotoristaRg(e.target.value)}
                              placeholder="Número do RG"
                              className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded-lg text-xs"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-bold text-gray-700 mb-1">CNH do Motorista</label>
                            <input
                              type="text"
                              value={opMotoristaCnh}
                              onChange={(e) => setOpMotoristaCnh(e.target.value)}
                              placeholder="Registro CNH"
                              className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded-lg text-xs"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-bold text-gray-700 mb-1">Placa Bitrem / Dolly</label>
                            <input
                              type="text"
                              value={opPlacaBitrem}
                              onChange={(e) => setOpPlacaBitrem(e.target.value.toUpperCase())}
                              placeholder="Opcional"
                              className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-mono uppercase"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-bold text-gray-700 mb-1">Pedido Nº</label>
                            <input
                              type="text"
                              value={opNumeroPedido}
                              onChange={(e) => setOpNumeroPedido(e.target.value)}
                              placeholder="Opcional"
                              className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded-lg text-xs"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-bold text-gray-700 mb-1">Orçamento Nº</label>
                            <input
                              type="text"
                              value={opNumeroOrcamento}
                              onChange={(e) => setOpNumeroOrcamento(e.target.value)}
                              placeholder="Opcional"
                              className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded-lg text-xs"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-bold text-gray-700 mb-1">Qtd. Entregas</label>
                            <input
                              type="number"
                              min={1}
                              value={opQuantidadeEntregas}
                              onChange={(e) => setOpQuantidadeEntregas(e.target.value)}
                              className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded-lg text-xs"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-bold text-gray-700 mb-1">Espécie da Carga</label>
                            <input
                              type="text"
                              value={opEspecieCarga}
                              onChange={(e) => setOpEspecieCarga(e.target.value)}
                              placeholder="Ex.: Carga Geral, Granel"
                              className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded-lg text-xs"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-bold text-gray-700 mb-1">Embalagem</label>
                            <input
                              type="text"
                              value={opEmbalagemCarga}
                              onChange={(e) => setOpEmbalagemCarga(e.target.value)}
                              placeholder="Ex.: Paletizada, Big Bag"
                              className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded-lg text-xs"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-bold text-gray-700 mb-1">Valor da Mercadoria (R$)</label>
                            <input
                              type="text"
                              value={opValorMercadoriaReais}
                              onChange={(e) => setOpValorMercadoriaReais(e.target.value)}
                              placeholder="Ex.: 85.000,00"
                              className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded-lg text-xs"
                            />
                          </div>
                          <div className="sm:col-span-3">
                            <label className="block text-[11px] font-bold text-gray-700 mb-1">Ponto de Referência</label>
                            <input
                              type="text"
                              value={opPontoReferencia}
                              onChange={(e) => setOpPontoReferencia(e.target.value)}
                              placeholder="Referência para chegada do motorista no local de coleta/entrega"
                              className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded-lg text-xs"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-gray-100">
                          <div className="space-y-2">
                            <p className="text-[11px] font-black text-gray-700 uppercase">Remetente (Coleta)</p>
                            <input type="text" value={opRemetenteNome} onChange={(e) => setOpRemetenteNome(e.target.value)} placeholder="Razão Social / Nome (padrão: Cliente)" className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs" />
                            <input type="text" value={opRemetenteEndereco} onChange={(e) => setOpRemetenteEndereco(e.target.value)} placeholder="Endereço completo do remetente" className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs" />
                            <div className="grid grid-cols-2 gap-2">
                              <input type="text" value={opRemetenteBairro} onChange={(e) => setOpRemetenteBairro(e.target.value)} placeholder="Bairro" className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs" />
                              <input type="text" value={opRemetenteTelefone} onChange={(e) => setOpRemetenteTelefone(e.target.value)} placeholder="Telefone" className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs" />
                              <input type="text" value={opRemetenteMunicipio} onChange={(e) => setOpRemetenteMunicipio(e.target.value)} placeholder="Município/UF" className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs" />
                              <input type="text" value={opRemetenteCep} onChange={(e) => setOpRemetenteCep(e.target.value)} placeholder="CEP" className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs" />
                              <input type="text" value={opRemetenteCnpjCpf} onChange={(e) => setOpRemetenteCnpjCpf(e.target.value)} placeholder="CNPJ / CPF" className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs" />
                              <input type="text" value={opRemetenteIe} onChange={(e) => setOpRemetenteIe(e.target.value)} placeholder="IE" className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs" />
                            </div>
                          </div>

                          <div className="space-y-2">
                            <p className="text-[11px] font-black text-gray-700 uppercase">Destinatário (Entrega)</p>
                            <input type="text" value={opDestinatarioNome} onChange={(e) => setOpDestinatarioNome(e.target.value)} placeholder="Razão Social / Nome do destinatário" className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs" />
                            <input type="text" value={opDestinatarioEndereco} onChange={(e) => setOpDestinatarioEndereco(e.target.value)} placeholder="Endereço completo do destinatário" className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs" />
                            <div className="grid grid-cols-2 gap-2">
                              <input type="text" value={opDestinatarioBairro} onChange={(e) => setOpDestinatarioBairro(e.target.value)} placeholder="Bairro" className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs" />
                              <input type="text" value={opDestinatarioTelefone} onChange={(e) => setOpDestinatarioTelefone(e.target.value)} placeholder="Telefone" className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs" />
                              <input type="text" value={opDestinatarioMunicipio} onChange={(e) => setOpDestinatarioMunicipio(e.target.value)} placeholder="Município/UF" className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs" />
                              <input type="text" value={opDestinatarioCep} onChange={(e) => setOpDestinatarioCep(e.target.value)} placeholder="CEP" className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs" />
                              <input type="text" value={opDestinatarioCnpjCpf} onChange={(e) => setOpDestinatarioCnpjCpf(e.target.value)} placeholder="CNPJ / CPF" className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs" />
                              <input type="text" value={opDestinatarioIe} onChange={(e) => setOpDestinatarioIe(e.target.value)} placeholder="IE" className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs" />
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* CARD 3: VALORES DO MOTORISTA, DADOS P/ FINANCEIRO E CONDIÇÕES */}
                <div className="bg-[#F8FAFC] border border-gray-200/90 rounded-2xl p-4 space-y-3.5 shadow-2xs">
                  <div className="flex items-center justify-between pb-2 border-b border-gray-200">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-[#FFD400] text-[#080B0D] font-black flex items-center justify-center text-xs">
                        3
                      </div>
                      <h3 className="font-black text-sm text-[#080B0D] uppercase tracking-wide">
                        Valor do Motorista, Condições e Dados p/ Financeiro
                      </h3>
                    </div>
                    {typeof selectedFreight.valorCobradoClienteCentavos === 'number' && (
                      <span className="text-[11px] font-bold text-gray-600 bg-white px-2.5 py-1 rounded-lg border border-gray-200">
                        Cliente:{' '}
                        <strong className="text-[#080B0D]">
                          {formatCentavosToBrl(selectedFreight.valorCobradoClienteCentavos)}
                        </strong>
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-gray-700 mb-1">
                        Valor Contratado Motorista (R$) <span className="text-[#E5252A]">*</span>
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-2.5 text-xs font-bold text-gray-400">
                          R$
                        </span>
                        <input
                          type="text"
                          id="exp-driver-value"
                          value={opValorContratadoReais}
                          onChange={(e) => setOpValorContratadoReais(e.target.value)}
                          placeholder="6.000,00"
                          className="w-full pl-9 pr-3 py-2 bg-white border border-gray-300 rounded-xl font-black text-sm text-[#080B0D] focus:outline-none focus:border-[#FFD400]"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-gray-700 mb-1">
                        Condições de Pagamento <span className="text-[#E5252A]">*</span>
                      </label>
                      <select
                        id="exp-payment-mode"
                        value={opCondicoesPagamento}
                        onChange={(e) => setOpCondicoesPagamento(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs font-bold bg-white text-[#080B0D] focus:outline-none focus:border-[#FFD400]"
                      >
                        <option value="">Selecione a modalidade</option>
                        {[
                          '70% Adiantamento / 30% Saldo na Entrega',
                          '80% Adiantamento / 20% Saldo na Entrega',
                          'Integral (100%)',
                        ].map((mode) => (
                          <option key={mode} value={mode}>
                            {mode}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-gray-700 mb-1">
                        Favorecido Pagamento
                      </label>
                      <input
                        type="text"
                        value={opFavorecidoPagamento}
                        onChange={(e) => setOpFavorecidoPagamento(e.target.value)}
                        placeholder="Nome do favorecido"
                        className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-xs focus:outline-none focus:border-[#FFD400]"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-gray-700 mb-1">
                        Banco
                      </label>
                      <input
                        type="text"
                        value={opBancoPagamento}
                        onChange={(e) => setOpBancoPagamento(e.target.value)}
                        placeholder="Ex.: 260 - Nu Pagamentos"
                        className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-xs focus:outline-none focus:border-[#FFD400]"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-gray-700 mb-1">
                        Tipo Chave Pix
                      </label>
                      <select
                        value={opTipoChavePix}
                        onChange={(e) => setOpTipoChavePix(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-xs font-bold text-[#080B0D] focus:outline-none focus:border-[#FFD400]"
                      >
                        <option value="CPF/CNPJ">CPF/CNPJ</option>
                        <option value="Celular">Celular</option>
                        <option value="E-mail">E-mail</option>
                        <option value="Chave Aleatória">Chave Aleatória</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-gray-700 mb-1">
                        Chave Pix
                      </label>
                      <input
                        type="text"
                        value={opChavePix}
                        onChange={(e) => setOpChavePix(e.target.value)}
                        placeholder="Chave Pix do favorecido"
                        className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-xs focus:outline-none focus:border-[#FFD400]"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label
                        htmlFor="exp-operational-conditions"
                        className="block text-[11px] font-bold text-gray-700 mb-1"
                      >
                        Condições Operacionais <span className="text-[#E5252A]">*</span>
                      </label>
                      <textarea
                        id="exp-operational-conditions"
                        rows={2}
                        minLength={3}
                        maxLength={1000}
                        value={opCondicoesOperacionais}
                        onChange={(e) => setOpCondicoesOperacionais(e.target.value)}
                        aria-describedby="exp-operational-conditions-help"
                        placeholder="Informe as condições acordadas para a operação, exigências de coleta e orientações ao motorista."
                        className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-xs focus:outline-none focus:border-[#FFD400]"
                      />
                      <p
                        id="exp-operational-conditions-help"
                        className="text-[11px] text-gray-500 mt-1"
                      >
                        Obrigatório para liberar ao Monitoramento. As condições de pagamento são informadas no campo específico acima.
                      </p>
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-bold text-gray-700 mb-1">
                        Observações Internas da Expedição (não saem na Ordem de Coleta)
                      </label>
                      <textarea
                        rows={2}
                        value={opObservacoes}
                        onChange={(e) => setOpObservacoes(e.target.value)}
                        placeholder="Anotações internas operacionais..."
                        className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-xs focus:outline-none focus:border-[#FFD400]"
                      />
                    </div>
                  </div>
                </div>

                {/* CARD 4: ENCAMINHAMENTO AO MONITORAMENTO E CONFERÊNCIA */}
                <div className="bg-[#F8FAFC] border border-gray-200/90 rounded-2xl p-4 space-y-3.5 shadow-2xs">
                  <div className="flex items-center gap-2 pb-2 border-b border-gray-200">
                    <div className="w-6 h-6 rounded-lg bg-[#FFD400] text-[#080B0D] font-black flex items-center justify-center text-xs">
                      4
                    </div>
                    <h3 className="font-black text-sm text-[#080B0D] uppercase tracking-wide">
                      Encaminhamento ao Monitoramento & Verificações
                    </h3>
                  </div>

                  <div className="p-3.5 bg-white border border-gray-200 rounded-xl grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                    <div>
                      <label className="block text-[11px] font-extrabold text-[#080B0D] mb-1">
                        Operador de Monitoramento Responsável <span className="text-[#E5252A]">*</span>
                      </label>
                      <select
                        value={opMonitoramentoResponsavelId}
                        onChange={(e) => setOpMonitoramentoResponsavelId(e.target.value)}
                        className="w-full px-3 py-2 bg-[#F8FAFC] border border-gray-300 rounded-lg text-xs font-bold text-[#080B0D]"
                      >
                        <option value="">Selecione o Operador de Monitoramento...</option>
                        {monitoramentoOperators.map((op) => (
                          <option key={op.id} value={op.id}>
                            {op.name} ({op.roleTitle} • {op.department})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-col gap-2">
                      <p className="text-[11px] font-extrabold text-[#080B0D]">
                        Status das 5 Verificações Obrigatórias: ({countCompletedVerifications(selectedFreight)}/5)
                      </p>
                      <button
                        type="button"
                        onClick={() => setActiveDetailTab('VERIFICACOES')}
                        className="bg-[#080B0D] hover:bg-gray-800 text-[#FFD400] font-extrabold py-2 px-3 rounded-xl transition cursor-pointer text-xs text-center"
                      >
                        Abrir Aba 2: Verificações e Ordem de Coleta →
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: AS 5 VERIFICAÇÕES FUNCIONAIS, ORDEM DE COLETA E LIBERAÇÃO */}
            {activeDetailTab === 'VERIFICACOES' && (
              <div className="space-y-3.5">
                <div className="bg-[#F8FAFC] rounded-2xl p-4 border border-gray-200 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-black text-[#15191D] uppercase tracking-wider">
                        5 Verificações Obrigatórias da Expedição
                      </p>
                      <p className="text-[11px] text-gray-500">
                        Cada marcação é persistida imediatamente no servidor.
                      </p>
                    </div>
                    <span
                      className={`text-xs font-black px-2.5 py-0.5 rounded-md ${
                        countCompletedVerifications(selectedFreight) === 5
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-900'
                      }`}
                    >
                      {countCompletedVerifications(selectedFreight)}/5 concluídas
                    </span>
                  </div>

                  {/* 1. Dados do motorista conferidos */}
                  <label className="flex items-start gap-2.5 p-3 rounded-xl bg-white border border-gray-200 cursor-pointer hover:border-[#FFD400]">
                    <input
                      type="checkbox"
                      checked={chkMotorista}
                      disabled={savingOp || actionBusy}
                      onChange={(e) => void handleToggleVerification('MOTORISTA', e.target.checked)}
                      className="mt-0.5 rounded text-[#080B0D] focus:ring-[#FFD400]"
                    />
                    <div className="flex-1">
                      <span className="font-extrabold text-[#15191D] block">
                        1. Dados do motorista conferidos
                      </span>
                      <span className="text-[11px] text-gray-500">
                        Nome ({opMotoristaNome || 'pendente'}), CPF ({opMotoristaCpf || 'pendente'}) e telefone validados.
                      </span>
                    </div>
                  </label>

                  {/* 2. Veículo conferido */}
                  <label className="flex items-start gap-2.5 p-3 rounded-xl bg-white border border-gray-200 cursor-pointer hover:border-[#FFD400]">
                    <input
                      type="checkbox"
                      checked={chkVeiculo}
                      disabled={savingOp || actionBusy}
                      onChange={(e) => void handleToggleVerification('VEICULO', e.target.checked)}
                      className="mt-0.5 rounded text-[#080B0D] focus:ring-[#FFD400]"
                    />
                    <div className="flex-1">
                      <span className="font-extrabold text-[#15191D] block">
                        2. Veículo conferido
                      </span>
                      <span className="text-[11px] text-gray-500">
                        Placa ({opPlacaVeiculo || 'pendente'}), implemento e tipo de veículo ({opVeiculoNecessario || 'pendente'}) compatíveis.
                      </span>
                    </div>
                  </label>

                  {/* 3. Condições e documentos conferidos */}
                  <label className="flex items-start gap-2.5 p-3 rounded-xl bg-white border border-gray-200 cursor-pointer hover:border-[#FFD400]">
                    <input
                      type="checkbox"
                      checked={chkCondicoesEDocs}
                      disabled={savingOp || actionBusy}
                      onChange={(e) =>
                        void handleToggleVerification('CONDICOES_DOCS', e.target.checked)
                      }
                      className="mt-0.5 rounded text-[#080B0D] focus:ring-[#FFD400]"
                    />
                    <div className="flex-1">
                      <span className="font-extrabold text-[#15191D] block">
                        3. Condições e documentos conferidos
                      </span>
                      <span className="text-[11px] text-gray-500">
                        CNH, CRLV, ANTT e condições de pagamento conferidos pela Expedição.
                      </span>
                    </div>
                  </label>

                  {/* 4. Videochamada realizada com o motorista */}
                  <div className="p-3 rounded-xl bg-white border border-gray-200 space-y-2">
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={chkVideochamada}
                        disabled={savingOp || actionBusy}
                        onChange={(e) =>
                          void handleToggleVerification('VIDEOCHAMADA', e.target.checked)
                        }
                        className="mt-0.5 rounded text-[#080B0D] focus:ring-[#FFD400]"
                      />
                      <div className="flex-1">
                        <span className="font-extrabold text-[#15191D] flex items-center gap-1.5">
                          <Video className="w-3.5 h-3.5 text-blue-600" />
                          4. Videochamada realizada com o motorista
                        </span>
                        <span className="text-[11px] text-gray-500 block">
                          A videochamada ocorre fora do sistema (WhatsApp/telefone). Registre aqui a realização e observações.
                        </span>
                        {selectedFreight.checklistFechamento?.videochamadaRealizadaPorNome && (
                          <span className="block text-[10px] text-emerald-700 font-semibold mt-0.5">
                            Realizada por{' '}
                            {selectedFreight.checklistFechamento.videochamadaRealizadaPorNome} em{' '}
                            {selectedFreight.checklistFechamento.videochamadaRealizadaEm}
                          </span>
                        )}
                      </div>
                    </label>
                    <div className="pl-6 flex gap-1.5">
                      <input
                        type="text"
                        value={chkVideochamadaObs}
                        onChange={(e) => setChkVideochamadaObs(e.target.value)}
                        placeholder="Observações da videochamada (identidade, caminhão no pátio, EPIs)..."
                        className="flex-1 px-3 py-1.5 rounded-lg border border-gray-300 text-xs"
                      />
                      <button
                        type="button"
                        disabled={savingOp}
                        onClick={() =>
                          void persistPreparationData({
                            overrideChecklist: {
                              videochamadaRealizada: true,
                              videochamadaObservacoes: chkVideochamadaObs,
                            },
                          })
                        }
                        className="bg-[#080B0D] text-[#FFD400] font-extrabold px-3 py-1.5 rounded-lg text-[11px] cursor-pointer shrink-0"
                      >
                        Registrar
                      </button>
                    </div>
                  </div>

                  {/* 5. Ordem de coleta enviada ao motorista */}
                  <div className="p-3 rounded-xl bg-white border border-gray-200 space-y-2">
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={chkOrdemEnviada}
                        disabled={savingOp || actionBusy}
                        onChange={(e) =>
                          void handleToggleVerification('ORDEM_ENVIADA', e.target.checked)
                        }
                        className="mt-0.5 rounded text-[#080B0D] focus:ring-[#FFD400]"
                      />
                      <div className="flex-1">
                        <span className="font-extrabold text-[#15191D] block">
                          5. Ordem de coleta enviada ao motorista
                        </span>
                        <span className="text-[11px] text-gray-500 block">
                          Gere o PDF oficial da Ordem de Coleta abaixo, envie ao motorista e confirme o envio.
                        </span>
                        {selectedFreight.checklistFechamento?.ordemColetaEnviadaPorNome && (
                          <span className="block text-[10px] text-emerald-700 font-semibold mt-0.5">
                            Confirmado por{' '}
                            {selectedFreight.checklistFechamento.ordemColetaEnviadaPorNome} em{' '}
                            {selectedFreight.checklistFechamento.ordemColetaEnviadaEm}
                          </span>
                        )}
                      </div>
                    </label>

                    <div className="pl-6 space-y-2">
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          disabled={actionBusy}
                          onClick={handleEmitirOrdemColeta}
                          className="inline-flex items-center gap-1.5 bg-[#080B0D] hover:bg-gray-800 text-[#FFD400] font-extrabold px-3 py-1.5 rounded-lg text-[11px] cursor-pointer"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span>
                            {selectedFreight.ordemCarregamentoEmitidaEm
                              ? `Visualizar / Baixar Ordem (${selectedFreight.empresaMarca === 'VL TRANSPORTES' ? 'VL' : 'RODOVAR'})`
                              : 'Gerar Ordem de Coleta'}
                          </span>
                        </button>

                        {!selectedFreight.ordemCarregamentoNumero && !chkOrdemEnviada && (
                          <button
                            type="button"
                            disabled={actionBusy}
                            onClick={() => {
                              setSkipOrderReason(selectedFreight.ordemColetaIgnoradaMotivo || '');
                              setShowSkipOrderModal(true);
                            }}
                            className="inline-flex items-center gap-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 font-bold px-3 py-1.5 rounded-lg text-[11px] cursor-pointer"
                          >
                            <Clock className="w-3.5 h-3.5" />
                            <span>
                              {selectedFreight.ordemColetaPendente
                                ? 'Ordem pendente (Editar motivo)'
                                : 'Ignorar por enquanto'}
                            </span>
                          </button>
                        )}

                        {selectedFreight.ordemCarregamentoNumero && (
                          <button
                            type="button"
                            onClick={() => void handleShareOrdemColeta(selectedFreight)}
                            className="inline-flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 text-[#15191D] font-bold px-3 py-1.5 rounded-lg text-[11px] cursor-pointer"
                          >
                            <Share2 className="w-3.5 h-3.5" />
                            <span>Compartilhar</span>
                          </button>
                        )}

                        {!chkOrdemEnviada && selectedFreight.ordemCarregamentoNumero && (
                          <button
                            type="button"
                            disabled={actionBusy}
                            onClick={handleConfirmarEnvioOrdemAoMotorista}
                            className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold px-3 py-1.5 rounded-lg text-[11px] cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Confirmar envio ao motorista</span>
                          </button>
                        )}
                      </div>

                      {selectedFreight.ordemColetaPendente && !selectedFreight.ordemCarregamentoNumero && (
                        <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-950 flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="font-extrabold flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5 text-amber-700" />
                              Ordem de coleta pendente
                            </p>
                            <p className="text-[10px] text-amber-800">
                              Adiada por {selectedFreight.ordemColetaIgnoradaPorNome || 'Expedição'} em{' '}
                              {selectedFreight.ordemColetaIgnoradaEm || 'agora'}
                              {selectedFreight.ordemColetaIgnoradaMotivo
                                ? ` • Obs.: ${selectedFreight.ordemColetaIgnoradaMotivo}`
                                : ''}
                              . Você pode liberar para o Monitoramento e emitir a Ordem oficial a qualquer momento.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* AÇÃO PRINCIPAL: SELECIONAR OPERADOR E LIBERAR PARA MONITORAMENTO */}
                <div className="bg-[#FFFDF0] border-2 border-[#FFD400] rounded-2xl p-4 space-y-3">
                  <div>
                    <p className="text-xs font-black text-[#080B0D] uppercase">
                      Liberação para Operador de Monitoramento
                    </p>
                    <p className="text-[11px] text-gray-600">
                      Ao liberar, o mesmo registro ({selectedFreight.protocol}) entra automaticamente em{' '}
                      <strong>Fretes Ativos</strong> na fila do Operador escolhido, que recebe a notificação imediata.
                    </p>
                  </div>

                  <div>
                    <label className="block text-[11px] font-extrabold text-[#15191D] mb-1">
                      Operador de Monitoramento Responsável *
                    </label>
                    <select
                      value={opMonitoramentoResponsavelId}
                      onChange={(e) => setOpMonitoramentoResponsavelId(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-gray-300 bg-white text-xs font-bold text-[#15191D]"
                    >
                      <option value="">Selecione o Operador de Monitoramento...</option>
                      {monitoramentoOperators.map((op) => (
                        <option key={op.id} value={op.id}>
                          {op.name} ({op.roleTitle} • {op.department})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={actionBusy}
                      onClick={handleLiberarParaMonitoramento}
                      className="flex-1 inline-flex items-center justify-center gap-2 bg-[#FFD400] hover:bg-[#ffdf33] text-[#080B0D] font-black py-3 px-4 rounded-xl shadow-md transition cursor-pointer text-xs"
                    >
                      <Send className="w-4 h-4" />
                      <span>
                        {selectedFreight.situacaoOperacional === 'LIBERADO_MONITORAMENTO'
                          ? 'Atualizar Liberação no Monitoramento'
                          : 'Liberar para Monitoramento'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowReturnModal(true)}
                      className="inline-flex items-center justify-center gap-1.5 bg-red-50 hover:bg-red-100 text-[#E5252A] font-extrabold py-2.5 px-3 rounded-xl border border-red-200 transition cursor-pointer text-xs"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Devolver ao Comercial</span>
                    </button>
                  </div>
                </div>

                {/* Transferência de Responsabilidade (Supervisor/Admin) */}
                {isSupervisor && (
                  <form
                    onSubmit={handleTransferExpedicao}
                    className="bg-[#F8FAFC] rounded-xl p-3 border border-gray-200 space-y-2"
                  >
                    <p className="text-[11px] font-extrabold text-[#15191D] uppercase">
                      Transferir Responsabilidade na Expedição
                    </p>
                    <select
                      value={transferTargetId}
                      onChange={(e) => setTransferTargetId(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-gray-300 text-xs bg-white"
                    >
                      <option value="">Selecione o novo responsável da Expedição...</option>
                      {expedicaoOperators.map((op) => (
                        <option key={op.id} value={op.id}>
                          {op.name} ({op.roleTitle})
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={transferMotivo}
                      onChange={(e) => setTransferMotivo(e.target.value)}
                      placeholder="Motivo da transferência..."
                      className="w-full px-2.5 py-1.5 rounded-lg border border-gray-300 text-xs"
                    />
                    <button
                      type="submit"
                      disabled={transferBusy || !transferTargetId || !transferMotivo.trim()}
                      className="bg-[#080B0D] text-[#FFD400] font-extrabold px-3 py-1.5 rounded-lg text-xs cursor-pointer disabled:opacity-50"
                    >
                      Confirmar transferência
                    </button>
                  </form>
                )}
              </div>
            )}

            {/* TAB 3: ANEXOS */}
            {activeDetailTab === 'ANEXOS' && (
              <FreightDocumentsManager
                freight={selectedFreight}
                currentUser={currentUser}
                savedAttachments={detailAnexos}
                canVerify={true}
                onAttachmentsUpdated={(attachments) => {
                  setDetailAnexos(attachments);
                }}
              />
            )}

            {/* TAB 4: OCORRÊNCIAS */}
            {activeDetailTab === 'OCORRENCIAS' && (
              <div className="space-y-3">
                <form
                  onSubmit={handleCreateOccurrence}
                  className="bg-[#F8FAFC] p-4 rounded-2xl border border-gray-200 space-y-2.5"
                >
                  <p className="font-extrabold text-[#15191D]">Registrar Ocorrência</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <input
                      type="text"
                      value={occTitulo}
                      onChange={(e) => setOccTitulo(e.target.value)}
                      placeholder="Título da ocorrência *"
                      className="sm:col-span-2 px-3 py-2 rounded-xl border border-gray-300 text-xs bg-white"
                    />
                    <select
                      value={occSeveridade}
                      onChange={(e) =>
                        setOccSeveridade(e.target.value as 'BAIXA' | 'MEDIA' | 'IMPEDITIVA')
                      }
                      className="px-3 py-2 rounded-xl border border-gray-300 text-xs bg-white font-bold"
                    >
                      <option value="BAIXA">Informativa / Baixa</option>
                      <option value="MEDIA">Atenção / Média</option>
                      <option value="IMPEDITIVA">Impeditiva (Bloqueia)</option>
                    </select>
                  </div>
                  <textarea
                    rows={2}
                    value={occDescricao}
                    onChange={(e) => setOccDescricao(e.target.value)}
                    placeholder="Detalhes da ocorrência..."
                    className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs bg-white"
                  />
                  <button
                    type="submit"
                    disabled={occBusy || !occTitulo.trim()}
                    className="bg-[#080B0D] text-[#FFD400] font-extrabold px-4 py-2 rounded-xl text-xs cursor-pointer disabled:opacity-50"
                  >
                    Registrar Ocorrência
                  </button>
                </form>

                {detailOcorrencias.length === 0 ? (
                  <p className="text-center text-gray-400 py-6">
                    Nenhuma ocorrência registrada neste frete.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {detailOcorrencias.map((occ) => (
                      <div
                        key={occ.id}
                        className={`p-3 rounded-xl border ${
                          !occ.resolved
                            ? occ.severity === 'IMPEDITIVA'
                              ? 'bg-red-50 border-red-200'
                              : 'bg-amber-50 border-amber-200'
                            : 'bg-gray-50 border-gray-200'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-white border">
                                {occ.severity}
                              </span>
                              <span className="text-[10px] font-bold text-gray-500">
                                {occ.resolved ? 'RESOLVIDA' : 'ABERTA'}
                              </span>
                            </div>
                            <p className="font-extrabold text-[#15191D] mt-1">{occ.title}</p>
                            {occ.description && (
                              <p className="text-gray-600 mt-0.5">{occ.description}</p>
                            )}
                            <p className="text-[10px] text-gray-400 mt-1">
                              Por {occ.createdByName} em {occ.createdAtFormatted}
                            </p>
                          </div>
                          {!occ.resolved && (
                            <button
                              type="button"
                              disabled={occBusy}
                              onClick={() => void handleResolveOccurrence(occ.id)}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-extrabold px-2.5 py-1 rounded-lg cursor-pointer shrink-0"
                            >
                              Resolver
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB 5: HISTÓRICO */}
            {activeDetailTab === 'HISTORICO' && (
              <div className="space-y-2">
                {detailHistorico.map((h) => (
                  <div
                    key={h.id}
                    className="p-3 rounded-xl bg-[#F8FAFC] border border-gray-200"
                  >
                    <div className="flex items-center justify-between text-[10px] text-gray-400">
                      <span className="font-bold text-gray-600">
                        {h.actorName} ({h.actorSector})
                      </span>
                      <span>{h.timestampFormatted}</span>
                    </div>
                    <p className="font-bold text-[#15191D] mt-0.5">{h.summary}</p>
                    {h.horarioRealEvento && (
                      <p className="text-[11px] font-semibold text-blue-800 mt-0.5">
                        Horário real do evento: {h.horarioRealEvento}
                      </p>
                    )}
                    {h.reason && <p className="text-[11px] text-gray-600">{h.reason}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </CorporateModal>
      )}

      {/* =====================================================================
          MODAL: DEVOLVER AO COMERCIAL
      ===================================================================== */}
      {showReturnModal && selectedFreight && (
        <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleReturnToComercial}
            className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-3"
          >
            <div className="flex items-center justify-between pb-2 border-b border-gray-100">
              <h3 className="text-sm font-black text-[#15191D]">
                Devolver Frete {selectedFreight.protocol} ao Comercial
              </h3>
              <button
                type="button"
                onClick={() => setShowReturnModal(false)}
                className="text-gray-400 hover:text-gray-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-gray-600">
              Informe o motivo da devolução para que o responsável comercial ({selectedFreight.comercialResponsavelNome}) possa revisar os dados.
            </p>
            <textarea
              rows={3}
              required
              value={returnObservation}
              onChange={(e) => setReturnObservation(e.target.value)}
              placeholder="Descreva a divergência ou informação comercial pendente..."
              className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowReturnModal(false)}
                className="px-3.5 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={actionBusy}
                className="bg-[#E5252A] hover:bg-red-700 text-white text-xs font-extrabold px-4 py-2 rounded-xl cursor-pointer"
              >
                Confirmar Devolução
              </button>
            </div>
          </form>
        </div>
      )}

      {/* =====================================================================
          MODAL: CONFIRMAR "IGNORAR POR ENQUANTO" DA ORDEM DE COLETA
      ===================================================================== */}
      {showSkipOrderModal && selectedFreight && (
        <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleIgnorarOrdemColeta}
            className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-3"
          >
            <div className="flex items-center justify-between pb-2 border-b border-gray-100">
              <h3 className="text-sm font-black text-[#15191D]">
                Adiar Ordem de Coleta — Frete {selectedFreight.protocol}
              </h3>
              <button
                type="button"
                onClick={() => setShowSkipOrderModal(false)}
                className="text-gray-400 hover:text-gray-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-gray-600">
              O frete será marcado como <strong>Ordem de coleta pendente</strong> sem gerar um PDF falso, permitindo liberar para o Monitoramento e emitir a Ordem oficial posteriormente.
            </p>
            <div>
              <label className="block text-[11px] font-bold text-gray-700 mb-1">
                Motivo / Observação (opcional)
              </label>
              <textarea
                rows={3}
                maxLength={300}
                value={skipOrderReason}
                onChange={(e) => setSkipOrderReason(e.target.value)}
                placeholder="Ex.: Aguardando dados complementares do remetente/destinatário..."
                className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowSkipOrderModal(false)}
                className="px-3.5 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={actionBusy}
                className="bg-[#080B0D] hover:bg-gray-800 text-[#FFD400] text-xs font-extrabold px-4 py-2 rounded-xl cursor-pointer disabled:opacity-60"
              >
                {actionBusy ? 'Registrando...' : 'Confirmar "Ignorar por enquanto"'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* =====================================================================
          MODAL: ORDEM DE COLETA OFICIAL (RODOVAR / VL TRANSPORTES — 2 VIAS A4)
      ===================================================================== */}
      {showOrderModal && selectedFreight && (
        <OrdemColetaModal
          freight={selectedFreight}
          issuedByName={currentUser.name}
          onClose={() => setShowOrderModal(false)}
          onShare={(f) => void handleShareOrdemColeta(f)}
          canConfirmDriverSend={true}
          actionBusy={actionBusy}
          onConfirmDriverSend={() => void handleConfirmarEnvioOrdemAoMotorista()}
        />
      )}

      {/* =====================================================================
          MODAL: REATIVAR FRETE OPERACIONAL (ADMIN / SUPERVISÃO)
      ===================================================================== */}
      {showReactivateModal && targetReactivateFreight && (
        <CorporateModal
          isOpen={showReactivateModal}
          onClose={() => {
            setShowReactivateModal(false);
            setTargetReactivateFreight(null);
          }}
          title={`Reativar Frete ${targetReactivateFreight.protocol}`}
          subtitle={`Cliente: ${targetReactivateFreight.cliente} • Rota: ${targetReactivateFreight.origemCidadeUf} → ${targetReactivateFreight.destinoCidadeUf}`}
          maxWidth="md"
          footer={
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowReactivateModal(false);
                  setTargetReactivateFreight(null);
                }}
                className="px-3.5 py-2 text-xs font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={reactivateBusy || !reactivateMotivo.trim()}
                onClick={handleConfirmReactivate}
                className="px-4 py-2 text-xs font-extrabold text-[#080B0D] bg-[#FFD400] hover:bg-[#ffdf33] rounded-lg inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{reactivateBusy ? 'Reativando...' : 'Confirmar Reativação'}</span>
              </button>
            </div>
          }
        >
          <div className="space-y-4">
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900">
              A reativação restaurará o frete para a etapa operacional anterior (
              <strong>{targetReactivateFreight.preCancelOperacional || 'RECEBIDO'}</strong>),
              preservando seu código único ({targetReactivateFreight.protocol}), documentos,
              responsáveis e histórico integral de auditoria.
            </div>
            <div>
              <label className="block text-xs font-bold text-[#15191D] mb-1">
                Motivo da Reativação *
              </label>
              <textarea
                rows={3}
                value={reactivateMotivo}
                onChange={(e) => setReactivateMotivo(e.target.value)}
                placeholder="Informe a justificativa corporativa para reativar este frete..."
                className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs focus:outline-none focus:border-[#FFD400]"
              />
            </div>
          </div>
        </CorporateModal>
      )}

      <ImportFreightScriptModal
        isOpen={isScriptModalOpen}
        onClose={() => setIsScriptModalOpen(false)}
        title="Importar Script para Dados Operacionais"
        subtitle="Preenche motorista, frete motorista, PIX, banco e condições; campos ausentes permanecem em branco."
        fillFormLabel="Preencher dados operacionais"
        onFillForm={(parsed: Partial<ParsedTrafficScript>) => {
          setOpEnderecoColeta(parsed.enderecoColeta || opEnderecoColeta || '');
          setOpClienteContato(parsed.telefoneCliente || '');
          setOpTipoCarga(parsed.tipoCarga || opTipoCarga || '');
          if (parsed.pesoKg && parsed.pesoKg > 0) setOpPesoKg(String(parsed.pesoKg));
          if (parsed.volumes && parsed.volumes > 0) setOpVolumes(String(parsed.volumes));
          if (parsed.veiculoNecessario) setOpVeiculoNecessario(parsed.veiculoNecessario);
          setOpMotoristaNome(parsed.motoristaNome || '');
          setOpMotoristaCpf(parsed.motoristaCpf || '');
          setOpMotoristaTelefone(parsed.motoristaTelefone || '');
          if (parsed.placaVeiculo) setOpPlacaVeiculo(parsed.placaVeiculo);
          setOpValorContratadoReais(
            parsed.valorFreteMotorista && parsed.valorFreteMotorista > 0
              ? parsed.valorFreteMotorista.toFixed(2).replace('.', ',')
              : ''
          );
          setOpFavorecidoPagamento(parsed.favorecido || '');
          setOpBancoPagamento(parsed.banco || '');
          setOpTipoChavePix(parsed.tipoChavePix || 'CPF/CNPJ');
          setOpChavePix(parsed.chavePix || '');
          setOpCondicoesPagamento(parsed.condicoesPagamento || '');
          setOpObservacoes(parsed.observacoes || '');
          showToast('Script aplicado aos dados operacionais! Campos ausentes permaneceram em branco.');
        }}
      />
    </div>
  );
};
