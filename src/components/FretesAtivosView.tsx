import {CustomerCover} from './CustomerCover';
import {CarrierBrandLogo,CARRIER_BRANDS} from '../lib/carrierLogos';
import {useGlobalLoading} from './GlobalLoading';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  AlertTriangle,
  Archive,
  ArrowLeft,
  ArrowRight,
  Calendar,
  Building2,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Eye,
  Flag,
  MapPin,
  Navigation,
  Phone,
  Printer,
  RefreshCw,
  RotateCcw,
  Search,
  Truck,
  Upload,
  User,
  X,
  ClipboardPaste,
} from 'lucide-react';
import {
  CarrierBrand,
  Employee,
  FreightAttachmentCategory,
  FreightRecord,
  MonitoringFreightStatus,
  OperationalUnit,
  UnifiedFreightAttachment,
  UnifiedFreightHistoryEntry,
  UnifiedFreightOccurrence,
  UnifiedFreightRecord,
} from '../types';
import {
  apiCreateCommercialFreight,
  apiDownloadFreightAttachment,
  apiFetchFreightsList,
  apiMonitoramentoAction,
  apiRegisterFreightOccurrence,
  apiReopenFreight,
  apiResolveFreightOccurrence,
  apiTransferFreightResponsibility,
  apiUploadFreightAttachment,
  apiVerifyFreightAttachment,
  formatCentavosToBrl,
  sanitizeApiErrorMessage,
} from '../lib/serverApi';
import {
  appQueryClient,
  FREIGHT_CACHE_TIMES,
  FREIGHT_PAGE_SIZE,
  fetchActiveFreightsQuery,
  fetchFinalizedFreightsQuery,
  fetchFreightDetailsQuery,
  fetchFreightOperatorsQuery,
  freightQueryKeys,
  invalidateFreightDetailCache,
  invalidateFreightQueriesAfterMutation,
} from '../lib/freightQueryCache';
import {
  canAccessComercialFreights,
  canAccessExpedicaoFreights,
  canOperateMonitoring,
  canTransferFreightResponsibility,
  canViewFreightTeam,
  hasPagePermission,
} from '../lib/permissions';
import {
  formatSituacaoFinanceiraLabel,
  formatSituacaoMonitoramentoLabel,
} from './MeusFretesComercialView';
import { OrdemColetaModal } from './OrdemColetaDocument';
import { ImportFreightScriptModal } from './ImportFreightScriptModal';
import { ParsedTrafficScript } from '../lib/carrierLogos';
import { CorporateModal } from './ui/CorporateModal';
import './FretesAtivosView.css';

export type ActiveFreightStage =
  | 'Aguardando Liberação'
  | 'Em Trânsito (Adiant. Pago)'
  | 'Veículo Quebrado'
  | 'Entrega Concluída';

export interface ActiveFreightCardItem {
  id: string;
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
  createdAtDate: string;
  origem: string;
  destino: string;
  dataColeta: string;
  dataPrevisaoOuEntrega: string;
  stage: ActiveFreightStage;
  docsOk: ('CT-e OK' | 'MDF-e OK' | 'RPA OK')[];
  operador: string;
  valorFreteEmpresa: number;
  valorFreteMotorista: number;
  favorecido: string;
  tipoChavePix: 'CPF/CNPJ' | 'Celular' | 'E-mail' | 'Chave Aleatória';
  chavePix: string;
  banco: string;
}

export const INITIAL_ACTIVE_FREIGHTS: ActiveFreightCardItem[] = [];

const MONITORING_STAGES_ORDER: {
  id: MonitoringFreightStatus;
  label: string;
  shortLabel: string;
  badgeStyle: string;
}[] = [
  {
    id: 'NOVO_PARA_CARREGAR',
    label: 'Novo para carregar',
    shortLabel: 'Novo p/ carregar',
    badgeStyle: 'bg-blue-100 text-blue-900 border-blue-300',
  },
  {
    id: 'EM_DESLOCAMENTO_COLETA',
    label: 'Em deslocamento para coleta',
    shortLabel: 'Desloc. coleta',
    badgeStyle: 'bg-orange-100 text-orange-900 border-orange-300',
  },
  {
    id: 'NO_LOCAL_COLETA',
    label: 'No local de coleta',
    shortLabel: 'No local coleta',
    badgeStyle: 'bg-indigo-100 text-indigo-900 border-indigo-300',
  },
  {
    id: 'CARREGADO_EM_TRANSPORTE',
    label: 'Carregado / Em transporte',
    shortLabel: 'Em transporte',
    badgeStyle: 'bg-amber-100 text-amber-900 border-amber-300',
  },
  {
    id: 'NO_LOCAL_ENTREGA',
    label: 'No local de entrega',
    shortLabel: 'No local entrega',
    badgeStyle: 'bg-purple-100 text-purple-900 border-purple-300',
  },
  {
    id: 'ENTREGUE',
    label: 'Entregue',
    shortLabel: 'Entregue',
    badgeStyle: 'bg-teal-100 text-teal-900 border-teal-300',
  },
  {
    id: 'FINALIZADO',
    label: 'Finalizado',
    shortLabel: 'Finalizado',
    badgeStyle: 'bg-emerald-100 text-emerald-900 border-emerald-300',
  },
];

function getMonitoringBadgeStyle(status?: MonitoringFreightStatus): string {
  const found = MONITORING_STAGES_ORDER.find((s) => s.id === status);
  return found ? found.badgeStyle : 'bg-gray-100 text-gray-700 border-gray-300';
}

function getNextMonitoringStage(
  current?: MonitoringFreightStatus
): MonitoringFreightStatus | null {
  switch (current) {
    case 'NAO_LIBERADO':
      return 'NOVO_PARA_CARREGAR';
    case 'NOVO_PARA_CARREGAR':
      return 'EM_DESLOCAMENTO_COLETA';
    case 'EM_DESLOCAMENTO_COLETA':
      return 'NO_LOCAL_COLETA';
    case 'NO_LOCAL_COLETA':
      return 'CARREGADO_EM_TRANSPORTE';
    case 'CARREGADO_EM_TRANSPORTE':
      return 'NO_LOCAL_ENTREGA';
    case 'NO_LOCAL_ENTREGA':
      return 'ENTREGUE';
    case 'ENTREGUE':
      return 'FINALIZADO';
    default:
      return null;
  }
}

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

function getInitials(name: string): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'OP';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function getFreightTone(status?: MonitoringFreightStatus): string {
  switch (status) {
    case 'NOVO_PARA_CARREGAR': return 'blue';
    case 'EM_DESLOCAMENTO_COLETA': return 'orange';
    case 'NO_LOCAL_COLETA': return 'indigo';
    case 'CARREGADO_EM_TRANSPORTE': return 'yellow';
    case 'NO_LOCAL_ENTREGA':
    case 'ENTREGUE': return 'teal';
    case 'FINALIZADO': return 'green';
    default: return 'gray';
  }
}

function FreightCard({ freight: f, userId, selected, showPendingOrderBadge, onOpen }: { freight: UnifiedFreightRecord; userId: string; selected: boolean; showPendingOrderBadge?: boolean; onOpen: (event: React.SyntheticEvent<HTMLElement>) => void }) {
  const StatusIcon = f.situacaoMonitoramento === 'FINALIZADO' ? CheckCircle2 : f.situacaoMonitoramento === 'EM_DESLOCAMENTO_COLETA' ? Navigation : Truck;
  return <article tabIndex={0} onClick={event=>{if(!(event.target as HTMLElement).closest('button,a,input,select,textarea'))onOpen(event);}} onKeyDown={event=>{if(event.target===event.currentTarget&&(event.key==='Enter'||event.key===' ')){event.preventDefault();onOpen(event);}}} className="fa-freight-card" data-tone={getFreightTone(f.situacaoMonitoramento)} data-selected={selected} aria-label={`Frete ${f.protocol}`}>
    <CustomerCover customer={f.cliente} userId={userId}/>
    <div className="fa-card-top"><div className="fa-protocol"><span className="fa-protocol-icon"><Truck size={15} /></span>{f.protocol}</div><span className="fa-status"><StatusIcon size={13} />{formatSituacaoMonitoramentoLabel(f.situacaoMonitoramento)}</span></div>
    <div className="fa-card-customer"><span className="fa-icon-tile"><Building2 size={17} /></span><div className="min-w-0 flex-1"><span className="fa-label">Cliente</span><h2 className="fa-customer-name">{f.cliente}</h2></div></div>
    <div className="fa-card-route"><div><span className="fa-route-point" aria-hidden="true"/><div><span className="fa-label">Origem</span><strong>{f.origemCidadeUf}</strong></div></div><div><span className="fa-route-point fa-route-point--destination" aria-hidden="true"/><div><span className="fa-label">Destino</span><strong>{f.destinoCidadeUf}</strong></div></div></div>
    <div className="fa-data-grid">
      <div className="fa-data-item"><span className="fa-icon-tile"><Calendar size={15} /></span><div className="min-w-0"><span className="fa-label">Coleta</span><strong>{formatIsoDateBr(f.dataColetaIso)}</strong></div></div>
      <div className="fa-data-item"><span className="fa-icon-tile" style={{color:'#e11d48',background:'#fff1f2'}}><Flag size={15} /></span><div className="min-w-0"><span className="fa-label">Previsão de entrega</span><strong>{formatIsoDateBr(f.dataEntregaPrevistaIso)}</strong></div></div>
      <div className="fa-data-item"><span className="fa-driver-avatar"><User size={16} /></span><div className="min-w-0"><span className="fa-label">Motorista</span><strong>{f.motoristaNome || 'Não informado'}</strong>{f.motoristaTelefone ? <a className="fa-card-phone" href={`tel:${f.motoristaTelefone.replace(/\D/g,'')}`}><Phone size={10} />{f.motoristaTelefone}</a> : <span className="fa-card-phone">Telefone não informado</span>}</div></div>
      <div className="fa-data-item"><span className="fa-icon-tile"><Truck size={16} /></span><div className="min-w-0"><span className="fa-label">Veículo / Placas</span><strong className="font-mono">{f.placaVeiculo || 'Não informada'}{f.placaCarreta && <><br />{f.placaCarreta}</>}</strong></div></div>
    </div>
    <div className="fa-card-location"><MapPin size={18} /><div className="min-w-0"><span className="fa-label">Última localização informada</span><p>{f.ultimaLocalizacaoInformada || 'Localização ainda não informada'}</p>{f.ultimaLocalizacaoAtualizadaEm && <time>{f.ultimaLocalizacaoAtualizadaEm}</time>}</div></div>
    {showPendingOrderBadge && f.ordemColetaPendente && !f.ordemCarregamentoNumero && <p className="inline-flex items-center gap-1.5 text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1"><Clock size={12} />Ordem de coleta pendente</p>}
    {f.ocorrenciasAbertasCount > 0 && <p className="fa-card-warning"><AlertCircle size={12} />{f.ocorrenciasAbertasCount} ocorrência(s) em aberto</p>}
    <div className="fa-card-footer"><div className="fa-card-operator"><span className="fa-label">Operador responsável</span><strong title={f.monitoramentoResponsavelNome || undefined}>{f.monitoramentoResponsavelNome || 'Não atribuído'}</strong></div><button type="button" className="fa-details-button" onClick={onOpen} aria-label={`Ver detalhes do frete ${f.protocol}`} aria-expanded={selected} aria-controls="active-freight-detail"><Eye size={14} />Ver detalhes</button></div>
  </article>;
}

