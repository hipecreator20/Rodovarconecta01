import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Clock3,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Headphones,
  LifeBuoy,
  Lock,
  Mail,
  Megaphone,
  Phone,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Truck,
  X,
} from 'lucide-react';
import { CorporateModal } from './ui/CorporateModal';
import { hasPagePermission } from '../lib/permissions';
import { getAuthHeaders } from '../lib/serverApi';
import { newRequestKey } from '../lib/requestKey';
import type { Department, Employee, InternalRequest, MenuSection, RequestStatus } from '../types';

export interface HelpCenterPremiumProps {
  currentUser: Employee;
  onNavigate: (section: MenuSection) => void;
}

type FaqCategory =
  | 'Todas'
  | 'Acesso e Senha'
  | 'Comunicados'
  | 'Fretes e Operações'
  | 'Solicitações e RH'
  | 'Agenda e Privacidade';

interface FaqItem {
  id: string;
  category: Exclude<FaqCategory, 'Todas'>;
  question: string;
  answer: string;
  featured: boolean;
}

const VALID_DEPARTMENTS: { value: Department; label: string; hint: string }[] = [
  { value: 'Administrativo', label: 'Suporte de TI e Administrativo', hint: 'Acessos, senhas e sistemas' },
  { value: 'Recursos Humanos', label: 'Recursos Humanos (RH)', hint: 'Cadastro, férias e benefícios' },
  { value: 'Financeiro', label: 'Financeiro', hint: 'Pagamentos, reembolsos e comprovantes' },
];

const PRIORITIES: { value: 'Baixa' | 'Média' | 'Alta' | 'Urgente'; tone: string }[] = [
  { value: 'Baixa', tone: 'text-slate-700 border-slate-200 bg-slate-50' },
  { value: 'Média', tone: 'text-blue-800 border-blue-200 bg-blue-50' },
  { value: 'Alta', tone: 'text-amber-800 border-amber-200 bg-amber-50' },
  { value: 'Urgente', tone: 'text-red-800 border-red-200 bg-red-50' },
];

const FAQ_CATEGORIES: FaqCategory[] = [
  'Todas',
  'Acesso e Senha',
  'Comunicados',
  'Fretes e Operações',
  'Solicitações e RH',
  'Agenda e Privacidade',
];

const FAQ_ITEMS: FaqItem[] = [
  {
    id: 'faq-acesso-senha',
    category: 'Acesso e Senha',
    featured: true,
    question: 'Como alterar minha senha ou recuperar o acesso ao portal?',
    answer:
      'Acesse Meu Perfil no menu lateral para atualizar sua senha de acesso. Caso esteja bloqueado ou tenha esquecido sua credencial corporativa, abra um chamado para TI/Administrativo ou ligue para 71 9 9920-2476.',
  },
  {
    id: 'faq-chamados-sla',
    category: 'Solicitações e RH',
    featured: true,
    question: 'Qual é o prazo padrão de atendimento para chamados internos?',
    answer:
      'Todas as solicitações abertas na Central geram um protocolo oficial no sistema com prazo padrão de 48 horas corridas. Você pode acompanhar cada etapa em "Meus chamados".',
  },
  {
    id: 'faq-mural-leitura',
    category: 'Comunicados',
    featured: true,
    question: 'Como funciona a confirmação de leitura obrigatória nos Comunicados?',
    answer:
      'Comunicados com exigência de leitura exibem o botão "Confirmar leitura". Apenas abrir o Mural não registra a ciência — é necessário clicar no botão para registrar data, hora e usuário.',
  },
  {
    id: 'faq-fretes-fluxo',
    category: 'Fretes e Operações',
    featured: true,
    question: 'Onde acompanho fretes ativos, pagamentos e comprovantes?',
    answer:
      'Os painéis de Comercial, Expedição, Fretes Ativos e Financeiro ficam disponíveis no menu lateral conforme o perfil do seu setor, concentrando status de viagem, documentos e comprovantes.',
  },
  {
    id: 'faq-agenda-eventos',
    category: 'Agenda e Privacidade',
    featured: true,
    question: 'Como confirmar presença em reuniões e treinamentos da Agenda?',
    answer:
      'Na seção Agenda Corporativa, selecione o compromisso desejado e clique para confirmar participação. Também é possível exportar o evento para seu calendário pessoal (.ICS).',
  },
  {
    id: 'faq-privacidade-lgpd',
    category: 'Agenda e Privacidade',
    featured: false,
    question: 'Como funcionam as permissões de acesso e proteção de dados (LGPD)?',
    answer:
      'Cada colaborador visualiza somente os módulos e registros compatíveis com sua função. Sessões autenticadas e registros operacionais seguem controle de acesso e auditoria interna da RODOVAR.',
  },
  {
    id: 'faq-chamado-acompanhar',
    category: 'Solicitações e RH',
    featured: false,
    question: 'Como acompanhar as respostas do RH, TI ou Financeiro no meu chamado?',
    answer:
      'Clique em "Meus chamados" aqui na Central de Ajuda para consultar o status, o prazo restante e o histórico de respostas de cada protocolo aberto por você.',
  },
  {
    id: 'faq-manual-pops',
    category: 'Fretes e Operações',
    featured: false,
    question: 'Onde encontro o Manual do Colaborador e documentos vigentes?',
    answer:
      'O Manual do Colaborador em PDF está disponível diretamente no card "Contatos e Documentos" ao lado. Normas e guias adicionais também ficam no módulo Documentos, quando habilitado para seu perfil.',
  },
];

const MANUAL_PDF_URL = '/assets/aistudio/02_Manual_da_Equipe_2027_5f4304a6.pdf';
const MANUAL_PDF_FILENAME = 'Manual_da_Equipe_RODOVAR_2027.pdf';
const SUPPORT_PHONE = '71 9 9920-2476';
const RH_EMAIL = 'rh@rodovar.com.br';

