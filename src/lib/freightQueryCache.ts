import { QueryClient } from '@tanstack/react-query';
import { Employee, UnifiedFreightRecord } from '../types';
import { canViewFreightTeam } from './permissions';
import {
  apiFetchFreightDetails,
  apiFetchFreightOperators,
  apiFetchFreightsList,
  getAuthHeaders,
  onAuthTokensReset,
} from './serverApi';

export const FREIGHT_PAGE_SIZE = 12;

export const FREIGHT_CACHE_TIMES = {
  ACTIVE_LIST_STALE_MS: 2 * 60 * 1000, // 2 minutos
  INDICATORS_STALE_MS: 2 * 60 * 1000, // 2 minutos
  FINALIZADOS_LIST_STALE_MS: 15 * 60 * 1000, // 15 minutos
  HISTORICAL_DETAIL_STALE_MS: 30 * 60 * 1000, // 30 minutos
  ACTIVE_DETAIL_STALE_MS: 2 * 60 * 1000, // 2 minutos
  STATIC_DATA_STALE_MS: 60 * 60 * 1000, // 1 hora
  GC_TIME_MS: 30 * 60 * 1000, // 30 minutos em memória
} as const;

export interface ActiveFreightsFilterKey {
  scope: 'MINE' | 'TEAM';
  responsibleFilterId: string;
  stageFilter: string;
  periodFilter: 'TODOS' | 'HOJE' | 'SEMANA' | 'MES';
  searchQuery: string;
  page: number;
  limit: number;
}

export interface FinalizedFreightsFilterKey {
  scope: 'MINE' | 'TEAM';
  responsibleFilterId: string;
  stageFilter: string; // 'TODAS' | 'FINALIZADO' | 'ENTREGUE'
  periodFilter: 'TODOS' | 'HOJE' | 'SEMANA' | 'MES';
  searchQuery: string;
  page: number;
  limit: number;
}

export function defaultActiveFreightFilters(user: Pick<Employee, 'id' | 'accessLevel' | 'accessProfile' | 'active' | 'approvalStatus' | 'permissoesPaginas'>): ActiveFreightsFilterKey {
  const canTeam = canViewFreightTeam(user as Employee);
  return {
    scope: canTeam ? 'TEAM' : 'MINE',
    responsibleFilterId: '',
    stageFilter: 'TODOS',
    periodFilter: 'TODOS',
    searchQuery: '',
    page: 1,
    limit: FREIGHT_PAGE_SIZE,
  };
}

// Always scope keys with userId so private data is strictly isolated per authenticated user & profile
export const freightQueryKeys = {
  userRoot: (userId: string) => ['rodovar-freights', userId || 'anon'] as const,
  lists: (userId: string) => ['rodovar-freights', userId || 'anon', 'list'] as const,
  activeList: (userId: string, filters: ActiveFreightsFilterKey) =>
    [
      'rodovar-freights',
      userId || 'anon',
      'list',
      'ATIVOS',
      filters.scope,
      filters.responsibleFilterId || '',
      filters.stageFilter || 'TODOS',
      filters.periodFilter || 'TODOS',
      filters.searchQuery || '',
      filters.page,
      filters.limit,
    ] as const,
  finalizedList: (userId: string, filters: FinalizedFreightsFilterKey) =>
    [
      'rodovar-freights',
      userId || 'anon',
      'list',
      'FINALIZADOS',
      filters.scope,
      filters.responsibleFilterId || '',
      filters.stageFilter || 'TODAS',
      filters.periodFilter || 'TODOS',
      filters.searchQuery || '',
      filters.page,
      filters.limit,
    ] as const,
  detail: (userId: string, freightId: string) =>
    ['rodovar-freights', userId || 'anon', 'detail', freightId] as const,
  operators: (userId: string) =>
    ['rodovar-freights', userId || 'anon', 'operators'] as const,
  customerCovers: (userId: string) =>
    ['rodovar-freights', userId || 'anon', 'customer-covers'] as const,
};

export const appQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: FREIGHT_CACHE_TIMES.ACTIVE_LIST_STALE_MS,
      gcTime: FREIGHT_CACHE_TIMES.GC_TIME_MS,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: 1,
    },
  },
});

export function clearPrivateFreightCache(): void {
  try {
    void appQueryClient.cancelQueries();
    appQueryClient.clear();
  } catch {
    // ignore cleanup error
  }
}

onAuthTokensReset(() => {
  clearPrivateFreightCache();
});