function FreightOverview({ freight: f }: { freight: UnifiedFreightRecord }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <section className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-2xs space-y-3.5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
          <h3 className="text-sm font-extrabold text-[#15191D]">Informações principais</h3>
          <span className="text-xs font-bold text-slate-500">
            Financeiro: {formatSituacaoFinanceiraLabel(f.situacaoFinanceira)}
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div className="flex items-start gap-2.5">
            <span className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
              <Truck size={16} />
            </span>
            <div className="min-w-0">
              <span className="block text-xs text-slate-500 font-medium">Protocolo</span>
              <strong className="text-sm font-bold text-[#15191D]">{f.protocol}</strong>
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <span className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
              <Building2 size={16} />
            </span>
            <div className="min-w-0">
              <span className="block text-xs text-slate-500 font-medium">Cliente</span>
              <strong className="text-sm font-bold text-[#15191D] break-words">{f.cliente}</strong>
            </div>
          </div>
          <div className="flex items-start gap-2.5 sm:col-span-2">
            <span className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 border border-amber-200/60 flex items-center justify-center shrink-0">
              <MapPin size={16} />
            </span>
            <div className="min-w-0">
              <span className="block text-xs text-slate-500 font-medium">Rota da Operação</span>
              <strong className="text-sm font-bold text-[#15191D] break-words">
                {f.origemCidadeUf} → {f.destinoCidadeUf}
              </strong>
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <span className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
              <Calendar size={16} />
            </span>
            <div>
              <span className="block text-xs text-slate-500 font-medium">Data da Coleta</span>
              <strong className="text-sm font-bold text-[#15191D]">
                {formatIsoDateBr(f.dataColetaIso)}
              </strong>
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <span className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
              <Flag size={16} />
            </span>
            <div>
              <span className="block text-xs text-slate-500 font-medium">Previsão de Entrega</span>
              <strong className="text-sm font-bold text-[#15191D]">
                {formatIsoDateBr(f.dataEntregaPrevistaIso)}
              </strong>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-2xs space-y-3.5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
          <h3 className="text-sm font-extrabold text-[#15191D]">Motorista, veículo e responsáveis</h3>
          {f.empresaMarca && (CARRIER_BRANDS as readonly string[]).includes(f.empresaMarca) && (
            <CarrierBrandLogo brand={f.empresaMarca} size="sm" />
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div className="flex items-start gap-2.5">
            <span className="w-8 h-8 rounded-full bg-amber-50 border border-amber-300 text-slate-800 flex items-center justify-center shrink-0">
              <User size={16} />
            </span>
            <div className="min-w-0">
              <span className="block text-xs text-slate-500 font-medium">Motorista</span>
              <strong className="text-sm font-bold text-[#15191D] block break-words">
                {f.motoristaNome || 'Não informado'}
              </strong>
              {f.motoristaTelefone && (
                <a
                  className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:underline mt-0.5"
                  href={`tel:${f.motoristaTelefone.replace(/\D/g, '')}`}
                >
                  <Phone size={11} />
                  {f.motoristaTelefone}
                </a>
              )}
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <span className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
              <Truck size={16} />
            </span>
            <div className="min-w-0">
              <span className="block text-xs text-slate-500 font-medium">Veículo / Placas</span>
              <strong className="text-sm font-bold text-[#15191D] font-mono block">
                {f.placaVeiculo || 'Não informada'}
                {f.placaCarreta ? ` / ${f.placaCarreta}` : ''}
              </strong>
              {f.veiculoNecessario && (
                <span className="text-xs text-slate-500">{f.veiculoNecessario}</span>
              )}
            </div>
          </div>
        </div>
        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-2 border-t border-slate-100 pt-3">
          {[
            ['Comercial', f.comercialResponsavelNome],
            ['Expedição', f.expedicaoResponsavelNome],
            ['Monitoramento', f.monitoramentoResponsavelNome],
          ].map(([label, name]) => (
            <div key={label} className="bg-slate-50 rounded-xl px-3 py-2 border border-slate-200/70">
              <dt className="text-[11px] text-slate-500 font-medium">{label}</dt>
              <dd className="text-xs font-bold text-slate-800 truncate mt-0.5">
                {name || 'Não atribuído'}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-2xs md:col-span-2">
        <h3 className="text-sm font-extrabold text-[#15191D] mb-2.5">
          Localização e acompanhamento
        </h3>
        <div className="flex items-start gap-3 bg-slate-50 rounded-xl p-3.5 border border-slate-200/80">
          <MapPin size={18} className="shrink-0 text-red-500 mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-800 break-words">
              {f.ultimaLocalizacaoInformada || 'Localização ainda não informada'}
            </p>
            {f.ultimaLocalizacaoAtualizadaEm && (
              <p className="mt-1 text-xs text-slate-500">
                Atualizado em: {f.ultimaLocalizacaoAtualizadaEm}
              </p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

interface FretesAtivosViewProps {
  currentUser: Employee;
  financialFreights?: FreightRecord[];
  selectedFreightIdFromNotification?: string | null;
  onClearSelectedNotificationFreight?: () => void;
  onSwitchToExpedicao?: () => void;
  onSwitchToComercial?: () => void;
  onSyncNewFreightToFinanceiro?: (item: ActiveFreightCardItem) => void;
  onSyncStageToFinanceiro?: (code: string, stage: ActiveFreightStage) => void;
}

export const FretesAtivosView: React.FC<FretesAtivosViewProps> = ({
  currentUser,
  selectedFreightIdFromNotification,
  onClearSelectedNotificationFreight,
  onSwitchToExpedicao,
  onSwitchToComercial,
}) => {
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [orderModalFreight, setOrderModalFreight] = useState<UnifiedFreightRecord | null>(null);
  const [isScriptModalOpen, setIsScriptModalOpen] = useState(false);
  const canImportComercialScript = useMemo(() => canAccessComercialFreights(currentUser), [currentUser]);

  const isOperationalProfile = useMemo(
    () =>
      canAccessExpedicaoFreights(currentUser) ||
      canOperateMonitoring(currentUser) ||
      currentUser.accessLevel === 'ADMINISTRADOR' ||
      currentUser.accessLevel === 'DIRETORIA',
    [currentUser]
  );

  // Panel Mode: 'ATIVOS' (cards, paginated 12/page) | 'FINALIZADOS' (compact table loaded on demand)
  const [panelMode, setPanelMode] = useState<'ATIVOS' | 'FINALIZADOS'>('ATIVOS');

  // Synchronous Scope Initialization prevents duplicate mount fetch (MINE -> TEAM)
  const [viewScope, setViewScope] = useState<'MINE' | 'TEAM'>(() =>
    canViewFreightTeam(currentUser) ? 'TEAM' : 'MINE'
  );
  const [responsibleFilterId, setResponsibleFilterId] = useState<string>('');

  // Active Panel Filters & Pagination
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [stageFilter, setStageFilter] = useState<string>('TODOS');
  const [periodFilter, setPeriodFilter] = useState<'HOJE' | 'SEMANA' | 'MES' | 'TODOS'>('TODOS');
  const [activePage, setActivePage] = useState<number>(1);

  // Finalizados Panel Filters & Pagination (independent, only queried when requested)
  const [finSearchInput, setFinSearchInput] = useState<string>('');
  const [debouncedFinSearch, setDebouncedFinSearch] = useState<string>('');
  const [finStatusFilter, setFinStatusFilter] = useState<'TODAS' | 'FINALIZADO' | 'ENTREGUE'>('TODAS');
  const [finPeriodFilter, setFinPeriodFilter] = useState<'HOJE' | 'SEMANA' | 'MES' | 'TODOS'>('TODOS');
  const [finPage, setFinPage] = useState<number>(1);

  // Debounce search inputs cleanly
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
      setActivePage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedFinSearch(finSearchInput.trim());
      setFinPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [finSearchInput]);

  // Reset pagination when scope or filter dropdowns change
  const changeScopeFilter = (val: string) => {
    if (val === 'MINE') {
      setViewScope('MINE');
      setResponsibleFilterId('');
    } else if (val === 'TEAM') {
      setViewScope('TEAM');
      setResponsibleFilterId('');
    } else {
      setViewScope('TEAM');
      setResponsibleFilterId(val);
    }
    setActivePage(1);
    setFinPage(1);
  };

  // Operators query (cached 1h per user)
  const operatorsQuery = useQuery({
    queryKey: freightQueryKeys.operators(currentUser.id),
    queryFn: fetchFreightOperatorsQuery,
    staleTime: FREIGHT_CACHE_TIMES.STATIC_DATA_STALE_MS,
    gcTime: FREIGHT_CACHE_TIMES.STATIC_DATA_STALE_MS,
    refetchOnWindowFocus: false,
  });

  const monitoramentoOperators = operatorsQuery.data?.monitoramentoOperators || [];
  const canViewTeam = operatorsQuery.data?.permissions
    ? Boolean(operatorsQuery.data.permissions.canViewTeam)
    : canViewFreightTeam(currentUser);

  const activeFilters = useMemo(
    () => ({
      scope: viewScope,
      responsibleFilterId,
      stageFilter,
      periodFilter,
      searchQuery: debouncedSearch,
      page: activePage,
      limit: FREIGHT_PAGE_SIZE,
    }),
    [viewScope, responsibleFilterId, stageFilter, periodFilter, debouncedSearch, activePage]
  );

  const finalizedFilters = useMemo(
    () => ({
      scope: viewScope,
      responsibleFilterId,
      stageFilter: finStatusFilter,
      periodFilter: finPeriodFilter,
      searchQuery: debouncedFinSearch,
      page: finPage,
      limit: FREIGHT_PAGE_SIZE,
    }),
    [viewScope, responsibleFilterId, finStatusFilter, finPeriodFilter, debouncedFinSearch, finPage]
  );

  // Active Freights Query (staleTime 2m, server pagination 12/page, omitKanban=true)
  const activeQuery = useQuery({
    queryKey: freightQueryKeys.activeList(currentUser.id, activeFilters),
    queryFn: () => fetchActiveFreightsQuery(activeFilters),
    enabled: panelMode === 'ATIVOS',
    staleTime: FREIGHT_CACHE_TIMES.ACTIVE_LIST_STALE_MS,
    gcTime: FREIGHT_CACHE_TIMES.GC_TIME_MS,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
  });

  // Finalized Freights Query (ONLY fetched when user clicks "Ver Finalizados", staleTime 15m)
  const finalizedQuery = useQuery({
    queryKey: freightQueryKeys.finalizedList(currentUser.id, finalizedFilters),
    queryFn: () => fetchFinalizedFreightsQuery(finalizedFilters),
    enabled: panelMode === 'FINALIZADOS',
    staleTime: FREIGHT_CACHE_TIMES.FINALIZADOS_LIST_STALE_MS,
    gcTime: FREIGHT_CACHE_TIMES.GC_TIME_MS,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
  });

  const currentListQuery = panelMode === 'FINALIZADOS' ? finalizedQuery : activeQuery;
  const freights = activeQuery.data?.items || [];
  const finalizedRows = finalizedQuery.data?.items || [];
  const loading = currentListQuery.isFetching;
  const initialActiveLoading = panelMode === 'ATIVOS' && activeQuery.isLoading && freights.length === 0;
  useGlobalLoading(initialActiveLoading);

  useEffect(() => {
    if (currentListQuery.error) {
      setErrorMsg(
        sanitizeApiErrorMessage(
          currentListQuery.error,
          'Falha ao carregar fila de Fretes Ativos (Monitoramento).'
        )
      );
    }
  }, [currentListQuery.error]);

  // Selected Freight ID & lazy-loaded full detail query (never preloaded!)
  const [selectedFreightId, setSelectedFreightId] = useState<string | null>(null);
  const [selectedPreview, setSelectedPreview] = useState<UnifiedFreightRecord | null>(null);
  const [activeTab, setActiveTab] = useState<
    'RESUMO' | 'ACOMPANHAMENTO' | 'DADOS_ORDEM' | 'ANEXOS' | 'OCORRENCIAS' | 'HISTORICO'
  >('RESUMO');

  const isSelectedHistorical = Boolean(
    selectedPreview?.situacaoMonitoramento === 'FINALIZADO' ||
      selectedPreview?.situacaoMonitoramento === 'ENTREGUE'
  );

  const detailQuery = useQuery({
    queryKey: freightQueryKeys.detail(currentUser.id, selectedFreightId || ''),
    queryFn: () => fetchFreightDetailsQuery(selectedFreightId!),
    enabled: Boolean(selectedFreightId),
    staleTime: isSelectedHistorical
      ? FREIGHT_CACHE_TIMES.HISTORICAL_DETAIL_STALE_MS
      : FREIGHT_CACHE_TIMES.ACTIVE_DETAIL_STALE_MS,
    gcTime: FREIGHT_CACHE_TIMES.GC_TIME_MS,
    refetchOnWindowFocus: false,
  });

  const selectedFreight = detailQuery.data?.freight || selectedPreview;
  const detailAnexos: UnifiedFreightAttachment[] = detailQuery.data?.anexos || [];
  const detailOcorrencias: UnifiedFreightOccurrence[] = detailQuery.data?.ocorrencias || [];
  const detailHistorico: UnifiedFreightHistoryEntry[] = detailQuery.data?.historico || [];

  // Monitoring Stage Advance Form
  const [targetNextStage, setTargetNextStage] =
    useState<MonitoringFreightStatus>('NOVO_PARA_CARREGAR');
  const [realEventTimeInput, setRealEventTimeInput] = useState<string>('');
  const [stageObservationInput, setStageObservationInput] = useState<string>('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [informedLocationInput, setInformedLocationInput] = useState<string>('');
  const [driverInstructionsInput, setDriverInstructionsInput] = useState<string>('');
  const [previsaoEntregaInput, setPrevisaoEntregaInput] = useState<string>('');
  const [actionBusy, setActionBusy] = useState<boolean>(false);

  // Return to Expedição Modal
  const [showReturnExpedicaoModal, setShowReturnExpedicaoModal] = useState<boolean>(false);
  const [returnExpedicaoReason, setReturnExpedicaoReason] = useState<string>('');

  // Reopen Freight Modal
  const [showReopenModal, setShowReopenModal] = useState<boolean>(false);
  const [reopenReason, setReopenReason] = useState<string>('');
  const [reopenTargetStage, setReopenTargetStage] =
    useState<MonitoringFreightStatus>('NO_LOCAL_ENTREGA');

  // Occurrence creation state
  const [occTitulo, setOccTitulo] = useState<string>('');
  const [occDescricao, setOccDescricao] = useState<string>('');
  const [occSeveridade, setOccSeveridade] = useState<'BAIXA' | 'MEDIA' | 'IMPEDITIVA'>('MEDIA');
  const [occBusy, setOccBusy] = useState<boolean>(false);

  // Attachment upload state
  const [attCategory, setAttCategory] = useState<FreightAttachmentCategory>('COMPROVANTE_ENTREGA');
  const [attBusy, setAttBusy] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const detailPanelRef = useRef<HTMLElement | null>(null);
  const detailTriggerRef = useRef<HTMLElement | null>(null);
  const isDetailDocked = false;

  // Transfer responsibility state
  const [transferTargetId, setTransferTargetId] = useState<string>('');
  const [transferMotivo, setTransferMotivo] = useState<string>('');
  const [transferBusy, setTransferBusy] = useState<boolean>(false);

  const hasExpedicaoAccess = useMemo(() => canAccessExpedicaoFreights(currentUser), [currentUser]);
  const isSupervisor = useMemo(() => canTransferFreightResponsibility(currentUser), [currentUser]);

  const canReopenSelected = useMemo(() => {
    if (!selectedFreight) return false;
    const st = selectedFreight.situacaoMonitoramento;
    if (st !== 'FINALIZADO' && st !== 'ENTREGUE') return false;
    return (
      currentUser.accessLevel === 'ADMINISTRADOR' ||
      currentUser.accessLevel === 'DIRETORIA' ||
      hasPagePermission(currentUser, 'fretes_cancelar') ||
      (canOperateMonitoring(currentUser) &&
        selectedFreight.monitoramentoResponsavelId === currentUser.id)
    );
  }, [selectedFreight, currentUser]);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg((prev) => (prev === msg ? null : prev));
    }, 4000);
  };

  const syncMonitoringFormFromRecord = useCallback((f: UnifiedFreightRecord) => {
    const next = getNextMonitoringStage(f.situacaoMonitoramento);
    setTargetNextStage(next || f.situacaoMonitoramento || 'NOVO_PARA_CARREGAR');
    setDeliveryAddress(f.enderecoEntrega || '');
    setInformedLocationInput(f.ultimaLocalizacaoInformada || '');
    setDriverInstructionsInput(f.orientacoesMotorista || '');
    setPrevisaoEntregaInput(f.dataEntregaPrevistaIso || '');
    const nowLocal = new Date();
    const hh = String(nowLocal.getHours()).padStart(2, '0');
    const mm = String(nowLocal.getMinutes()).padStart(2, '0');
    const dd = String(nowLocal.getDate()).padStart(2, '0');
    const mo = String(nowLocal.getMonth() + 1).padStart(2, '0');
    setRealEventTimeInput(`${dd}/${mo}/${nowLocal.getFullYear()} ${hh}:${mm}`);
    setStageObservationInput('');
  }, []);

  useEffect(() => {
    if (detailQuery.data?.freight) {
      setSelectedPreview(detailQuery.data.freight);
      syncMonitoringFormFromRecord(detailQuery.data.freight);
    }
  }, [detailQuery.data, syncMonitoringFormFromRecord]);

  useEffect(() => {
    if (!selectedFreight || showReturnExpedicaoModal || showReopenModal) return;
    const panel = detailPanelRef.current;
    const previousOverflow = document.body.style.overflow;
    if (!isDetailDocked) document.body.style.overflow = 'hidden';
    panel?.querySelector<HTMLButtonElement>('[data-detail-close]')?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setSelectedFreightId(null);
        setSelectedPreview(null);
      }
      if (event.key !== 'Tab' || isDetailDocked || !panel) return;
      const controls = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled)'
        )
      ).filter((node) => node.getClientRects().length > 0);
      const first = controls[0],
        last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', keydown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', keydown);
      detailTriggerRef.current?.focus();
    };
  }, [selectedFreight?.id, isDetailDocked, showReturnExpedicaoModal, showReopenModal]);

  // Open specific freight when clicked from notification ("Novo frete para carregar — #0842...")
  useEffect(() => {
    if (!selectedFreightIdFromNotification) return;
    setActiveTab('RESUMO');
    setSelectedFreightId(selectedFreightIdFromNotification);
    if (onClearSelectedNotificationFreight) onClearSelectedNotificationFreight();
  }, [selectedFreightIdFromNotification, onClearSelectedNotificationFreight]);

  // Moderate visibility-gated sync check every 90s (zero DB work when unchanged)
  const latestDataVersionRef = useRef<number | undefined>(undefined);
  latestDataVersionRef.current =
    currentListQuery.data?.dataVersion ?? activeQuery.data?.dataVersion ?? finalizedQuery.data?.dataVersion;

  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState !== 'visible' || actionBusy) return;
      const knownVersion = latestDataVersionRef.current;
      if (knownVersion === undefined) return;
      void apiFetchFreightsList({
        area: 'MONITORAMENTO',
        scope: viewScope === 'TEAM' ? 'EQUIPE' : 'MEUS',
        responsavelId: viewScope === 'TEAM' && responsibleFilterId ? responsibleFilterId : undefined,
        checkOnly: true,
        sinceVersion: knownVersion,
      }).then((check) => {
        if (check.ok && check.unchanged === false) {
          void appQueryClient.invalidateQueries({
            queryKey: freightQueryKeys.lists(currentUser.id),
          });
        }
      });
    }, 90_000);
    return () => clearInterval(interval);
  }, [viewScope, responsibleFilterId, actionBusy, currentUser.id]);

  // Manual Refresh ("Atualizar") invalidates cache & refetches
  const handleManualRefresh = async () => {
    setErrorMsg(null);
    await appQueryClient.invalidateQueries({
      queryKey: freightQueryKeys.lists(currentUser.id),
    });
    if (selectedFreightId) {
      await invalidateFreightDetailCache(currentUser.id, selectedFreightId);
    }
    await currentListQuery.refetch();
  };

  // Summary counters directly from server operational counters (accurate across all pages)
  const mc = currentListQuery.data?.monitoramentoCounters || activeQuery.data?.monitoramentoCounters;
  const stats = useMemo(
    () => ({
      novosParaCarregar: mc?.NOVO_PARA_CARREGAR ?? 0,
      emColetaDeslocamento:
        (mc?.EM_DESLOCAMENTO_COLETA ?? 0) + (mc?.NO_LOCAL_COLETA ?? 0),
      emTransporteEntrega:
        (mc?.CARREGADO_EM_TRANSPORTE ?? 0) + (mc?.NO_LOCAL_ENTREGA ?? 0),
      finalizados: mc?.completedCount ?? ((mc?.ENTREGUE ?? 0) + (mc?.FINALIZADO ?? 0)),
      pendencias: mc?.PENDENCIAS ?? 0,
    }),
    [mc]
  );

  const handleSelectFreight = (f: UnifiedFreightRecord) => {
    setActiveTab('RESUMO');
    setSelectedPreview(f);
    setSelectedFreightId(f.id);
    syncMonitoringFormFromRecord(f);
  };

  const closeDetailModal = () => {
    setSelectedFreightId(null);
    setSelectedPreview(null);
  };

  const syncAfterFreightMutation = async (
    updated: UnifiedFreightRecord,
    patch?: {
      anexos?: UnifiedFreightAttachment[];
      ocorrencias?: UnifiedFreightOccurrence[];
      historico?: UnifiedFreightHistoryEntry[];
    }
  ) => {
    setSelectedPreview(updated);
    appQueryClient.setQueryData(freightQueryKeys.detail(currentUser.id, updated.id), (prev: any) => {
      const base = prev && typeof prev === 'object' ? prev : {};
      return {
        ...base,
        ok: true,
        freight: updated,
        ...(patch?.anexos ? { anexos: patch.anexos } : {}),
        ...(patch?.ocorrencias ? { ocorrencias: patch.ocorrencias } : {}),
        ...(patch?.historico ? { historico: patch.historico } : {}),
      };
    });
    await invalidateFreightQueriesAfterMutation(currentUser.id, updated);
  };

  const handleAdvanceMonitoringStage = async (
    e: React.FormEvent,
    explicitStage?: MonitoringFreightStatus
  ) => {
    e.preventDefault();
    if (!selectedFreight) return;
    const stageToApply = explicitStage || targetNextStage;
    setActionBusy(true);
    setErrorMsg(null);
    try {
      const res = await apiMonitoramentoAction(selectedFreight.id, {
        action: 'AVANCAR_ETAPA',
        targetStage: stageToApply,
        horarioRealEvento: realEventTimeInput.trim() || undefined,
        ultimaLocalizacaoInformada: informedLocationInput.trim() || undefined,
        orientacoesMotorista: driverInstructionsInput.trim() || undefined,
        dataEntregaPrevistaIso: previsaoEntregaInput || undefined,
        observacoes: stageObservationInput.trim() || undefined,
        baseRevision: selectedFreight.revision,
      });

      if (!res.ok || !res.freight) {
        setErrorMsg(sanitizeApiErrorMessage(res.error, 'Erro ao avançar etapa do monitoramento.'));
        return;
      }

      const updated = res.freight;
      await syncAfterFreightMutation(updated, { historico: res.historico });
      syncMonitoringFormFromRecord(updated);
      showToast(
        `Frete ${updated.protocol} atualizado para "${formatSituacaoMonitoramentoLabel(
          updated.situacaoMonitoramento
        )}"!`
      );
      if (
        panelMode === 'ATIVOS' &&
        (updated.situacaoMonitoramento === 'ENTREGUE' ||
          updated.situacaoMonitoramento === 'FINALIZADO')
      ) {
        closeDetailModal();
      }
    } catch (err) {
      setErrorMsg(sanitizeApiErrorMessage(err, 'Erro ao avançar etapa do monitoramento.'));
    } finally {
      setActionBusy(false);
    }
  };

  const handleSaveLocationAndInstructions = async () => {
    if (!selectedFreight) return;
    setActionBusy(true);
    setErrorMsg(null);
    try {
      const res = await apiMonitoramentoAction(selectedFreight.id, {
        action: 'REGISTRAR_LOCALIZACAO_ORIENTACAO',
        enderecoEntrega: deliveryAddress.trim() || undefined,
        horarioRealEvento: realEventTimeInput.trim() || undefined,
        ultimaLocalizacaoInformada: informedLocationInput.trim(),
        orientacoesMotorista: driverInstructionsInput.trim(),
        dataEntregaPrevistaIso: previsaoEntregaInput || undefined,
        observacoes: stageObservationInput.trim() || undefined,
        baseRevision: selectedFreight.revision,
      });

      if (!res.ok || !res.freight) {
        setErrorMsg(sanitizeApiErrorMessage(res.error, 'Erro ao registrar localização/orientação.'));
        return;
      }

      const updated = res.freight;
      await syncAfterFreightMutation(updated, { historico: res.historico });
      syncMonitoringFormFromRecord(updated);
      showToast(`Localização informada e orientações salvas no frete ${updated.protocol}.`);
    } catch (err) {
      setErrorMsg(sanitizeApiErrorMessage(err, 'Erro ao registrar localização/orientação.'));
    } finally {
      setActionBusy(false);
    }
  };

  const handleReturnToExpedicao = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFreight) return;
    if (!returnExpedicaoReason.trim()) {
      setErrorMsg('Informe o motivo obrigatório para devolver o frete à Expedição.');
      return;
    }
    setActionBusy(true);
    setErrorMsg(null);
    try {
      const res = await apiMonitoramentoAction(selectedFreight.id, {
        action: 'DEVOLVER_EXPEDICAO',
        motivo: returnExpedicaoReason.trim(),
        baseRevision: selectedFreight.revision,
      });
      if (!res.ok || !res.freight) {
        setErrorMsg(sanitizeApiErrorMessage(res.error, 'Erro ao devolver à Expedição.'));
        return;
      }
      const updated = res.freight;
      await syncAfterFreightMutation(updated);
      closeDetailModal();
      setShowReturnExpedicaoModal(false);
      setReturnExpedicaoReason('');
      showToast(`Frete ${updated.protocol} devolvido à Expedição para correção.`);
    } catch (err) {
      setErrorMsg(sanitizeApiErrorMessage(err, 'Erro ao devolver à Expedição.'));
    } finally {
      setActionBusy(false);
    }
  };

  const handleReopenFreight = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFreight) return;
    if (reopenReason.trim().length < 5) {
      setErrorMsg('Informe o motivo obrigatório para reabrir o frete (mínimo 5 caracteres).');
      return;
    }
    setActionBusy(true);
    setErrorMsg(null);
    try {
      const res = await apiReopenFreight(selectedFreight.id, {
        motivo: reopenReason.trim(),
        targetStage:
          selectedFreight.situacaoMonitoramento === 'FINALIZADO' && reopenTargetStage === 'ENTREGUE'
            ? 'ENTREGUE'
            : 'NO_LOCAL_ENTREGA',
        baseRevision: selectedFreight.revision,
      });
      if (!res.ok || !res.freight) {
        setErrorMsg(sanitizeApiErrorMessage(res.error, 'Erro ao reabrir frete.'));
        return;
      }
      const updated = res.freight;
      await syncAfterFreightMutation(updated, { historico: res.historico });
      syncMonitoringFormFromRecord(updated);
      setShowReopenModal(false);
      setReopenReason('');
      showToast(
        `Frete ${updated.protocol} reaberto para "${formatSituacaoMonitoramentoLabel(
          updated.situacaoMonitoramento
        )}".`
      );
      if (updated.situacaoMonitoramento !== 'ENTREGUE' && panelMode === 'FINALIZADOS') {
        setPanelMode('ATIVOS');
      }
    } catch (err) {
      setErrorMsg(sanitizeApiErrorMessage(err, 'Erro ao reabrir frete.'));
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
        setErrorMsg(sanitizeApiErrorMessage(res.error, 'Erro ao registrar ocorrência.'));
        return;
      }
      const updated = res.freight;
      await syncAfterFreightMutation(updated, {
        ocorrencias: res.ocorrencias,
        historico: res.historico,
      });
      setOccTitulo('');
      setOccDescricao('');
      showToast('Ocorrência de monitoramento registrada.');
    } catch (err) {
      setErrorMsg(sanitizeApiErrorMessage(err, 'Erro ao registrar ocorrência.'));
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
        setErrorMsg(sanitizeApiErrorMessage(res.error, 'Erro ao resolver ocorrência.'));
        return;
      }
      const updated = res.freight;
      await syncAfterFreightMutation(updated, {
        ocorrencias: res.ocorrencias,
        historico: res.historico,
      });
      showToast('Ocorrência marcada como resolvida.');
    } catch (err) {
      setErrorMsg(sanitizeApiErrorMessage(err, 'Erro ao resolver ocorrência.'));
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
        setErrorMsg(sanitizeApiErrorMessage(res.error, 'Erro ao enviar anexo.'));
        return;
      }

      const updated = res.freight;
      await syncAfterFreightMutation(updated, {
        anexos: res.anexos,
        historico: res.historico,
      });
      showToast(`Comprovante/anexo "${file.name}" enviado.`);
    } catch (err) {
      setErrorMsg(sanitizeApiErrorMessage(err, 'Erro ao enviar anexo.'));
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
        setErrorMsg(sanitizeApiErrorMessage(res.error, 'Erro ao conferir comprovante.'));
        return;
      }
      const updated = res.freight;
      await syncAfterFreightMutation(updated, {
        anexos: res.anexos,
        historico: res.historico,
      });
      showToast('Comprovante conferido e validado.');
    } catch (err) {
      setErrorMsg(sanitizeApiErrorMessage(err, 'Erro ao conferir comprovante.'));
    } finally {
      setAttBusy(false);
    }
  };

  const handleTransferMonitoramento = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFreight || !transferTargetId || !transferMotivo.trim()) return;
    setTransferBusy(true);
    try {
      const res = await apiTransferFreightResponsibility(selectedFreight.id, {
        sector: 'MONITORAMENTO',
        newResponsibleId: transferTargetId,
        reason: transferMotivo.trim(),
        baseRevision: selectedFreight.revision,
      });
      if (!res.ok || !res.freight) {
        setErrorMsg(sanitizeApiErrorMessage(res.error, 'Erro ao transferir responsabilidade.'));
        return;
      }
      const updated = res.freight;
      await syncAfterFreightMutation(updated, { historico: res.historico });
      setTransferTargetId('');
      setTransferMotivo('');
      showToast('Responsabilidade de monitoramento transferida.');
    } catch (err) {
      setErrorMsg(sanitizeApiErrorMessage(err, 'Erro ao transferir responsabilidade.'));
    } finally {
      setTransferBusy(false);
    }
  };

  const activeTotalMatched = activeQuery.data?.totalMatched ?? freights.length;
  const activeTotalPages = activeQuery.data?.totalPages ?? Math.max(1, Math.ceil(activeTotalMatched / FREIGHT_PAGE_SIZE));
  const finTotalMatched = finalizedQuery.data?.totalMatched ?? finalizedRows.length;
  const finTotalPages = finalizedQuery.data?.totalPages ?? Math.max(1, Math.ceil(finTotalMatched / FREIGHT_PAGE_SIZE));

  return (
    <div className="fa-surface space-y-4">
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed bottom-5 right-5 z-50 bg-[#080B0D] text-white border-l-4 border-[#FFD400] px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2.5 text-xs font-bold max-w-md">
          <CheckCircle2 className="w-4 h-4 text-[#FFD400] shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* 1. HEADER */}
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
              Fretes Ativos — Monitoramento Operacional
            </h1>
            {hasExpedicaoAccess && onSwitchToExpedicao && (
              <button
                type="button"
                onClick={onSwitchToExpedicao}
                className="inline-flex items-center gap-1.5 text-[11px] font-extrabold bg-[#FFD400] text-slate-950 px-3 py-1 rounded-lg hover:bg-[#ffe033] transition cursor-pointer"
              >
                <ArrowRight className="w-3.5 h-3.5" />
                <span>Ir para Expedição</span>
              </button>
            )}
            {canImportComercialScript && (
              <button
                type="button"
                onClick={() => setIsScriptModalOpen(true)}
                className="inline-flex items-center gap-1.5 text-[11px] font-extrabold bg-white/95 text-slate-950 px-3 py-1 rounded-lg hover:bg-white transition cursor-pointer"
              >
                <ClipboardPaste className="w-3.5 h-3.5" />
                <span>Importar Script</span>
              </button>
            )}
          </div>
          <p className="text-xs text-gray-200 font-medium mt-1">
            Acompanhamento em tempo real da coleta à entrega dos fretes liberados pela Expedição
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
            <span className="text-xs font-semibold text-[#FFD400]">Monitoramento</span>
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {errorMsg && (
        <div className="bg-red-50 border border-red-200 text-red-900 rounded-xl p-3 text-xs font-bold flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-[#E5252A] shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="text-red-700 hover:text-red-950 font-black cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 2. TOP SUMMARY CARDS */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="bg-white rounded-2xl p-3.5 border border-gray-200/80 shadow-2xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200/60 flex items-center justify-center text-amber-700 shrink-0">
            <Truck className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-gray-500">Novos p/ carregar</p>
            <p className="text-xl font-black text-amber-800 tabular-nums leading-tight">
              {stats.novosParaCarregar}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-3.5 border border-gray-200/80 shadow-2xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200/60 flex items-center justify-center text-blue-700 shrink-0">
            <Navigation className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-gray-500">Desloc. / Na coleta</p>
            <p className="text-xl font-black text-blue-800 tabular-nums leading-tight">
              {stats.emColetaDeslocamento}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-3.5 border border-gray-200/80 shadow-2xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-200/60 flex items-center justify-center text-sky-700 shrink-0">
            <MapPin className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-gray-500">Em trânsito / Entrega</p>
            <p className="text-xl font-black text-sky-800 tabular-nums leading-tight">
              {stats.emTransporteEntrega}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setPanelMode('FINALIZADOS')}
          className={`rounded-2xl p-3.5 border shadow-2xs flex items-center gap-3 text-left transition cursor-pointer ${
            panelMode === 'FINALIZADOS'
              ? 'bg-emerald-50 border-emerald-400 ring-2 ring-emerald-200'
              : 'bg-white border-gray-200/80 hover:border-emerald-300'
          }`}
          title="Abrir histórico compacto de fretes finalizados e entregues"
        >
          <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200/60 flex items-center justify-center text-emerald-700 shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-gray-500">Finalizados / Entregues</p>
            <p className="text-xl font-black text-emerald-700 tabular-nums leading-tight">
              {stats.finalizados}
            </p>
          </div>
        </button>

        <div className="bg-white rounded-2xl p-3.5 border border-gray-200/80 shadow-2xs flex items-center gap-3 col-span-2 lg:col-span-1">
          <div className="w-10 h-10 rounded-xl bg-red-50 border border-red-200/60 flex items-center justify-center text-[#E5252A] shrink-0">
            <AlertCircle className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-gray-500">Pendências</p>
            <p className="text-xl font-black text-[#E5252A] tabular-nums leading-tight">
              {stats.pendencias}
            </p>
          </div>
        </div>
      </div>

      {/* 3. FILTER BAR (CONTEXTUAL: ATIVOS vs FINALIZADOS) */}
      {panelMode === 'ATIVOS' ? (
        <div className="bg-white rounded-2xl p-3 border border-gray-200/80 shadow-2xs flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2 flex-1">
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar protocolo, motorista, placa, localização..."
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#F3F5F7] border border-gray-200 text-xs text-[#15191D] placeholder-gray-400 focus:outline-none focus:border-[#FFD400]"
              />
            </div>

            <div className="inline-flex items-center gap-1.5 bg-[#F3F5F7] border border-gray-200 rounded-xl px-2.5 py-1.5 text-xs">
              <User className="w-3.5 h-3.5 text-gray-500" />
              <select
                value={viewScope === 'MINE' ? 'MINE' : responsibleFilterId || 'TEAM'}
                onChange={(e) => changeScopeFilter(e.target.value)}
                className="bg-transparent font-semibold text-[#15191D] focus:outline-none cursor-pointer"
              >
                <option value="MINE">
                  Meus fretes em monitoramento ({currentUser.name.split(' ')[0]})
                </option>
                {canViewTeam && <option value="TEAM">Todos os Operadores (Equipe)</option>}
                {canViewTeam &&
                  monitoramentoOperators.map((op) => (
                    <option key={op.id} value={op.id}>
                      Operador: {op.name}
                    </option>
                  ))}
              </select>
            </div>

            <div className="inline-flex items-center gap-1.5 bg-[#F3F5F7] border border-gray-200 rounded-xl px-2.5 py-1.5 text-xs">
              <select
                value={stageFilter}
                onChange={(e) => {
                  setStageFilter(e.target.value);
                  setActivePage(1);
                }}
                className="bg-transparent font-semibold text-[#15191D] focus:outline-none cursor-pointer"
              >
                <option value="TODOS">Etapa ativa: Todas</option>
                {MONITORING_STAGES_ORDER.filter(
                  (s) => s.id !== 'ENTREGUE' && s.id !== 'FINALIZADO'
                ).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="inline-flex items-center gap-1.5 bg-[#F3F5F7] border border-gray-200 rounded-xl px-2.5 py-1.5 text-xs">
              <Calendar className="w-3.5 h-3.5 text-gray-500" />
              <select
                value={periodFilter}
                onChange={(e) => {
                  setPeriodFilter(e.target.value as 'HOJE' | 'SEMANA' | 'MES' | 'TODOS');
                  setActivePage(1);
                }}
                className="bg-transparent font-semibold text-[#15191D] focus:outline-none cursor-pointer"
              >
                <option value="TODOS">Todos os dias</option>
                <option value="HOJE">Coletas de hoje</option>
                <option value="SEMANA">Esta semana</option>
                <option value="MES">Este mês</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setFinPage(1);
                setPanelMode('FINALIZADOS');
              }}
              className="inline-flex items-center gap-1.5 bg-[#080B0D] hover:bg-gray-800 text-[#FFD400] text-xs font-extrabold px-3.5 py-2 rounded-xl shadow-xs cursor-pointer transition"
            >
              <Archive className="w-3.5 h-3.5" />
              <span>Ver Finalizados</span>
              <span className="ml-0.5 px-1.5 py-0.5 rounded-md bg-[#FFD400] text-[#080B0D] text-[10px] font-black tabular-nums">
                {stats.finalizados}
              </span>
            </button>

            <button
              type="button"
              onClick={() => void handleManualRefresh()}
              className="inline-flex items-center gap-1.5 bg-[#F3F5F7] hover:bg-gray-200 text-[#15191D] text-xs font-bold px-3 py-2 rounded-xl border border-gray-200 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Atualizar</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl p-3 border border-emerald-200 shadow-2xs flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2 flex-1">
            <button
              type="button"
              onClick={() => setPanelMode('ATIVOS')}
              className="inline-flex items-center gap-1.5 bg-[#080B0D] hover:bg-gray-800 text-[#FFD400] text-xs font-extrabold px-3.5 py-2 rounded-xl cursor-pointer transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Voltar aos Ativos</span>
            </button>

            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={finSearchInput}
                onChange={(e) => setFinSearchInput(e.target.value)}
                placeholder="Buscar protocolo, motorista, cliente, rota..."
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#F3F5F7] border border-gray-200 text-xs text-[#15191D] placeholder-gray-400 focus:outline-none focus:border-[#FFD400]"
              />
            </div>

            <div className="inline-flex items-center gap-1.5 bg-[#F3F5F7] border border-gray-200 rounded-xl px-2.5 py-1.5 text-xs">
              <User className="w-3.5 h-3.5 text-gray-500" />
              <select
                value={viewScope === 'MINE' ? 'MINE' : responsibleFilterId || 'TEAM'}
                onChange={(e) => changeScopeFilter(e.target.value)}
                className="bg-transparent font-semibold text-[#15191D] focus:outline-none cursor-pointer"
              >
                <option value="MINE">
                  Meus finalizados ({currentUser.name.split(' ')[0]})
                </option>
                {canViewTeam && <option value="TEAM">Todos os Operadores (Equipe)</option>}
                {canViewTeam &&
                  monitoramentoOperators.map((op) => (
                    <option key={op.id} value={op.id}>
                      Operador: {op.name}
                    </option>
                  ))}
              </select>
            </div>

            <div className="inline-flex items-center gap-1.5 bg-[#F3F5F7] border border-gray-200 rounded-xl px-2.5 py-1.5 text-xs">
              <select
                value={finStatusFilter}
                onChange={(e) => {
                  setFinStatusFilter(e.target.value as 'TODAS' | 'FINALIZADO' | 'ENTREGUE');
                  setFinPage(1);
                }}
                className="bg-transparent font-semibold text-[#15191D] focus:outline-none cursor-pointer"
              >
                <option value="TODAS">Status: Finalizados e Entregues</option>
                <option value="FINALIZADO">Somente Finalizado</option>
                <option value="ENTREGUE">Somente Entregue</option>
              </select>
            </div>

            <div className="inline-flex items-center gap-1.5 bg-[#F3F5F7] border border-gray-200 rounded-xl px-2.5 py-1.5 text-xs">
              <Calendar className="w-3.5 h-3.5 text-gray-500" />
              <select
                value={finPeriodFilter}
                onChange={(e) => {
                  setFinPeriodFilter(e.target.value as 'HOJE' | 'SEMANA' | 'MES' | 'TODOS');
                  setFinPage(1);
                }}
                className="bg-transparent font-semibold text-[#15191D] focus:outline-none cursor-pointer"
              >
                <option value="TODOS">Todo o período</option>
                <option value="HOJE">Hoje</option>
                <option value="SEMANA">Últimos 7 dias</option>
                <option value="MES">Este mês</option>
              </select>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void handleManualRefresh()}
            className="inline-flex items-center gap-1.5 bg-[#F3F5F7] hover:bg-gray-200 text-[#15191D] text-xs font-bold px-3 py-2 rounded-xl border border-gray-200 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </button>
        </div>
      )}

      {/* 4. CARDS ATIVOS OU TABELA COMPACTA DE FINALIZADOS */}
      <div className="fa-workspace">
        {panelMode === 'ATIVOS' ? (
          <div className="fa-card-region">
            <div className="fa-list-meta">
              <span>
                {activeTotalMatched} frete(s) ativo(s) encontrado(s) • Página {activePage} de{' '}
                {activeTotalPages}
              </span>
              <span>Monitoramento operacional ({FREIGHT_PAGE_SIZE} por página)</span>
            </div>
            {loading && freights.length === 0 ? (
              <div className="fa-empty" role="status">
                <RefreshCw className="h-7 w-7 animate-spin text-slate-300" />
                Carregando fretes ativos em monitoramento...
              </div>
            ) : freights.length === 0 ? (
              <div className="fa-empty">
                <Truck className="h-9 w-9 text-slate-300" />
                <strong className="text-sm text-slate-600">Nenhum frete ativo encontrado</strong>
                <p>
                  Fretes entregues ou finalizados ficam disponíveis em &quot;Ver Finalizados&quot;.
                </p>
              </div>
            ) : (
              <>
                <div className="fa-card-grid">
                  {freights.map((f) => (
                    <FreightCard
                      key={f.id}
                      freight={f}
                      userId={currentUser.id}
                      selected={selectedFreight?.id === f.id}
                      showPendingOrderBadge={isOperationalProfile}
                      onOpen={(event) => {
                        detailTriggerRef.current = event.currentTarget;
                        handleSelectFreight(f);
                      }}
                    />
                  ))}
                </div>
                {activeTotalPages > 1 && (
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 bg-white rounded-2xl border border-slate-200 px-4 py-3 shadow-2xs">
                    <span className="text-xs font-semibold text-slate-600">
                      Mostrando {(activePage - 1) * FREIGHT_PAGE_SIZE + 1}–
                      {Math.min(activePage * FREIGHT_PAGE_SIZE, activeTotalMatched)} de{' '}
                      {activeTotalMatched} ativos
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={activePage <= 1 || loading}
                        onClick={() => setActivePage((p) => Math.max(1, p - 1))}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                        Anterior
                      </button>
                      <span className="px-3 py-1.5 rounded-xl bg-[#080B0D] text-[#FFD400] text-xs font-black tabular-nums">
                        {activePage} / {activeTotalPages}
                      </span>
                      <button
                        type="button"
                        disabled={activePage >= activeTotalPages || loading}
                        onClick={() => setActivePage((p) => Math.min(activeTotalPages, p + 1))}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                      >
                        Próxima
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-slate-100 bg-slate-50/70">
              <div className="flex items-center gap-2">
                <Archive className="w-4 h-4 text-emerald-700" />
                <h2 className="text-sm font-black text-[#15191D]">
                  Histórico de Fretes Finalizados e Entregues
                </h2>
              </div>
              <span className="text-xs font-semibold text-slate-500">
                {finTotalMatched} registro(s) • Página {finPage} de {finTotalPages}
              </span>
            </div>

            {loading && finalizedRows.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2 text-xs font-semibold text-slate-500">
                <RefreshCw className="w-6 h-6 animate-spin text-slate-400" />
                <span>Carregando fretes finalizados...</span>
              </div>
            ) : finalizedRows.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2 text-center px-4">
                <CheckCircle2 className="w-8 h-8 text-slate-300" />
                <p className="text-sm font-bold text-slate-600">
                  Nenhum frete finalizado ou entregue encontrado
                </p>
                <p className="text-xs text-slate-400">
                  Ajuste os filtros de busca ou período para visualizar outros registros históricos.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-extrabold uppercase tracking-wide text-slate-500">
                      <th className="py-2.5 px-3.5">Protocolo</th>
                      <th className="py-2.5 px-3.5">Motorista</th>
                      <th className="py-2.5 px-3.5">Cliente</th>
                      <th className="py-2.5 px-3.5">Rota</th>
                      <th className="py-2.5 px-3.5">Data de Entrega</th>
                      <th className="py-2.5 px-3.5">Status</th>
                      <th className="py-2.5 px-3.5 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {finalizedRows.map((f) => (
                      <tr
                        key={f.id}
                        className="hover:bg-amber-50/40 transition-colors"
                      >
                        <td className="py-2.5 px-3.5 font-mono font-black text-[#080B0D] whitespace-nowrap">
                          {f.protocol}
                        </td>
                        <td className="py-2.5 px-3.5 font-semibold text-slate-800 whitespace-nowrap">
                          {f.motoristaNome || 'Não informado'}
                        </td>
                        <td className="py-2.5 px-3.5 font-bold text-[#15191D] max-w-[220px] truncate">
                          {f.cliente}
                        </td>
                        <td className="py-2.5 px-3.5 text-slate-700 whitespace-nowrap">
                          {f.origemCidadeUf} → {f.destinoCidadeUf}
                        </td>
                        <td className="py-2.5 px-3.5 text-slate-600 whitespace-nowrap tabular-nums">
                          {f.entregaComprovadaEm || formatIsoDateBr(f.dataEntregaPrevistaIso)}
                        </td>
                        <td className="py-2.5 px-3.5 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-extrabold ${getMonitoringBadgeStyle(
                              f.situacaoMonitoramento
                            )}`}
                          >
                            {formatSituacaoMonitoramentoLabel(f.situacaoMonitoramento)}
                          </span>
                        </td>
                        <td className="py-2.5 px-3.5 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={(event) => {
                              detailTriggerRef.current = event.currentTarget;
                              handleSelectFreight(f);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#080B0D] hover:bg-gray-800 text-[#FFD400] text-[11px] font-extrabold cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Detalhes</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {finTotalPages > 1 && (
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-slate-100 bg-slate-50/50">
                <span className="text-xs font-semibold text-slate-600">
                  Mostrando {(finPage - 1) * FREIGHT_PAGE_SIZE + 1}–
                  {Math.min(finPage * FREIGHT_PAGE_SIZE, finTotalMatched)} de {finTotalMatched}{' '}
                  registros
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={finPage <= 1 || loading}
                    onClick={() => setFinPage((p) => Math.max(1, p - 1))}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    Anterior
                  </button>
                  <span className="px-3 py-1.5 rounded-xl bg-[#080B0D] text-[#FFD400] text-xs font-black tabular-nums">
                    {finPage} / {finTotalPages}
                  </span>
                  <button
                    type="button"
                    disabled={finPage >= finTotalPages || loading}
                    onClick={() => setFinPage((p) => Math.min(finTotalPages, p + 1))}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                  >
                    Próxima
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {selectedFreight && (
          <CorporateModal
            isOpen={Boolean(selectedFreight)}
            onClose={closeDetailModal}
            maxWidth="5xl"
            icon={<Truck className="w-5 h-5" />}
            title={`Detalhes do Frete — ${selectedFreight.protocol}`}
            badge={
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-lg border px-2.5 py-0.5 text-xs font-extrabold ${getMonitoringBadgeStyle(
                    selectedFreight.situacaoMonitoramento
                  )}`}
                >
                  {formatSituacaoMonitoramentoLabel(selectedFreight.situacaoMonitoramento)}
                </span>
                {selectedFreight.empresaMarca &&
                  (CARRIER_BRANDS as readonly string[]).includes(selectedFreight.empresaMarca) && (
                    <span className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 px-2 py-0.5">
                      <CarrierBrandLogo brand={selectedFreight.empresaMarca} size="sm" />
                    </span>
                  )}
                {isOperationalProfile &&
                  selectedFreight.ordemColetaPendente &&
                  !selectedFreight.ordemCarregamentoNumero && (
                    <span className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-extrabold text-amber-900">
                      <Clock className="w-3 h-3" />
                      Ordem de coleta pendente
                    </span>
                  )}
              </div>
            }
            subtitle={`${selectedFreight.cliente} • ${selectedFreight.origemCidadeUf} → ${selectedFreight.destinoCidadeUf} • Financeiro: ${formatSituacaoFinanceiraLabel(
              selectedFreight.situacaoFinanceira
            )}`}
            headerRight={
              selectedFreight.empresaMarca !== 'AXD' && (
                <button
                  type="button"
                  onClick={() => setOrderModalFreight(selectedFreight)}
                  className="hidden sm:inline-flex items-center gap-1.5 bg-[#FFD400] hover:bg-[#ffe033] text-[#080B0D] font-extrabold px-3 py-1.5 rounded-xl text-xs cursor-pointer shadow-2xs"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Ordem de Coleta</span>
                </button>
              )
            }
            footer={
              <div className="flex flex-wrap items-center justify-between gap-2 w-full">
                <div className="flex flex-wrap items-center gap-2">
                  {selectedFreight.empresaMarca !== 'AXD' && (
                    <button
                      type="button"
                      onClick={() => setOrderModalFreight(selectedFreight)}
                      className="inline-flex items-center gap-1.5 bg-white hover:bg-slate-100 text-[#15191D] border border-slate-300 font-extrabold px-3.5 py-2 rounded-xl text-xs cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Ordem de Coleta (PDF)</span>
                    </button>
                  )}
                  {selectedFreight.situacaoMonitoramento !== 'FINALIZADO' &&
                    selectedFreight.situacaoMonitoramento !== 'ENTREGUE' && (
                      <button
                        type="button"
                        onClick={() => setShowReturnExpedicaoModal(true)}
                        className="inline-flex items-center gap-1.5 bg-red-50 hover:bg-red-100 text-[#E5252A] border border-red-200 font-extrabold px-3.5 py-2 rounded-xl text-xs cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Devolver à Expedição</span>
                      </button>
                    )}
                  {canReopenSelected && (
                    <button
                      type="button"
                      onClick={() => {
                        setReopenTargetStage('NO_LOCAL_ENTREGA');
                        setReopenReason('');
                        setShowReopenModal(true);
                      }}
                      className="inline-flex items-center gap-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 font-extrabold px-3.5 py-2 rounded-xl text-xs cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Reabrir frete</span>
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {activeTab !== 'ACOMPANHAMENTO' &&
                    selectedFreight.situacaoMonitoramento !== 'FINALIZADO' && (
                      <button
                        type="button"
                        onClick={() => setActiveTab('ACOMPANHAMENTO')}
                        className="inline-flex items-center gap-1.5 bg-[#FFD400] hover:bg-[#ffe033] text-[#080B0D] font-extrabold px-4 py-2 rounded-xl text-xs cursor-pointer shadow-xs"
                      >
                        <Navigation className="w-3.5 h-3.5" />
                        <span>Atualizar Etapa / Monitorar</span>
                      </button>
                    )}
                  <button
                    type="button"
                    data-detail-close
                    onClick={closeDetailModal}
                    className="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-xs font-bold text-slate-700 cursor-pointer"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            }
          >
            <div id="active-freight-content" className="space-y-3.5">
              {/* 4 Indicadores Rápidos no Topo */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 text-slate-700 flex items-center justify-center shrink-0">
                    <Calendar size={16} />
                  </div>
                  <div className="min-w-0">
                    <span className="block text-[11px] font-medium text-slate-500">Data da Coleta</span>
                    <strong className="block text-xs sm:text-sm font-extrabold text-[#15191D] truncate">
                      {formatIsoDateBr(selectedFreight.dataColetaIso)}
                    </strong>
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 text-rose-600 flex items-center justify-center shrink-0">
                    <Flag size={16} />
                  </div>
                  <div className="min-w-0">
                    <span className="block text-[11px] font-medium text-slate-500">Previsão de Entrega</span>
                    <strong className="block text-xs sm:text-sm font-extrabold text-[#15191D] truncate">
                      {formatIsoDateBr(selectedFreight.dataEntregaPrevistaIso)}
                    </strong>
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 text-slate-700 flex items-center justify-center shrink-0">
                    <Truck size={16} />
                  </div>
                  <div className="min-w-0">
                    <span className="block text-[11px] font-medium text-slate-500">Veículo</span>
                    <strong className="block text-xs sm:text-sm font-extrabold text-[#15191D] font-mono truncate">
                      {selectedFreight.placaVeiculo || 'Não informado'}
                    </strong>
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 text-slate-700 flex items-center justify-center shrink-0">
                    <User size={16} />
                  </div>
                  <div className="min-w-0">
                    <span className="block text-[11px] font-medium text-slate-500">Motorista</span>
                    <strong className="block text-xs sm:text-sm font-extrabold text-[#15191D] truncate">
                      {selectedFreight.motoristaNome || 'Não informado'}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Barra de Abas Clara */}
              <div
                className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1.5 rounded-xl border border-slate-200"
                role="group"
                aria-label="Seções dos detalhes do frete"
              >
                {[
                  { id: 'RESUMO', label: 'Resumo' },
                  { id: 'DADOS_ORDEM', label: 'Motorista e Veículo' },
                  { id: 'ACOMPANHAMENTO', label: 'Monitoramento' },
                  { id: 'ANEXOS', label: `Documentos (${detailAnexos.length})` },
                  { id: 'OCORRENCIAS', label: `Ocorrências (${detailOcorrencias.length})` },
                  { id: 'HISTORICO', label: 'Histórico' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    aria-pressed={activeTab === tab.id}
                    aria-controls="active-freight-content"
                    onClick={() => setActiveTab(tab.id as typeof activeTab)}
                    className={`flex-1 min-w-[110px] px-3 py-2 text-xs font-extrabold rounded-lg transition cursor-pointer text-center ${
                      activeTab === tab.id
                        ? 'bg-[#080B0D] text-[#FFD400] shadow-xs'
                        : 'bg-white text-slate-700 border border-slate-200/80 hover:bg-slate-50 hover:text-[#080B0D]'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Etapas do Monitoramento — Visão Clara e Compacta */}
              <section
                className="bg-white rounded-2xl border border-slate-200 p-3.5 shadow-2xs"
                aria-label="Etapas do monitoramento"
              >
                <div className="flex items-center justify-between gap-2 mb-2.5">
                  <p className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wide">
                    Etapas do monitoramento
                  </p>
                  <span className="text-xs font-semibold text-slate-500">
                    Etapa atual: <strong className="text-[#15191D]">{formatSituacaoMonitoramentoLabel(selectedFreight.situacaoMonitoramento)}</strong>
                  </span>
                </div>
                <ol className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-1.5">
                  {MONITORING_STAGES_ORDER.map((st, idx) => {
                    const currentIdx = MONITORING_STAGES_ORDER.findIndex(
                      (s) => s.id === selectedFreight.situacaoMonitoramento
                    );
                    const isCurrent = st.id === selectedFreight.situacaoMonitoramento;
                    const isDone = currentIdx > idx;
                    return (
                      <li
                        key={st.id}
                        data-state={isCurrent ? 'current' : isDone ? 'done' : 'pending'}
                        aria-current={isCurrent ? 'step' : undefined}
                        className={`flex items-center gap-2 p-2 rounded-xl border text-[11px] transition ${
                          isCurrent
                            ? 'bg-[#FFFBEB] border-[#FFD400] text-[#080B0D] font-bold shadow-2xs'
                            : isDone
                            ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900 font-semibold'
                            : 'bg-slate-50 border-slate-200/80 text-slate-600 font-medium'
                        }`}
                      >
                        <span
                          className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-extrabold shrink-0 ${
                            isCurrent
                              ? 'bg-[#FFD400] text-[#080B0D]'
                              : isDone
                              ? 'bg-emerald-600 text-white'
                              : 'bg-white border border-slate-300 text-slate-600'
                          }`}
                          aria-hidden="true"
                        >
                          {isDone ? <Check size={11} /> : idx + 1}
                        </span>
                        <span className="leading-tight">{st.shortLabel}</span>
                      </li>
                    );
                  })}
                </ol>
              </section>

              {activeTab === 'RESUMO' && <FreightOverview freight={selectedFreight} />}
              {/* TAB 1: ACOMPANHAMENTO E AVANÇO DE ETAPA */}
              {activeTab === 'ACOMPANHAMENTO' && (
                <div className="space-y-3.5">

                  <h3 className="pt-2 text-xs font-black text-slate-700">Operação do monitoramento</h3>

                  {selectedFreight.situacaoMonitoramento === 'FINALIZADO' ? (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 space-y-2">
                      <div className="flex items-center gap-2 text-emerald-900 font-black text-xs">
                        <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                        <span>Frete Finalizado — Registro Histórico Protegido</span>
                      </div>
                      <p className="text-xs text-emerald-900/90 leading-relaxed">
                        Este frete foi concluído e permanece arquivado na lista de Finalizados. Caso seja necessária alguma correção ou reconferência, utilize a opção <strong>Reabrir frete</strong>.
                      </p>
                      {canReopenSelected && (
                        <button
                          type="button"
                          onClick={() => {
                            setReopenTargetStage('NO_LOCAL_ENTREGA');
                            setReopenReason('');
                            setShowReopenModal(true);
                          }}
                          className="inline-flex items-center gap-1.5 bg-[#080B0D] hover:bg-gray-800 text-[#FFD400] font-extrabold px-3.5 py-2 rounded-xl text-xs cursor-pointer"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Reabrir frete</span>
                        </button>
                      )}
                    </div>
                  ) : (
                    <>
                  {/* Avançar Etapa do Monitoramento */}
                  <form
                    onSubmit={(e) => void handleAdvanceMonitoringStage(e)}
                    className="fa-monitoring-form bg-[#FFFDF0] border-2 border-[#FFD400] rounded-2xl p-3.5 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-black text-[#080B0D] uppercase">
                        Avançar Etapa do Monitoramento
                      </p>
                      <span className="text-[10px] font-bold text-gray-600">
                        Atual: {formatSituacaoMonitoramentoLabel(selectedFreight.situacaoMonitoramento)}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label htmlFor="fa-next-stage" className="block text-[11px] font-extrabold text-[#15191D] mb-1">
                          Nova Etapa *
                        </label>
                        <select id="fa-next-stage"
                          value={targetNextStage}
                          onChange={(e) =>
                            setTargetNextStage(e.target.value as MonitoringFreightStatus)
                          }
                          className="w-full px-2.5 py-2 rounded-xl border border-gray-300 bg-white text-xs font-bold text-[#15191D]"
                        >
                          {MONITORING_STAGES_ORDER.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label htmlFor="fa-real-event" className="block text-[11px] font-extrabold text-[#15191D] mb-1">
                          Horário Real do Evento (informado)
                        </label>
                        <input id="fa-real-event"
                          type="text"
                          value={realEventTimeInput}
                          onChange={(e) => setRealEventTimeInput(e.target.value)}
                          placeholder="Ex.: 29/10/2026 14:30"
                          className="w-full px-2.5 py-2 rounded-xl border border-gray-300 bg-white text-xs"
                        />
                      </div>

                      <label className="block sm:col-span-2 text-[11px] font-bold text-gray-700">Endereço detalhado de entrega<input className="mt-1 block w-full rounded-xl border border-gray-300 bg-white px-2.5 py-2 text-xs" value={deliveryAddress} onChange={e=>setDeliveryAddress(e.target.value)} maxLength={240}/></label>
<div className="sm:col-span-2">
                        <label htmlFor="fa-location" className="block text-[11px] font-extrabold text-[#15191D] mb-1">
                          Localização Informada pelo Motorista (sem simulação de GPS)
                        </label>
                        <input id="fa-location"
                          type="text"
                          value={informedLocationInput}
                          onChange={(e) => setInformedLocationInput(e.target.value)}
                          placeholder="Ex.: BR-116 km 420 — Feira de Santana/BA (Posto São Gonçalo)"
                          className="w-full px-2.5 py-1.5 rounded-xl border border-gray-300 bg-white text-xs"
                        />
                      </div>

                      <div>
                        <label htmlFor="fa-expected-delivery" className="block text-[11px] font-bold text-gray-700 mb-1">
                          Previsão Atualizada de Entrega
                        </label>
                        <input id="fa-expected-delivery"
                          type="date"
                          value={previsaoEntregaInput}
                          onChange={(e) => setPrevisaoEntregaInput(e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-xl border border-gray-300 bg-white text-xs"
                        />
                      </div>

                      <div>
                        <label htmlFor="fa-stage-note" className="block text-[11px] font-bold text-gray-700 mb-1">
                          Observação da Etapa
                        </label>
                        <input id="fa-stage-note"
                          type="text"
                          value={stageObservationInput}
                          onChange={(e) => setStageObservationInput(e.target.value)}
                          placeholder="Ex.: Motorista iniciou carregamento na doca 4"
                          className="w-full px-2.5 py-1.5 rounded-xl border border-gray-300 bg-white text-xs"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label htmlFor="fa-driver-guidance" className="block text-[11px] font-bold text-gray-700 mb-1">
                          Contatos e Orientações Passadas ao Motorista
                        </label>
                        <textarea id="fa-driver-guidance"
                          rows={2}
                          value={driverInstructionsInput}
                          onChange={(e) => setDriverInstructionsInput(e.target.value)}
                          placeholder="Orientações de rota, parada autorizada, envio de canhoto..."
                          className="w-full px-2.5 py-1.5 rounded-xl border border-gray-300 bg-white text-xs"
                        />
                      </div>
                    </div>

                    {/* Aviso de requisitos para Finalizar */}
                    {targetNextStage === 'FINALIZADO' && (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 text-[11px] text-amber-950 space-y-1">
                        <p className="font-extrabold">Requisitos para Finalizar o Frete:</p>
                        <p>
                          • Etapa anterior <strong>Entregue</strong> confirmada;
                        </p>
                        <p>
                          • <strong>Comprovante de Entrega</strong> anexado e marcado como{' '}
                          <strong>Conferido</strong> na aba Comprovantes;
                        </p>
                        <p>• Nenhuma ocorrência impeditiva em aberto.</p>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="submit"
                        disabled={actionBusy}
                        className="flex-1 bg-[#080B0D] hover:bg-gray-800 text-[#FFD400] font-black py-2.5 px-4 rounded-xl shadow-sm transition cursor-pointer text-xs"
                      >
                        {actionBusy
                          ? 'Salvando...'
                          : `Registrar Etapa: ${formatSituacaoMonitoramentoLabel(targetNextStage)}`}
                      </button>

                      <button
                        type="button"
                        disabled={actionBusy}
                        onClick={handleSaveLocationAndInstructions}
                        className="bg-white hover:bg-gray-100 text-[#15191D] border border-gray-300 font-extrabold py-2.5 px-3 rounded-xl transition cursor-pointer text-xs"
                      >
                        Salvar Localização / Orientação
                      </button>
                    </div>
                  </form>

                  {/* Botão Devolver à Expedição para Correção */}
                  <div className="flex items-center justify-between gap-2 pt-1">
                    {selectedFreight.empresaMarca !== 'AXD' ? (
                      <button
                        type="button"
                        onClick={() => setOrderModalFreight(selectedFreight)}
                        className="inline-flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 text-[#15191D] font-extrabold px-3 py-2 rounded-xl text-xs cursor-pointer"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>Ordem de Coleta (PDF)</span>
                      </button>
                    ) : <span />}

                    <button
                      type="button"
                      onClick={() => setShowReturnExpedicaoModal(true)}
                      className="inline-flex items-center gap-1.5 bg-red-50 hover:bg-red-100 text-[#E5252A] border border-red-200 font-extrabold px-3 py-2 rounded-xl text-xs cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Devolver à Expedição p/ correção</span>
                    </button>
                  </div>

                  {/* Transferência de Responsabilidade no Monitoramento */}
                  {isSupervisor && (
                    <form
                      onSubmit={handleTransferMonitoramento}
                      className="bg-[#F8FAFC] rounded-xl p-3 border border-gray-200 space-y-2"
                    >
                      <p className="text-[11px] font-extrabold text-[#15191D] uppercase">
                        Transferir Operador de Monitoramento
                      </p>
                      <select
                        value={transferTargetId}
                        onChange={(e) => setTransferTargetId(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-gray-300 text-xs bg-white"
                      >
                        <option value="">Selecione o novo Operador...</option>
                        {monitoramentoOperators.map((op) => (
                          <option key={op.id} value={op.id}>
                            {op.name} ({op.roleTitle})
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={transferMotivo}
                        onChange={(e) => setTransferMotivo(e.target.value)}
                        placeholder="Motivo da transferência de plantão/operador..."
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
                    </>
                  )}
                </div>
              )}

              {/* TAB 2: DADOS OPERACIONAIS E ORDEM DE COLETA */}
              {activeTab === 'DADOS_ORDEM' && (
                <div className="space-y-3">
                  <div className="bg-[#F8FAFC] rounded-xl p-3.5 border border-gray-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="font-extrabold text-[#15191D] uppercase text-[11px]">
                        Dados Operacionais Recebidos da Expedição
                      </p>
                      {selectedFreight.empresaMarca !== 'AXD' && (
                        <button
                          type="button"
                          onClick={() => setOrderModalFreight(selectedFreight)}
                          className="inline-flex items-center gap-1 bg-[#FFD400] text-[#080B0D] font-extrabold px-2.5 py-1 rounded-lg text-[11px] cursor-pointer"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span>Visualizar / Imprimir Ordem de Coleta</span>
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                      <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase">
                          Endereço de Coleta
                        </p>
                        <p className="font-bold text-[#15191D]">
                          {selectedFreight.enderecoColeta || '—'} ({selectedFreight.origemCidadeUf})
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase">
                          Endereço de Entrega
                        </p>
                        <p className="font-bold text-[#15191D]">
                          {selectedFreight.enderecoEntrega || '—'} ({selectedFreight.destinoCidadeUf})
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase">
                          Contato Coleta / Entrega
                        </p>
                        <p className="font-bold text-[#15191D]">
                          {selectedFreight.clienteContato || '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase">
                          Carga / Peso / Veículo
                        </p>
                        <p className="font-bold text-[#15191D]">
                          {selectedFreight.tipoCarga || '—'}{' '}
                          {selectedFreight.pesoKg ? `• ${selectedFreight.pesoKg} kg` : ''} •{' '}
                          {selectedFreight.veiculoNecessario || '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase">
                          Motorista / CPF
                        </p>
                        <p className="font-bold text-[#15191D]">
                          {selectedFreight.motoristaNome || '—'} ({selectedFreight.motoristaCpf || '—'})
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase">
                          Transportadora / Placas
                        </p>
                        <p className="font-bold text-[#15191D]">
                          {selectedFreight.transportadorNome || '—'} •{' '}
                          {selectedFreight.placaVeiculo || '—'}{' '}
                          {selectedFreight.placaCarreta ? `/ ${selectedFreight.placaCarreta}` : ''}
                        </p>
                      </div>
{(currentUser.accessProfile==='FINANCEIRO'||currentUser.accessProfile==='DIRETORIA'||currentUser.accessLevel==='ADMINISTRADOR')&&(                      <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase">
                          Valor Contratado Motorista
                        </p>
                        <p className="font-black text-[#15191D]">
                          {formatCentavosToBrl(selectedFreight.valorContratadoCentavos)}
                        </p>
                      </div>)}
                      <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase">
                          Situação Financeira Independente
                        </p>
                        <p className="font-bold text-[#15191D]">
                          {formatSituacaoFinanceiraLabel(selectedFreight.situacaoFinanceira)}
                        </p>
                      </div>
                    </div>

                    {(selectedFreight.instrucoesColetaEntrega ||
                      selectedFreight.condicoesOperacionais) && (
                      <div className="pt-2 border-t border-gray-200">
                        <p className="text-[10px] font-bold text-gray-400 uppercase">
                          Instruções de Coleta e Entrega
                        </p>
                        <p className="text-gray-700 mt-0.5">
                          {selectedFreight.instrucoesColetaEntrega ||
                            selectedFreight.condicoesOperacionais}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 3: COMPROVANTES E ANEXOS */}
              {activeTab === 'ANEXOS' && (
                <div className="space-y-3">
                  {selectedFreight.empresaMarca !== 'AXD' && (
                    <button
                      type="button"
                      className="fa-details-order-button"
                      onClick={() => setOrderModalFreight(selectedFreight)}
                    >
                      <Printer size={16} />
                      Ordem de Coleta
                    </button>
                  )}
                  <div className="bg-[#F8FAFC] p-3 rounded-xl border border-gray-200 space-y-2">
                    <p className="font-extrabold text-[#15191D]">
                      Anexar Comprovante de Entrega ou Documento
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={attCategory}
                        onChange={(e) =>
                          setAttCategory(e.target.value as FreightAttachmentCategory)
                        }
                        className="flex-1 px-2.5 py-1.5 rounded-lg border border-gray-300 text-xs bg-white"
                      >
                        <option value="COMPROVANTE_ENTREGA">
                          Comprovante de Entrega / Canhoto Assinado
                        </option>
                        <option value="CTE">CT-e / Nota Fiscal</option>
                        <option value="MDFE">MDF-e</option>
                        <option value="ORDEM_CARREGAMENTO">Ordem de Coleta</option>
                        <option value="OUTRO">Outro Anexo</option>
                      </select>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf,image/*"
                        onChange={handleUploadFile}
                        className="hidden"
                      />
                      <button
                        type="button"
                        disabled={attBusy}
                        onClick={() => fileInputRef.current?.click()}
                        className="inline-flex items-center gap-1.5 bg-[#FFD400] hover:bg-[#ffdf33] text-[#080B0D] font-extrabold px-3.5 py-1.5 rounded-lg cursor-pointer"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>{attBusy ? 'Enviando...' : 'Anexar Arquivo'}</span>
                      </button>
                    </div>
                  </div>

                  {detailAnexos.length === 0 ? (
                    <p className="text-center text-gray-400 py-6">
                      Nenhum comprovante ou anexo vinculado a este frete.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {detailAnexos.map((att) => (
                        <div
                          key={att.id}
                          className="p-3 rounded-xl border border-gray-200 flex items-center justify-between gap-2 bg-white"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-extrabold bg-gray-100 text-gray-700 px-2 py-0.5 rounded">
                                {att.category}
                              </span>
                              {att.conferido ? (
                                <span className="text-[10px] font-extrabold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded">
                                  ✓ Conferido ({att.conferidoPorNome})
                                </span>
                              ) : (
                                <span className="text-[10px] font-bold bg-amber-50 text-amber-800 px-2 py-0.5 rounded">
                                  Aguardando conferência
                                </span>
                              )}
                            </div>
                            <p className="font-bold text-[#15191D] truncate mt-1">
                              {att.fileName}
                            </p>
                            <p className="text-[10px] text-gray-400">
                              Enviado por {att.uploadedByName} em {att.uploadedAtFormatted}
                            </p>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() =>
                                void apiDownloadFreightAttachment(
                                  selectedFreight.id,
                                  att.id,
                                  att.fileName
                                )
                              }
                              className="inline-flex items-center gap-1 text-[11px] font-bold bg-gray-100 hover:bg-gray-200 text-[#15191D] px-2.5 py-1 rounded-lg cursor-pointer"
                            >
                              <Download className="w-3 h-3" />
                              <span>Baixar</span>
                            </button>
                            {!att.conferido && (
                              <button
                                type="button"
                                disabled={attBusy}
                                onClick={() => void handleVerifyAttachment(att.id)}
                                className="text-[11px] font-extrabold bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 rounded-lg cursor-pointer"
                              >
                                Conferir comprovante
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 4: OCORRÊNCIAS */}
              {(activeTab === 'OCORRENCIAS'||activeTab === 'ACOMPANHAMENTO') && (
                <div className="space-y-3">
                  <form
                    onSubmit={handleCreateOccurrence}
                    className="bg-[#F8FAFC] p-3 rounded-xl border border-gray-200 space-y-2"
                  >
                    <p className="font-extrabold text-[#15191D]">
                      Registrar Atraso, Ocorrência ou Pendência
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <input
                        type="text"
                        value={occTitulo}
                        onChange={(e) => setOccTitulo(e.target.value)}
                        placeholder="Título da ocorrência *"
                        className="sm:col-span-2 px-2.5 py-1.5 rounded-lg border border-gray-300 text-xs bg-white"
                      />
                      <select
                        value={occSeveridade}
                        onChange={(e) =>
                          setOccSeveridade(
                            e.target.value as 'BAIXA' | 'MEDIA' | 'IMPEDITIVA'
                          )
                        }
                        className="px-2.5 py-1.5 rounded-lg border border-gray-300 text-xs bg-white font-bold"
                      >
                        <option value="BAIXA">Informativa / Baixa</option>
                        <option value="MEDIA">Atenção / Atraso</option>
                        <option value="IMPEDITIVA">Impeditiva (Bloqueia Finalização)</option>
                      </select>
                    </div>
                    <textarea
                      rows={2}
                      value={occDescricao}
                      onChange={(e) => setOccDescricao(e.target.value)}
                      placeholder="Descrição detalhada da ocorrência em rota/coleta/entrega..."
                      className="w-full px-2.5 py-1.5 rounded-lg border border-gray-300 text-xs bg-white"
                    />
                    <button
                      type="submit"
                      disabled={occBusy || !occTitulo.trim()}
                      className="bg-[#080B0D] text-[#FFD400] font-extrabold px-3.5 py-1.5 rounded-lg text-xs cursor-pointer disabled:opacity-50"
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

              {/* TAB 5: HISTÓRICO COMPLETO DO ACOMPANHAMENTO */}
              {activeTab === 'HISTORICO' && (
                <div className="space-y-2">
                  {detailHistorico.map((h) => (
                    <div
                      key={h.id}
                      className="p-2.5 rounded-xl bg-[#F8FAFC] border border-gray-200"
                    >
                      <div className="flex items-center justify-between text-[10px] text-gray-400">
                        <span className="font-bold text-gray-600">
                          {h.actorName} ({h.actorSector})
                        </span>
                        <span>Reg.: {h.timestampFormatted}</span>
                      </div>
                      <p className="font-bold text-[#15191D] mt-0.5">{h.summary}</p>
                      {h.horarioRealEvento && (
                        <p className="text-[11px] font-semibold text-blue-800 mt-0.5">
                          Horário real do evento: {h.horarioRealEvento}
                        </p>
                      )}
                      {h.reason && (
                        <p className="text-[11px] text-gray-600 mt-0.5">{h.reason}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CorporateModal>
        )}
      </div>

      {/* =====================================================================
          MODAL: DEVOLVER À EXPEDIÇÃO PARA CORREÇÃO
      ===================================================================== */}
      {showReturnExpedicaoModal && selectedFreight && (
        <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleReturnToExpedicao}
            className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-3"
          >
            <div className="flex items-center justify-between pb-2 border-b border-gray-100">
              <h3 className="text-sm font-black text-[#15191D]">
                Devolver Frete {selectedFreight.protocol} à Expedição
              </h3>
              <button
                type="button"
                onClick={() => setShowReturnExpedicaoModal(false)}
                className="text-gray-400 hover:text-gray-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-gray-600">
              Informe o motivo obrigatório para que a Expedição ({selectedFreight.expedicaoResponsavelNome || 'Responsável'}) faça a correção operacional necessária.
            </p>
            <textarea
              rows={3}
              required
              value={returnExpedicaoReason}
              onChange={(e) => setReturnExpedicaoReason(e.target.value)}
              placeholder="Ex.: Placa do implemento divergente ou ajuste nos dados do motorista..."
              className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowReturnExpedicaoModal(false)}
                className="px-3.5 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={actionBusy}
                className="bg-[#E5252A] hover:bg-red-700 text-white text-xs font-extrabold px-4 py-2 rounded-xl cursor-pointer"
              >
                Confirmar Devolução à Expedição
              </button>
            </div>
          </form>
        </div>
      )}

      {/* =====================================================================
          MODAL: REABRIR FRETE FINALIZADO OU ENTREGUE
      ===================================================================== */}
      {showReopenModal && selectedFreight && (
        <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleReopenFreight}
            className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-3"
          >
            <div className="flex items-center justify-between pb-2 border-b border-gray-100">
              <h3 className="text-sm font-black text-[#15191D]">
                Reabrir Frete {selectedFreight.protocol}
              </h3>
              <button
                type="button"
                onClick={() => setShowReopenModal(false)}
                className="text-gray-400 hover:text-gray-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-gray-600">
              Todo o histórico e comprovantes anteriores serão preservados. Informe o motivo da reabertura (mínimo 5 caracteres):
            </p>
            {selectedFreight.situacaoMonitoramento === 'FINALIZADO' && (
              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1">
                  Retornar para a etapa
                </label>
                <select
                  value={reopenTargetStage}
                  onChange={(e) => setReopenTargetStage(e.target.value as MonitoringFreightStatus)}
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs font-semibold bg-white"
                >
                  <option value="NO_LOCAL_ENTREGA">No local de entrega (painel ativo)</option>
                  <option value="ENTREGUE">Entregue (pendente de conferência final)</option>
                </select>
              </div>
            )}
            <textarea
              rows={3}
              required
              minLength={5}
              value={reopenReason}
              onChange={(e) => setReopenReason(e.target.value)}
              placeholder="Ex.: Necessária reconferência do canhoto assinado..."
              className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowReopenModal(false)}
                className="px-3.5 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={actionBusy || reopenReason.trim().length < 5}
                className="bg-[#080B0D] hover:bg-gray-800 text-[#FFD400] text-xs font-extrabold px-4 py-2 rounded-xl cursor-pointer disabled:opacity-50"
              >
                Confirmar Reabertura
              </button>
            </div>
          </form>
        </div>
      )}
      {orderModalFreight && (
        <OrdemColetaModal
          freight={orderModalFreight}
          issuedByName={currentUser.name}
          onClose={() => setOrderModalFreight(null)}
        />
      )}
      <ImportFreightScriptModal
        isOpen={isScriptModalOpen}
        onClose={() => setIsScriptModalOpen(false)}
        importDirectLabel="Importar para Meus Fretes"
        onImportDirect={async (parsed: Partial<ParsedTrafficScript>) => {
          const valorCobradoClienteCentavos =
            parsed.valorFreteEmpresa && parsed.valorFreteEmpresa > 0
              ? Math.round(parsed.valorFreteEmpresa * 100)
              : 0;
          const valorContratadoCentavos =
            parsed.valorFreteMotorista && parsed.valorFreteMotorista > 0
              ? Math.round(parsed.valorFreteMotorista * 100)
              : 0;
          const res = await apiCreateCommercialFreight({
            empresaMarca:
              parsed.empresaMarca === 'VL TRANSPORTES' || parsed.empresaMarca === 'RODOVAR'
                ? parsed.empresaMarca
                : 'RODOVAR',
            unidadeOperacional:
              parsed.unidadeOperacional ||
              ((currentUser.location || 'BA - Salvador') as OperationalUnit),
            cliente: (parsed.cliente || '').trim(),
            clienteCnpj: (parsed.clienteCnpj || '').trim(),
            clienteContato: (parsed.telefoneCliente || '').trim(),
            origemCidadeUf: (parsed.origem || '').trim(),
            enderecoColeta: (parsed.enderecoColeta || '').trim(),
            destinoCidadeUf: (parsed.destino || '').trim(),
            enderecoEntrega: (parsed.enderecoEntrega || '').trim(),
            tipoCarga: (parsed.tipoCarga || '').trim(),
            pesoKg: parsed.pesoKg || 0,
            volumes: parsed.volumes || 0,
            veiculoNecessario: (parsed.veiculoNecessario || '').trim(),
            dataColetaIso: parsed.dataColetaIso || '',
            janelaColetaInicio: '',
            janelaColetaFim: '',
            dataEntregaPrevistaIso: '',
            janelaEntregaInicio: '',
            janelaEntregaFim: '',
            valorCobradoClienteCentavos,
            valorContratadoCentavos,
            condicoesComerciais: parsed.condicoesPagamento || '',
            condicoesOperacionais: '',
            condicoesPagamento: parsed.condicoesPagamento || '',
            observacoes: parsed.observacoes || '',
            comercialScriptRef: parsed.comercialResponsavel || '',
            motoristaNome: parsed.motoristaNome || '',
            motoristaCpf: parsed.motoristaCpf || '',
            motoristaTelefone: parsed.motoristaTelefone || '',
            emergenciaNome: parsed.emergenciaNome || '',
            emergenciaTelefone: parsed.emergenciaTelefone || '',
            placaVeiculo: parsed.placaVeiculo || '',
            favorecidoPagamento: parsed.favorecido || '',
            tipoChavePix: parsed.tipoChavePix || '',
            chavePix: parsed.chavePix || '',
            bancoPagamento: parsed.banco || '',
            confirmAndSendToExpedicao: false,
            idempotencyKey: `ativos-script-import-${currentUser.id}-${Date.now()}`,
          });
          if (!res.ok || !res.freight) {
            throw new Error(res.error || 'Não foi possível importar o frete pelo script.');
          }
          await appQueryClient.invalidateQueries({ queryKey: freightQueryKeys.userRoot(currentUser.id) });
          setToastMsg(
            `Frete ${res.freight.protocol} importado para Meus Fretes — Comercial!`
          );
          setTimeout(() => setToastMsg(null), 5000);
          if (onSwitchToComercial) {
            onSwitchToComercial();
          }
        }}
      />
    </div>
  );
};
