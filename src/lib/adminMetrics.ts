import type {Employee} from '../types';

export function resolveEmployeeSectorLabel(u: Partial<Employee> | null | undefined): string {
  if (!u) return 'Operacional';
  if (u.accessProfile === 'COMERCIAL') return 'Comercial';
  if (u.accessProfile === 'EXPEDICAO') return 'Expedição';
  if (u.accessProfile === 'MONITORAMENTO') return 'Monitoramento';
  if (u.accessProfile === 'FINANCEIRO') return 'Financeiro';
  if (u.accessProfile === 'RH') return 'Recursos Humanos';
  if (u.accessProfile === 'DIRETORIA') return 'Diretoria';
  return u.department || 'Operacional';
}

export function administrationMetrics(employees: Employee[]) {
  const statuses = [
    { label: 'Ativos', value: employees.filter((u) => u.active && u.approvalStatus === 'APROVADO').length, color: '#00b65b' },
    { label: 'Pendentes', value: employees.filter((u) => u.approvalStatus === 'PENDENTE').length, color: '#ffd400' },
    { label: 'Suspensos', value: employees.filter((u) => u.approvalStatus === 'SUSPENSO').length, color: '#f44862' },
    {
      label: 'Outros',
      value: employees.filter((u) => !(u.active && u.approvalStatus === 'APROVADO') && !['PENDENTE', 'SUSPENSO'].includes(u.approvalStatus || '')).length,
      color: '#94a3b8',
    },
  ];
  const sectorNames = [...new Set(employees.map((u) => resolveEmployeeSectorLabel(u)))].sort();
  return {
    statuses,
    total: employees.length,
    departments: sectorNames.map((name) => ({
      name,
      count: employees.filter((u) => resolveEmployeeSectorLabel(u) === name && u.active).length,
      total: employees.filter((u) => resolveEmployeeSectorLabel(u) === name).length,
    })),
  };
}