function formatDateTime(iso: string): string {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return iso;
  return new Date(parsed).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function getSlaSummary(req: InternalRequest): { text: string; toneClass: string } {
  if (req.status === 'Concluída') {
    return { text: 'Concluído', toneClass: 'text-emerald-700' };
  }
  if (req.status === 'Cancelada') {
    return { text: 'Cancelado', toneClass: 'text-slate-500' };
  }
  const hours = Math.ceil((Date.parse(req.currentDueAtIso) - Date.now()) / 3600000);
  if (hours < 0) {
    return { text: `Vencido há ${Math.abs(hours)}h`, toneClass: 'text-red-700' };
  }
  if (hours === 0) {
    return { text: 'Vence nesta hora', toneClass: 'text-amber-700' };
  }
  return {
    text: `Restam ${hours}h`,
    toneClass: hours <= 8 ? 'text-amber-700' : 'text-slate-600',
  };
}

function getStatusAccent(status: RequestStatus): string {
  switch (status) {
    case 'Concluída':
      return 'bg-emerald-50 text-emerald-800 border-emerald-200';
    case 'Cancelada':
      return 'bg-slate-100 text-slate-600 border-slate-200';
    case 'Aberta':
      return 'bg-amber-50 text-amber-900 border-amber-200';
    default:
      return 'bg-blue-50 text-blue-800 border-blue-200';
  }
}

export const HelpCenterPremium: React.FC<HelpCenterPremiumProps> = ({
  currentUser,
  onNavigate,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<FaqCategory>('Todas');
  const [showAllFaq, setShowAllFaq] = useState(false);
  const [openFaqId, setOpenFaqId] = useState<string | null>(FAQ_ITEMS[0].id);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [actionToast, setActionToast] = useState<string | null>(null);

  // Abrir Chamado Modal
  const [isTicketModalOpen, setIsTicketModalOpen] = useState(false);
  const [ticketDepartment, setTicketDepartment] = useState<Department>('Administrativo');
  const [ticketPriority, setTicketPriority] = useState<'Baixa' | 'Média' | 'Alta' | 'Urgente'>('Média');
  const [ticketSubject, setTicketSubject] = useState('');
  const [ticketDescription, setTicketDescription] = useState('');
  const [ticketError, setTicketError] = useState<string | null>(null);
  const [isSubmittingTicket, setIsSubmittingTicket] = useState(false);
  const [createdTicket, setCreatedTicket] = useState<InternalRequest | null>(null);
  const [lastCreatedTicket, setLastCreatedTicket] = useState<InternalRequest | null>(null);
  const idempotencyKeyRef = useRef<string>(newRequestKey());
  const inFlightRef = useRef<boolean>(false);

  // Meus Chamados Modal
  const [isMyTicketsOpen, setIsMyTicketsOpen] = useState(false);
  const [myTickets, setMyTickets] = useState<InternalRequest[]>([]);
  const [isLoadingTickets, setIsLoadingTickets] = useState(false);
  const [ticketsError, setTicketsError] = useState<string | null>(null);
  const [ticketsSearch, setTicketsSearch] = useState('');
  const [ticketsFilter, setTicketsFilter] = useState<'Todos' | 'Abertos' | 'Concluídos'>('Todos');
  const [expandedTicketId, setExpandedTicketId] = useState<string | null>(null);

  const faqSectionRef = useRef<HTMLDivElement | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const copyTimerRef = useRef<number | null>(null);

  const canAccessRequests = hasPagePermission(currentUser, 'solicitacoes');

  const showToast = useCallback((message: string) => {
    setActionToast(message);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setActionToast(null), 4000);
  }, []);

  const copyValue = useCallback(async (key: string, value: string, feedbackLabel: string) => {
    try {
      await navigator.clipboard?.writeText(value);
      setCopiedKey(key);
      if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = window.setTimeout(() => setCopiedKey(null), 2200);
      showToast(feedbackLabel);
    } catch {
      showToast('Não foi possível copiar automaticamente. Selecione e copie o texto.');
    }
  }, [showToast]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
      if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
    };
  }, []);

  const loadMyTickets = useCallback(async () => {
    if (!canAccessRequests) {
      setMyTickets([]);
      setTicketsError(null);
      return;
    }
    setIsLoadingTickets(true);
    setTicketsError(null);
    try {
      const response = await fetch('/api/requests', { headers: getAuthHeaders() });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Não foi possível carregar seus chamados.');
      }
      const list = Array.isArray(data.requests) ? (data.requests as InternalRequest[]) : [];
      const ownOrRecent = list.filter((item) => item.requesterId === currentUser.id);
      setMyTickets(ownOrRecent);
    } catch (err) {
      setTicketsError((err as Error).message || 'Falha ao consultar chamados no servidor.');
    } finally {
      setIsLoadingTickets(false);
    }
  }, [canAccessRequests, currentUser.id]);

  const handleOpenMyTickets = useCallback(() => {
    setIsMyTicketsOpen(true);
    void loadMyTickets();
  }, [loadMyTickets]);

  const handleOpenCreateTicket = useCallback(() => {
    setTicketError(null);
    setCreatedTicket(null);
    idempotencyKeyRef.current = newRequestKey();
    setIsTicketModalOpen(true);
  }, []);

  const resetTicketForm = useCallback(() => {
    setTicketDepartment('Administrativo');
    setTicketPriority('Média');
    setTicketSubject('');
    setTicketDescription('');
    setTicketError(null);
    setCreatedTicket(null);
    idempotencyKeyRef.current = newRequestKey();
  }, []);

  const handleCloseTicketModal = useCallback(() => {
    setIsTicketModalOpen(false);
    setTicketError(null);
  }, []);

  const handleSubmitTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inFlightRef.current || isSubmittingTicket) return;

    const cleanSubject = ticketSubject.trim();
    const cleanDescription = ticketDescription.trim();

    if (!cleanSubject || cleanSubject.length < 4) {
      setTicketError('Informe um assunto claro com pelo menos 4 caracteres.');
      return;
    }
    if (cleanSubject.length > 200) {
      setTicketError('O assunto deve ter no máximo 200 caracteres.');
      return;
    }
    if (!cleanDescription || cleanDescription.length < 10) {
      setTicketError('Descreva a sua necessidade com pelo menos 10 caracteres.');
      return;
    }
    if (cleanDescription.length > 3000) {
      setTicketError('A descrição deve ter no máximo 3.000 caracteres.');
      return;
    }

    inFlightRef.current = true;
    setIsSubmittingTicket(true);
    setTicketError(null);

    try {
      const response = await fetch('/api/requests', {
        method: 'POST',
        headers: getAuthHeaders({
          'Content-Type': 'application/json',
          'X-Idempotency-Key': idempotencyKeyRef.current,
        }),
        body: JSON.stringify({
          targetDepartment: ticketDepartment,
          priority: ticketPriority,
          subject: cleanSubject,
          description: cleanDescription,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.request) {
        throw new Error(data.error || 'Não foi possível registrar o chamado.');
      }
      const saved = data.request as InternalRequest;
      setCreatedTicket(saved);
      setLastCreatedTicket(saved);
      setTicketSubject('');
      setTicketDescription('');
      idempotencyKeyRef.current = newRequestKey();
      showToast(`Chamado ${saved.protocol} registrado com prazo de 48h.`);
    } catch (err) {
      setTicketError((err as Error).message || 'Erro de comunicação ao registrar chamado.');
    } finally {
      inFlightRef.current = false;
      setIsSubmittingTicket(false);
    }
  };

  const scrollToFaqCategory = useCallback(
    (category: FaqCategory, feedback?: string) => {
      setSelectedCategory(category);
      setShowAllFaq(true);
      const firstMatch = FAQ_ITEMS.find((item) => category === 'Todas' || item.category === category);
      if (firstMatch) setOpenFaqId(firstMatch.id);
      if (feedback) showToast(feedback);
      faqSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
    [showToast]
  );

  const permittedFreightModule = useMemo((): MenuSection | null => {
    const candidates: MenuSection[] = [
      'fretes_comercial',
      'fretes_expedicao',
      'fretes_ativos',
      'financeiro',
    ];
    return candidates.find((mod) => hasPagePermission(currentUser, mod)) ?? null;
  }, [currentUser]);

  const quickAccessCards = useMemo(
    () => [
      {
        id: 'acesso',
        icon: Lock,
        title: 'Acesso e Senha',
        description: 'Credenciais, alteração de senha e segurança da conta.',
        ctaLabel: 'Ir para Meu Perfil',
        onClick: () => onNavigate('perfil'),
      },
      {
        id: 'comunicados',
        icon: Megaphone,
        title: 'Comunicados',
        description: 'Avisos oficiais da diretoria e confirmação de leitura.',
        ctaLabel: hasPagePermission(currentUser, 'comunicados')
          ? 'Abrir Mural'
          : 'Ver dúvidas do Mural',
        onClick: () => {
          if (hasPagePermission(currentUser, 'comunicados')) {
            onNavigate('comunicados');
          } else {
            scrollToFaqCategory(
              'Comunicados',
              'Exibindo orientações sobre Comunicados para o seu perfil.'
            );
          }
        },
      },
      {
        id: 'fretes',
        icon: Truck,
        title: 'Fretes e Operações',
        description: 'Acompanhamento de cargas, viagens e comprovantes.',
        ctaLabel: permittedFreightModule ? 'Abrir Fretes' : 'Ver dúvidas de Fretes',
        onClick: () => {
          if (permittedFreightModule) {
            onNavigate(permittedFreightModule);
          } else {
            scrollToFaqCategory(
              'Fretes e Operações',
              'Exibindo dúvidas de Fretes e Operações para o seu perfil.'
            );
          }
        },
      },
      {
        id: 'solicitacoes',
        icon: ClipboardList,
        title: 'Solicitações e RH',
        description: 'Abertura de chamados, prazos de 48h e protocolos.',
        ctaLabel: canAccessRequests ? 'Ver meus chamados' : 'Ver atendimento RH',
        onClick: () => {
          if (canAccessRequests) {
            handleOpenMyTickets();
          } else {
            scrollToFaqCategory('Solicitações e RH');
          }
        },
      },
      {
        id: 'agenda',
        icon: Calendar,
        title: 'Agenda Corporativa',
        description: 'Reuniões, treinamentos e compromissos internos.',
        ctaLabel: hasPagePermission(currentUser, 'agenda')
          ? 'Abrir Agenda'
          : 'Ver dúvidas da Agenda',
        onClick: () => {
          if (hasPagePermission(currentUser, 'agenda')) {
            onNavigate('agenda');
          } else {
            scrollToFaqCategory(
              'Agenda e Privacidade',
              'Exibindo orientações sobre a Agenda Corporativa.'
            );
          }
        },
      },
      {
        id: 'seguranca',
        icon: ShieldCheck,
        title: 'Segurança e Privacidade',
        description: 'Proteção de dados LGPD, sessões e permissões.',
        ctaLabel: 'Ver orientações LGPD',
        onClick: () => scrollToFaqCategory('Agenda e Privacidade'),
      },
    ],
    [
      canAccessRequests,
      currentUser,
      handleOpenMyTickets,
      onNavigate,
      permittedFreightModule,
      scrollToFaqCategory,
    ]
  );

  // Filter FAQs based on search and category
  const matchingFaqs = useMemo(() => {
    const q = searchQuery.trim().toLocaleLowerCase('pt-BR');
    return FAQ_ITEMS.filter((item) => {
      const matchesCat = selectedCategory === 'Todas' || item.category === selectedCategory;
      const matchesQuery =
        !q ||
        item.question.toLocaleLowerCase('pt-BR').includes(q) ||
        item.answer.toLocaleLowerCase('pt-BR').includes(q) ||
        item.category.toLocaleLowerCase('pt-BR').includes(q);
      return matchesCat && matchesQuery;
    });
  }, [searchQuery, selectedCategory]);

  const isDefaultUnfiltered = selectedCategory === 'Todas' && !searchQuery.trim();
  const visibleFaqs = useMemo(() => {
    if (!isDefaultUnfiltered || showAllFaq) return matchingFaqs;
    return matchingFaqs.slice(0, 5);
  }, [isDefaultUnfiltered, matchingFaqs, showAllFaq]);

  const hiddenFaqCount = isDefaultUnfiltered && !showAllFaq
    ? Math.max(0, matchingFaqs.length - 5)
    : 0;

  const filteredMyTickets = useMemo(() => {
    const q = ticketsSearch.trim().toLocaleLowerCase('pt-BR');
    return myTickets.filter((ticket) => {
      const isClosed = ticket.status === 'Concluída' || ticket.status === 'Cancelada';
      const matchesStatus =
        ticketsFilter === 'Todos' ||
        (ticketsFilter === 'Abertos' ? !isClosed : isClosed);
      const matchesText =
        !q ||
        ticket.protocol.toLocaleLowerCase('pt-BR').includes(q) ||
        ticket.subject.toLocaleLowerCase('pt-BR').includes(q) ||
        ticket.targetDepartment.toLocaleLowerCase('pt-BR').includes(q);
      return matchesStatus && matchesText;
    });
  }, [myTickets, ticketsFilter, ticketsSearch]);

  const hasUnsavedTicketDraft =
    !createdTicket &&
    (ticketSubject.trim().length > 0 || ticketDescription.trim().length > 0);

  return (
    <div className="space-y-6 pb-8">
      {/* Subtle feedback banner for user actions */}
      {actionToast && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center justify-between gap-3 rounded-xl border border-[#FFD400]/60 bg-[#FFFBEA] px-4 py-3 text-xs font-semibold text-[#15191D] transition-opacity duration-150"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
            <span className="truncate">{actionToast}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionToast(null)}
            aria-label="Fechar aviso"
            className="p-1 rounded-md text-slate-500 hover:text-slate-900 hover:bg-amber-100/60 cursor-pointer shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 1. CABEÇALHO PREMIUM */}
      <section
        aria-label="Cabeçalho da Central de Ajuda"
        className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 sm:p-8"
      >
        {/* Subtle geometric accent */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute right-0 top-0 h-full w-44 sm:w-64 opacity-[0.06] bg-[radial-gradient(#080B0D_1.2px,transparent_1.2px)] [background-size:14px_14px]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-0 h-1 w-full bg-[#FFD400]"
        />

        <div className="relative flex flex-col gap-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3.5 min-w-0">
              <div className="w-11 h-11 rounded-xl bg-[#080B0D] text-[#FFD400] flex items-center justify-center shrink-0">
                <LifeBuoy className="w-5 h-5 stroke-[2.2]" />
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl sm:text-[26px] font-extrabold tracking-tight text-[#15191D] leading-tight">
                  Como podemos ajudar?
                </h1>
                <p className="mt-1 text-sm text-slate-600">
                  Encontre respostas ou solicite atendimento.
                </p>
              </div>
            </div>

            <div className="hidden md:flex items-center gap-2 text-xs text-slate-500 shrink-0 pt-1">
              <Headphones className="w-4 h-4 text-slate-400" />
              <span>Central Corporativa RODOVAR</span>
            </div>
          </div>

          {/* Prominent search bar */}
          <div className="relative max-w-2xl">
            <Search
              aria-hidden="true"
              className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                if (e.target.value.trim()) setShowAllFaq(true);
              }}
              aria-label="Pesquisar dúvidas na Central de Ajuda"
              placeholder="Busque por senha, chamado, leitura obrigatória, frete ou agenda..."
              className="w-full h-12 pl-11 pr-11 rounded-xl border border-slate-200 bg-[#F3F5F7] text-sm text-[#15191D] placeholder:text-slate-500 focus:bg-white focus:border-[#080B0D] focus:outline-none focus:ring-2 focus:ring-[#FFD400]/60 transition-colors duration-150"
            />
            {searchQuery.trim() && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Limpar pesquisa"
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-200/70 cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </section>

      {/* 2. CENTRAL DE ACESSO RÁPIDO — 6 CARDS */}
      <section aria-labelledby="quick-access-heading" className="space-y-3">
        <div className="flex items-center justify-between px-0.5">
          <h2 id="quick-access-heading" className="text-sm font-bold text-[#15191D]">
            Acesso rápido
          </h2>
          <span className="text-xs text-slate-500">Atalhos diretos do portal</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {quickAccessCards.map((card) => {
            const Icon = card.icon;
            return (
              <button
                key={card.id}
                type="button"
                onClick={card.onClick}
                className="group text-left bg-white rounded-xl border border-slate-200 p-4 sm:p-5 flex items-start gap-3.5 hover:border-[#080B0D]/40 hover:bg-[#FCFDFE] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFD400] transition-all duration-150 cursor-pointer"
              >
                <div className="w-10 h-10 rounded-xl bg-[#F3F5F7] group-hover:bg-[#FFD400] text-[#15191D] flex items-center justify-center shrink-0 transition-colors duration-150">
                  <Icon className="w-5 h-5 stroke-[2]" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-bold text-[#15191D] truncate">{card.title}</h3>
                    <ArrowRight
                      aria-hidden="true"
                      className="w-4 h-4 text-slate-300 group-hover:text-[#15191D] group-hover:translate-x-0.5 transition-all duration-150 shrink-0"
                    />
                  </div>
                  <p className="mt-1 text-xs text-slate-600 line-clamp-1">{card.description}</p>
                  <span className="mt-2 inline-block text-[11px] font-semibold text-slate-500 group-hover:text-[#080B0D]">
                    {card.ctaLabel}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* 3. WORKSPACE EM DUAS COLUNAS EQUILIBRADAS (DESKTOP) / UMA COLUNA (MOBILE) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* COLUNA ESQUERDA: PERGUNTAS FREQUENTES */}
        <section
          ref={faqSectionRef}
          aria-labelledby="faq-heading"
          className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 id="faq-heading" className="text-base sm:text-lg font-extrabold text-[#15191D]">
                Perguntas frequentes
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {matchingFaqs.length === 0
                  ? 'Nenhum resultado para os filtros aplicados'
                  : `${visibleFaqs.length} de ${matchingFaqs.length} respostas exibidas`}
              </p>
            </div>
            {(selectedCategory !== 'Todas' || searchQuery.trim()) && (
              <button
                type="button"
                onClick={() => {
                  setSelectedCategory('Todas');
                  setSearchQuery('');
                  setShowAllFaq(false);
                }}
                className="text-xs font-semibold text-slate-600 hover:text-[#15191D] underline underline-offset-4 cursor-pointer py-1.5 px-2"
              >
                Limpar filtros
              </button>
            )}
          </div>

          {/* Filtros por categoria */}
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Categorias do FAQ">
            {FAQ_CATEGORIES.map((category) => {
              const active = selectedCategory === category;
              return (
                <button
                  key={category}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => {
                    setSelectedCategory(category);
                    if (category !== 'Todas') setShowAllFaq(true);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors duration-150 cursor-pointer ${
                    active
                      ? 'bg-[#080B0D] text-[#FFD400]'
                      : 'bg-[#F3F5F7] text-slate-700 hover:bg-slate-200/80'
                  }`}
                >
                  {category}
                </button>
              );
            })}
          </div>

          {/* Lista em acordeão */}
          {visibleFaqs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-[#F3F5F7]/70 p-6 text-center space-y-3">
              <p className="text-sm font-semibold text-[#15191D]">
                Nenhuma dúvida encontrada para &ldquo;{searchQuery.trim() || selectedCategory}&rdquo;.
              </p>
              <p className="text-xs text-slate-600">
                Tente buscar outro termo ou abra um chamado direto para nossa equipe.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedCategory('Todas');
                  }}
                  className="px-3.5 py-2 rounded-lg border border-slate-300 bg-white text-xs font-bold text-[#15191D] hover:bg-slate-50 cursor-pointer"
                >
                  Limpar busca
                </button>
                <button
                  type="button"
                  onClick={handleOpenCreateTicket}
                  className="px-3.5 py-2 rounded-lg bg-[#FFD400] hover:bg-[#f2c900] text-xs font-extrabold text-[#080B0D] cursor-pointer"
                >
                  Abrir chamado
                </button>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl overflow-hidden">
              {visibleFaqs.map((item) => {
                const isOpen = openFaqId === item.id;
                return (
                  <div key={item.id} className="bg-white">
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      aria-controls={`faq-panel-${item.id}`}
                      onClick={() => setOpenFaqId(isOpen ? null : item.id)}
                      className="w-full px-4 py-3.5 text-left flex items-center justify-between gap-3 hover:bg-[#F3F5F7]/70 focus-visible:outline-none focus-visible:bg-[#F3F5F7] transition-colors duration-150 cursor-pointer"
                    >
                      <div className="min-w-0">
                        <span className="block text-[11px] font-semibold text-slate-500">
                          {item.category}
                        </span>
                        <span className="block text-sm font-bold text-[#15191D] mt-0.5 leading-snug">
                          {item.question}
                        </span>
                      </div>
                      <ChevronDown
                        aria-hidden="true"
                        className={`w-4 h-4 text-slate-500 shrink-0 transition-transform duration-150 ${
                          isOpen ? 'rotate-180 text-[#080B0D]' : ''
                        }`}
                      />
                    </button>

                    {isOpen && (
                      <div
                        id={`faq-panel-${item.id}`}
                        className="px-4 pb-4 pt-1 bg-[#F8FAFC] border-t border-slate-100 space-y-2.5"
                      >
                        <p className="text-xs sm:text-[13px] leading-relaxed text-slate-700">
                          {item.answer}
                        </p>
                        <div className="flex items-center justify-end">
                          <button
                            type="button"
                            onClick={() =>
                              copyValue(
                                `faq-${item.id}`,
                                `${item.question}\n${item.answer}`,
                                'Resposta copiada para a área de transferência.'
                              )
                            }
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-[11px] font-semibold text-slate-700 cursor-pointer transition-colors"
                          >
                            {copiedKey === `faq-${item.id}` ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-700" />
                                <span>Copiado</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3 text-slate-500" />
                                <span>Copiar orientação</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Botão "Ver todas as dúvidas" */}
          {isDefaultUnfiltered && matchingFaqs.length > 5 && (
            <div className="pt-1 flex justify-center sm:justify-start">
              <button
                type="button"
                onClick={() => setShowAllFaq((prev) => !prev)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-[#F3F5F7] text-xs font-bold text-[#15191D] transition-colors duration-150 cursor-pointer"
              >
                <span>
                  {showAllFaq
                    ? 'Mostrar apenas principais'
                    : `Ver todas as dúvidas (${hiddenFaqCount > 0 ? `+${hiddenFaqCount}` : matchingFaqs.length})`}
                </span>
                <ChevronDown
                  aria-hidden="true"
                  className={`w-3.5 h-3.5 transition-transform duration-150 ${
                    showAllFaq ? 'rotate-180' : ''
                  }`}
                />
              </button>
            </div>
          )}
        </section>

        {/* COLUNA DIREITA: SUPORTE INTERNO + CONTATOS E DOCUMENTOS */}
        <aside className="lg:col-span-5 space-y-5">
          {/* 4. CARD PREMIUM DE SUPORTE INTERNO */}
          <section
            aria-labelledby="support-card-heading"
            className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-4"
          >
            <div className="flex items-start gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-[#080B0D] text-[#FFD400] flex items-center justify-center shrink-0">
                <Headphones className="w-5 h-5 stroke-[2.2]" />
              </div>
              <div className="min-w-0">
                <h2 id="support-card-heading" className="text-base sm:text-lg font-extrabold text-[#15191D]">
                  Suporte Interno
                </h2>
                <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                  Precisa de atendimento personalizado? Registre um chamado com protocolo oficial.
                </p>
              </div>
            </div>

            {lastCreatedTicket && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-emerald-900 tabular-nums">
                    Último protocolo aberto: {lastCreatedTicket.protocol}
                  </p>
                  <p className="text-[11px] text-emerald-800 truncate mt-0.5">
                    {lastCreatedTicket.targetDepartment} · {lastCreatedTicket.subject}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleOpenMyTickets}
                  className="text-xs font-bold text-emerald-900 underline underline-offset-2 shrink-0 cursor-pointer"
                >
                  Acompanhar
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                onClick={handleOpenCreateTicket}
                className="h-11 px-4 rounded-xl bg-[#FFD400] hover:bg-[#f2c900] text-[#080B0D] text-sm font-extrabold inline-flex items-center justify-center gap-2 transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#080B0D]"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
                <span>Abrir chamado</span>
              </button>

              <button
                type="button"
                onClick={handleOpenMyTickets}
                className="h-11 px-4 rounded-xl border border-slate-300 bg-white hover:bg-[#F3F5F7] text-[#15191D] text-sm font-bold inline-flex items-center justify-center gap-2 transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFD400]"
              >
                <ClipboardList className="w-4 h-4 text-slate-600" />
                <span>Meus chamados</span>
              </button>
            </div>

            <div className="flex items-center gap-2 pt-1 text-xs text-slate-500">
              <Clock3 aria-hidden="true" className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span>Prazo padrão de atendimento: 48 horas</span>
            </div>
          </section>

          {/* 5. FAIXA COMPACTA: CONTATOS E DOCUMENTOS */}
          <section
            aria-labelledby="contacts-docs-heading"
            className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-3.5"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 id="contacts-docs-heading" className="text-sm font-extrabold text-[#15191D]">
                Contatos e Documentos
              </h2>
              <span className="text-[11px] text-slate-500">Canais oficiais</span>
            </div>

            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
              {/* Suporte de TI */}
              <div className="p-3.5 flex items-center justify-between gap-3 bg-white">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-[#080B0D] text-[#FFD400] flex items-center justify-center shrink-0">
                    <Phone className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-[#15191D]">Suporte de TI</p>
                    <p className="text-xs font-mono text-slate-600 tabular-nums mt-0.5">
                      {SUPPORT_PHONE}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    copyValue(
                      'ti-phone',
                      SUPPORT_PHONE,
                      'Telefone do Suporte de TI copiado.'
                    )
                  }
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-[#F3F5F7] hover:bg-slate-200/70 text-[11px] font-bold text-[#15191D] inline-flex items-center gap-1.5 shrink-0 cursor-pointer transition-colors"
                >
                  {copiedKey === 'ti-phone' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-700" />
                      <span>Copiado</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-slate-500" />
                      <span>Copiar</span>
                    </>
                  )}
                </button>
              </div>

              {/* Atendimento de RH */}
              <div className="p-3.5 flex items-center justify-between gap-3 bg-white">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-[#F3F5F7] text-[#15191D] flex items-center justify-center shrink-0">
                    <Mail className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-[#15191D]">Atendimento de RH</p>
                    <p className="text-xs text-slate-600 truncate mt-0.5">
                      <span className="font-mono tabular-nums">{SUPPORT_PHONE}</span> · {RH_EMAIL}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    copyValue(
                      'rh-contact',
                      `${SUPPORT_PHONE} | ${RH_EMAIL}`,
                      'Contato do Atendimento de RH copiado.'
                    )
                  }
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-[#F3F5F7] hover:bg-slate-200/70 text-[11px] font-bold text-[#15191D] inline-flex items-center gap-1.5 shrink-0 cursor-pointer transition-colors"
                >
                  {copiedKey === 'rh-contact' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-700" />
                      <span>Copiado</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-slate-500" />
                      <span>Copiar</span>
                    </>
                  )}
                </button>
              </div>

              {/* Manual do Colaborador em PDF */}
              <div className="p-3.5 flex items-center justify-between gap-3 bg-white">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-[#FFF6CC] text-[#080B0D] flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-[#15191D]">Manual do Colaborador</p>
                    <p className="text-[11px] text-slate-600 truncate mt-0.5">
                      Manual da Equipe · Edição 2027 (PDF)
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <a
                    href={MANUAL_PDF_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-[#F3F5F7] hover:bg-slate-200/70 text-[11px] font-bold text-[#15191D] inline-flex items-center gap-1 transition-colors"
                    title="Abrir Manual do Colaborador em PDF"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
                    <span>Abrir</span>
                  </a>
                  <a
                    href={MANUAL_PDF_URL}
                    download={MANUAL_PDF_FILENAME}
                    onClick={() => showToast('Download do Manual do Colaborador iniciado.')}
                    className="px-2.5 py-1.5 rounded-lg bg-[#080B0D] hover:bg-slate-800 text-[#FFD400] text-[11px] font-bold inline-flex items-center gap-1 transition-colors"
                    title="Baixar Manual do Colaborador em PDF"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>PDF</span>
                  </a>
                </div>
              </div>
            </div>
          </section>
        </aside>
      </div>

      {/* MODAL 1: ABRIR CHAMADO */}
      <CorporateModal
        isOpen={isTicketModalOpen}
        onClose={handleCloseTicketModal}
        title={createdTicket ? 'Chamado registrado' : 'Abrir chamado interno'}
        subtitle={
          createdTicket
            ? `Protocolo ${createdTicket.protocol} gerado com sucesso`
            : 'Prazo padrão de atendimento: 48 horas'
        }
        icon={<Headphones className="w-5 h-5" />}
        maxWidth="lg"
        hasUnsavedChanges={hasUnsavedTicketDraft}
        isLoading={isSubmittingTicket}
        loadingMessage="Registrando chamado e gerando protocolo..."
      >
        {!canAccessRequests ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-950 space-y-1 leading-relaxed">
                <p className="font-bold text-sm">Fila de solicitações não habilitada neste perfil</p>
                <p>
                  Seu perfil operacional não possui o módulo de Solicitações habilitado. Utilize os
                  canais diretos abaixo para atendimento imediato de TI ou RH.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-xl border border-slate-200 p-3.5 space-y-2">
                <p className="text-xs font-bold text-[#15191D]">Suporte de TI</p>
                <p className="text-xs font-mono text-slate-700">{SUPPORT_PHONE}</p>
                <button
                  type="button"
                  onClick={() => copyValue('modal-ti', SUPPORT_PHONE, 'Telefone de TI copiado.')}
                  className="text-xs font-bold text-[#080B0D] underline underline-offset-2 cursor-pointer"
                >
                  {copiedKey === 'modal-ti' ? 'Copiado' : 'Copiar telefone'}
                </button>
              </div>
              <div className="rounded-xl border border-slate-200 p-3.5 space-y-2">
                <p className="text-xs font-bold text-[#15191D]">Atendimento de RH</p>
                <p className="text-xs text-slate-700">{RH_EMAIL}</p>
                <button
                  type="button"
                  onClick={() => copyValue('modal-rh', RH_EMAIL, 'E-mail de RH copiado.')}
                  className="text-xs font-bold text-[#080B0D] underline underline-offset-2 cursor-pointer"
                >
                  {copiedKey === 'modal-rh' ? 'Copiado' : 'Copiar e-mail'}
                </button>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={handleCloseTicketModal}
                className="px-4 py-2 rounded-xl bg-[#080B0D] text-white text-xs font-bold cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        ) : createdTicket ? (
          <div className="space-y-5">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-4 flex items-start gap-3">
              <CheckCircle2 className="w-6 h-6 text-emerald-700 shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-sm font-extrabold text-emerald-950">
                  Solicitação enviada para {createdTicket.targetDepartment}
                </p>
                <p className="text-xs text-emerald-900">
                  Seu protocolo oficial foi salvo no sistema com prazo de atendimento até{' '}
                  <span className="font-semibold tabular-nums">
                    {formatDateTime(createdTicket.currentDueAtIso)}
                  </span>
                  .
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-[#F3F5F7] p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <span className="text-[11px] font-semibold text-slate-500">Protocolo</span>
                  <p className="text-lg font-extrabold font-mono text-[#15191D] tabular-nums">
                    {createdTicket.protocol}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    copyValue(
                      'protocol-copy',
                      createdTicket.protocol,
                      `Protocolo ${createdTicket.protocol} copiado.`
                    )
                  }
                  className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-[#15191D] inline-flex items-center gap-1.5 cursor-pointer"
                >
                  {copiedKey === 'protocol-copy' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-700" />
                      <span>Copiado</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copiar protocolo</span>
                    </>
                  )}
                </button>
              </div>

              <div className="text-xs text-slate-700 space-y-1 border-t border-slate-200 pt-2.5">
                <p>
                  <span className="font-semibold text-slate-500">Assunto:</span>{' '}
                  <span className="font-bold text-[#15191D]">{createdTicket.subject}</span>
                </p>
                <p>
                  <span className="font-semibold text-slate-500">Prioridade:</span>{' '}
                  {createdTicket.priority} ·{' '}
                  <span className="font-semibold text-slate-500">Status:</span>{' '}
                  {createdTicket.status}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
              <button
                type="button"
                onClick={resetTicketForm}
                className="px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-[#15191D] cursor-pointer"
              >
                Abrir outro chamado
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCloseTicketModal}
                  className="px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Fechar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsTicketModalOpen(false);
                    setExpandedTicketId(createdTicket.id);
                    handleOpenMyTickets();
                  }}
                  className="px-4 py-2.5 rounded-xl bg-[#FFD400] hover:bg-[#f2c900] text-xs font-extrabold text-[#080B0D] cursor-pointer"
                >
                  Acompanhar em Meus chamados
                </button>
              </div>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmitTicket} className="space-y-4">
            {ticketError && (
              <div
                role="alert"
                className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-semibold text-red-800 flex items-start gap-2"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{ticketError}</span>
              </div>
            )}

            <div>
              <label htmlFor="help-ticket-dept" className="block text-xs font-bold text-[#15191D] mb-1.5">
                Setor responsável *
              </label>
              <select
                id="help-ticket-dept"
                value={ticketDepartment}
                onChange={(e) => setTicketDepartment(e.target.value as Department)}
                className="w-full h-10 px-3 rounded-xl border border-slate-300 bg-white text-sm text-[#15191D] focus:border-[#080B0D] focus:outline-none focus:ring-2 focus:ring-[#FFD400]/60"
              >
                {VALID_DEPARTMENTS.map((dept) => (
                  <option key={dept.value} value={dept.value}>
                    {dept.label} — {dept.hint}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <span className="block text-xs font-bold text-[#15191D] mb-1.5">Prioridade *</span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {PRIORITIES.map((p) => {
                  const active = ticketPriority === p.value;
                  return (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => setTicketPriority(p.value)}
                      aria-pressed={active}
                      className={`h-9 rounded-xl border text-xs font-bold transition-colors cursor-pointer ${
                        active
                          ? 'border-[#080B0D] bg-[#080B0D] text-[#FFD400]'
                          : `${p.tone} hover:border-slate-400`
                      }`}
                    >
                      {p.value}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="help-ticket-subject" className="text-xs font-bold text-[#15191D]">
                  Assunto *
                </label>
                <span className="text-[11px] text-slate-400 tabular-nums">
                  {ticketSubject.length}/200
                </span>
              </div>
              <input
                id="help-ticket-subject"
                type="text"
                maxLength={200}
                required
                value={ticketSubject}
                onChange={(e) => {
                  setTicketSubject(e.target.value);
                  if (ticketError) setTicketError(null);
                }}
                placeholder="Ex: Ajuste de acesso ao sistema ou dúvida sobre folha"
                className="w-full h-10 px-3 rounded-xl border border-slate-300 bg-white text-sm text-[#15191D] focus:border-[#080B0D] focus:outline-none focus:ring-2 focus:ring-[#FFD400]/60"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="help-ticket-desc" className="text-xs font-bold text-[#15191D]">
                  Descrição *
                </label>
                <span className="text-[11px] text-slate-400 tabular-nums">
                  {ticketDescription.length}/3000
                </span>
              </div>
              <textarea
                id="help-ticket-desc"
                rows={4}
                maxLength={3000}
                required
                value={ticketDescription}
                onChange={(e) => {
                  setTicketDescription(e.target.value);
                  if (ticketError) setTicketError(null);
                }}
                placeholder="Detalhe o que aconteceu ou o que você precisa para agilizar o atendimento..."
                className="w-full p-3 rounded-xl border border-slate-300 bg-white text-sm text-[#15191D] focus:border-[#080B0D] focus:outline-none focus:ring-2 focus:ring-[#FFD400]/60 resize-y"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
              <span className="text-[11px] text-slate-500 inline-flex items-center gap-1.5">
                <Clock3 className="w-3.5 h-3.5 text-slate-400" />
                Prazo padrão: 48 horas
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCloseTicketModal}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingTicket}
                  className="px-5 py-2.5 rounded-xl bg-[#FFD400] hover:bg-[#f2c900] disabled:opacity-50 text-xs font-extrabold text-[#080B0D] cursor-pointer"
                >
                  Enviar chamado
                </button>
              </div>
            </div>
          </form>
        )}
      </CorporateModal>

      {/* MODAL 2: MEUS CHAMADOS */}
      <CorporateModal
        isOpen={isMyTicketsOpen}
        onClose={() => setIsMyTicketsOpen(false)}
        title="Meus chamados"
        subtitle="Acompanhamento de protocolos registrados por você"
        icon={<ClipboardList className="w-5 h-5" />}
        maxWidth="3xl"
        headerRight={
          canAccessRequests && (
            <button
              type="button"
              onClick={() => void loadMyTickets()}
              disabled={isLoadingTickets}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="Atualizar lista de chamados"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingTickets ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Atualizar</span>
            </button>
          )
        }
        footer={
          <div className="w-full flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-slate-500">
              Prazo padrão de atendimento: 48 horas
            </span>
            <div className="flex items-center gap-2">
              {canAccessRequests && (
                <button
                  type="button"
                  onClick={() => {
                    setIsMyTicketsOpen(false);
                    onNavigate('solicitacoes');
                  }}
                  className="px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-[#15191D] cursor-pointer"
                >
                  Abrir Central de Solicitações
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setIsMyTicketsOpen(false);
                  handleOpenCreateTicket();
                }}
                className="px-4 py-2 rounded-xl bg-[#FFD400] hover:bg-[#f2c900] text-xs font-extrabold text-[#080B0D] cursor-pointer"
              >
                Abrir chamado
              </button>
            </div>
          </div>
        }
      >
        {!canAccessRequests ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-950 space-y-2">
            <p className="font-bold text-sm">Módulo de solicitações não habilitado neste perfil</p>
            <p>
              Para acompanhar ou solicitar atendimento, entre em contato com TI ({SUPPORT_PHONE}) ou
              RH ({RH_EMAIL}).
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Search & Status filter */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={ticketsSearch}
                  onChange={(e) => setTicketsSearch(e.target.value)}
                  placeholder="Filtrar por protocolo, assunto ou setor..."
                  className="w-full h-9 pl-9 pr-3 rounded-xl border border-slate-200 bg-[#F3F5F7] text-xs text-[#15191D] focus:bg-white focus:border-[#080B0D] focus:outline-none"
                />
              </div>
              <div className="flex items-center gap-1">
                {(['Todos', 'Abertos', 'Concluídos'] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setTicketsFilter(tab)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                      ticketsFilter === tab
                        ? 'bg-[#080B0D] text-[#FFD400]'
                        : 'bg-[#F3F5F7] text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>

            {/* States: Loading / Error / Empty / List */}
            {isLoadingTickets && myTickets.length === 0 ? (
              <div className="space-y-2.5" aria-busy="true">
                {[1, 2, 3].map((row) => (
                  <div
                    key={row}
                    className="h-16 rounded-xl border border-slate-200 bg-slate-100/70 animate-pulse"
                  />
                ))}
              </div>
            ) : ticketsError ? (
              <div
                role="alert"
                className="rounded-xl border border-red-200 bg-red-50 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="flex items-start gap-2.5 text-xs text-red-900">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{ticketsError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => void loadMyTickets()}
                  className="px-3 py-1.5 rounded-lg bg-white border border-red-200 text-xs font-bold text-red-900 hover:bg-red-100/60 cursor-pointer shrink-0"
                >
                  Tentar novamente
                </button>
              </div>
            ) : filteredMyTickets.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-[#F3F5F7]/70 p-6 text-center space-y-2">
                <p className="text-sm font-bold text-[#15191D]">
                  {myTickets.length === 0
                    ? 'Você ainda não possui chamados registrados'
                    : 'Nenhum chamado encontrado para o filtro aplicado'}
                </p>
                <p className="text-xs text-slate-600">
                  Quando abrir uma solicitação, o protocolo e o prazo aparecerão aqui.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[52vh] overflow-y-auto pr-0.5">
                {filteredMyTickets.map((ticket) => {
                  const sla = getSlaSummary(ticket);
                  const expanded = expandedTicketId === ticket.id;
                  return (
                    <div
                      key={ticket.id}
                      className="rounded-xl border border-slate-200 bg-white overflow-hidden"
                    >
                      <button
                        type="button"
                        aria-expanded={expanded}
                        onClick={() => setExpandedTicketId(expanded ? null : ticket.id)}
                        className="w-full p-3.5 text-left flex items-start justify-between gap-3 hover:bg-[#F3F5F7]/70 transition-colors cursor-pointer"
                      >
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-xs font-extrabold text-[#15191D] tabular-nums">
                              {ticket.protocol}
                            </span>
                            <span
                              className={`text-[11px] font-bold px-2 py-0.5 rounded-md border ${getStatusAccent(
                                ticket.status
                              )}`}
                            >
                              {ticket.status}
                            </span>
                            <span className={`text-[11px] font-semibold ${sla.toneClass}`}>
                              {sla.text}
                            </span>
                          </div>
                          <p className="text-sm font-bold text-[#15191D] truncate">
                            {ticket.subject}
                          </p>
                          <p className="text-[11px] text-slate-500 tabular-nums">
                            {ticket.targetDepartment} · Prioridade {ticket.priority} · Aberto em{' '}
                            {formatDateTime(ticket.createdAtIso)}
                          </p>
                        </div>
                        <ChevronDown
                          className={`w-4 h-4 text-slate-400 shrink-0 mt-1 transition-transform duration-150 ${
                            expanded ? 'rotate-180 text-[#080B0D]' : ''
                          }`}
                        />
                      </button>

                      {expanded && (
                        <div className="px-3.5 pb-3.5 pt-2 bg-[#F8FAFC] border-t border-slate-100 space-y-2.5 text-xs">
                          <p className="text-slate-700 whitespace-pre-line leading-relaxed">
                            {ticket.description}
                          </p>
                          {ticket.assignedToName && (
                            <p className="text-[11px] text-slate-600">
                              <span className="font-semibold">Responsável:</span>{' '}
                              {ticket.assignedToName}
                            </p>
                          )}
                          {ticket.history && ticket.history.length > 0 && (
                            <div className="pt-1 border-t border-slate-200/80 space-y-1.5">
                              <span className="text-[11px] font-bold text-slate-500">
                                Histórico recente
                              </span>
                              {ticket.history.slice(-3).map((entry) => (
                                <div
                                  key={entry.id}
                                  className="text-[11px] text-slate-700 flex flex-wrap justify-between gap-2"
                                >
                                  <span>
                                    <strong>{entry.action}</strong> — {entry.actorName}
                                    {entry.note ? `: ${entry.note}` : ''}
                                  </span>
                                  <span className="text-slate-400 tabular-nums">
                                    {formatDateTime(entry.timestamp)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </CorporateModal>
    </div>
  );
};