export async function fetchActiveFreightsQuery(
  filters: ActiveFreightsFilterKey
) {
  const res = await apiFetchFreightsList({
    area: 'MONITORAMENTO',
    scope: filters.scope === 'TEAM' ? 'EQUIPE' : 'MEUS',
    viewMode: 'ATIVOS',
    responsavelId:
      filters.scope === 'TEAM' && filters.responsibleFilterId
        ? filters.responsibleFilterId
        : undefined,
    situacao: filters.stageFilter !== 'TODOS' ? filters.stageFilter : undefined,
    periodo: filters.periodFilter !== 'TODOS' ? filters.periodFilter : undefined,
    search: filters.searchQuery.trim() || undefined,
    page: filters.page,
    limit: filters.limit,
    omitKanban: true,
  });
  if (!res.ok) {
    throw new Error(res.error || 'Falha ao carregar fila de Fretes Ativos (Monitoramento).');
  }
  return res;
}

export async function fetchFinalizedFreightsQuery(
  filters: FinalizedFreightsFilterKey
) {
  const res = await apiFetchFreightsList({
    area: 'MONITORAMENTO',
    scope: filters.scope === 'TEAM' ? 'EQUIPE' : 'MEUS',
    viewMode: 'FINALIZADOS',
    responsavelId:
      filters.scope === 'TEAM' && filters.responsibleFilterId
        ? filters.responsibleFilterId
        : undefined,
    situacao:
      filters.stageFilter && filters.stageFilter !== 'TODAS'
        ? filters.stageFilter
        : undefined,
    periodo: filters.periodFilter !== 'TODOS' ? filters.periodFilter : undefined,
    search: filters.searchQuery.trim() || undefined,
    page: filters.page,
    limit: filters.limit,
    omitKanban: true,
    compact: true,
  });
  if (!res.ok) {
    throw new Error(res.error || 'Falha ao carregar histórico de fretes finalizados.');
  }
  return res;
}

export async function fetchFreightDetailsQuery(freightId: string) {
  const res = await apiFetchFreightDetails(freightId);
  if (!res.ok || !res.freight) {
    throw new Error(res.error || 'Não foi possível carregar os detalhes do frete.');
  }
  return res;
}

export async function fetchFreightOperatorsQuery() {
  const res = await apiFetchFreightOperators();
  if (!res.ok) {
    throw new Error(res.error || 'Falha ao consultar operadores.');
  }
  return res;
}

export async function fetchCustomerCoversQuery(): Promise<{
  covers: { key: string; customer: string; dataUrl: string }[];
  canEdit: boolean;
}> {
  const res = await fetch('/api/customer-covers', {
    credentials: 'include',
    headers: getAuthHeaders(),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data || !Array.isArray(data.covers)) {
    return { covers: [], canEdit: false };
  }
  return { covers: data.covers, canEdit: Boolean(data.canEdit) };
}

/**
 * Shared fetcher for HomePremium & FretesAtivosView so navigating between modules
 * reuses the in-memory cached query without issuing duplicate requests.
 */
export async function fetchHomeActiveFreightsCached(user: Employee) {
  const filters = defaultActiveFreightFilters(user);
  return appQueryClient.fetchQuery({
    queryKey: freightQueryKeys.activeList(user.id, filters),
    queryFn: () => fetchActiveFreightsQuery(filters),
    staleTime: FREIGHT_CACHE_TIMES.ACTIVE_LIST_STALE_MS,
  });
}

export async function invalidateFreightQueriesAfterMutation(
  userId: string,
  updatedFreight?: UnifiedFreightRecord | null
): Promise<void> {
  if (updatedFreight?.id) {
    appQueryClient.setQueryData(
      freightQueryKeys.detail(userId, updatedFreight.id),
      (prev: any) => {
        if (!prev || typeof prev !== 'object') return prev;
        return { ...prev, freight: updatedFreight };
      }
    );
  }
  await appQueryClient.invalidateQueries({
    queryKey: freightQueryKeys.lists(userId),
  });
}

export async function invalidateFreightDetailCache(
  userId: string,
  freightId: string
): Promise<void> {
  await appQueryClient.invalidateQueries({
    queryKey: freightQueryKeys.detail(userId, freightId),
  });
}

export async function invalidateCustomerCoversCache(userId?: string): Promise<void> {
  if (userId) {
    await appQueryClient.invalidateQueries({
      queryKey: freightQueryKeys.customerCovers(userId),
    });
  } else {
    await appQueryClient.invalidateQueries({
      predicate: (q) =>
        Array.isArray(q.queryKey) &&
        q.queryKey[0] === 'rodovar-freights' &&
        q.queryKey[2] === 'customer-covers',
    });
  }
}
