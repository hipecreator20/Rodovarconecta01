import React, { useState } from 'react';
import {
  Bell,
  Headphones,
  Building2,
  MapPin,
  Coins,
  ChevronRight,
  CheckCircle2,
  Clock,
  Truck,
  Zap,
  Info,
  Check,
  Leaf,
  ExternalLink,
  ShieldCheck,
  ListOrdered,
} from 'lucide-react';
import type { Employee, MenuSection } from '../types';
import { RodovarLogo } from './RodovarLogo';

interface SectorNotificationFlowViewProps {
  currentUser?: Employee;
  economicMode: boolean;
  onToggleEconomicMode?: (newVal: boolean) => Promise<void> | void;
  onNavigate?: (section: MenuSection) => void;
  onNavigateSection?: (section: MenuSection) => void;
  onOpenNotifications?: () => void;
  realNotifications?: any[];
  onMarkAllRead?: () => void;
  onAccessNotification?: (n: any) => void;
}

export function SectorNotificationFlowView({
  currentUser,
  economicMode,
  onToggleEconomicMode,
  onNavigate,
  onNavigateSection,
  onOpenNotifications,
  realNotifications = [],
  onMarkAllRead,
  onAccessNotification,
}: SectorNotificationFlowViewProps) {
  const navigate = onNavigate || onNavigateSection || (() => {});
  const [isToggling, setIsToggling] = useState(false);
  const [toggleNotice, setToggleNotice] = useState<string | null>(null);
  const isAdmin = currentUser?.accessLevel === 'ADMINISTRADOR';

  const handleToggle = async () => {
    if (!onToggleEconomicMode || !isAdmin) return;
    setIsToggling(true);
    try {
      await onToggleEconomicMode(!economicMode);
      setToggleNotice(
        !economicMode
          ? 'Modo Econômico ativado: chats, grupos e polling foram pausados para economizar recursos.'
          : 'Modo Econômico desativado pelo Administrador.'
      );
      setTimeout(() => setToggleNotice(null), 5000);
    } finally {
      setIsToggling(false);
    }
  };

  const unreadCount = realNotifications.filter((n) => !n.read).length;
  const previewNotifications = realNotifications.slice(0, 4);

  return (
    <div className="w-full space-y-6 pb-12 animate-fadeIn">
      {/* 1. TOP HEADER BANNER (Identical to Visual Reference) */}
      <div className="bg-[#080B0D] rounded-2xl p-6 border border-gray-800 shadow-xl flex flex-col lg:flex-row lg:items-center justify-between gap-5">
        <div className="flex items-center gap-4 flex-wrap">
          <RodovarLogo size="md" />
          <div className="hidden sm:block w-0.5 h-10 bg-[#FFD400]" />
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
              Fluxo de Notificações entre Setores
            </h1>
            <p className="text-xs sm:text-sm text-gray-400 font-medium">
              Comunicação interna automática, leve e sem chat, ideal para Neon Free + Vercel
            </p>
          </div>
        </div>

        {/* Economic Mode Badge with Toggle */}
        <div
          className={`flex items-center gap-4 rounded-2xl px-5 py-3 shrink-0 border ${
            economicMode
              ? 'bg-[#10B981]/15 border-[#10B981]/40'
              : 'bg-[#FFD400]/10 border-[#FFD400]/40'
          }`}
        >
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
              economicMode ? 'bg-[#10B981]/25 text-[#10B981]' : 'bg-[#FFD400]/20 text-[#FFD400]'
            }`}
          >
            <Leaf className={`w-5 h-5 ${economicMode ? 'fill-[#10B981]/30' : ''}`} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-black text-white">
                {economicMode ? 'Modo Econômico Ativo' : 'Modo Padrão (Tempo Real)'}
              </span>
              <span
                className={`w-2 h-2 rounded-full animate-pulse ${
                  economicMode ? 'bg-[#10B981]' : 'bg-[#FFD400]'
                }`}
              />
            </div>
            <p className={`text-[11px] font-medium ${economicMode ? 'text-[#A7F3D0]' : 'text-[#FDE68A]'}`}>
              {economicMode
                ? 'Sem chat, sem grupos, com notificações sob demanda.'
                : 'Atualização periódica ativa para painéis internos.'}
            </p>
          </div>

          {/* Toggle Switch */}
          <button
            type="button"
            onClick={handleToggle}
            disabled={!isAdmin || isToggling}
            className={`relative inline-flex h-7 w-13 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              economicMode ? 'bg-[#FFD400]' : 'bg-gray-600'
            } ${!isAdmin ? 'opacity-85 cursor-not-allowed' : ''}`}
            title={
              isAdmin
                ? 'Alternar Modo Econômico'
                : 'Apenas administradores podem desativar o Modo Econômico'
            }
          >
            <span
              className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                economicMode ? 'translate-x-6' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      {toggleNotice && (
        <div className="bg-[#10B981]/10 border border-[#10B981]/30 rounded-xl p-3 text-xs font-bold text-[#065F46] flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-[#10B981]" />
          <span>{toggleNotice}</span>
        </div>
      )}

      {/* 2. MAIN CARD: "Como funciona a notificação entre setores?" */}
      <div className="bg-white rounded-2xl p-6 sm:p-7 border border-gray-200/90 shadow-sm space-y-6">
        <div className="flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-[#FFFDEB] border border-[#FFD400]/50 flex items-center justify-center text-[#080B0D] shrink-0 mt-0.5">
            <Bell className="w-5 h-5 text-[#FFD400] fill-[#FFD400]" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-black text-[#15191D] tracking-tight">
              Como funciona a notificação entre setores?
            </h2>
            <p className="text-xs sm:text-sm text-gray-500 font-medium mt-0.5">
              Cada ação gera uma notificação automática para o próximo setor, mantendo o fluxo do frete organizado.
            </p>
          </div>
        </div>

        {/* 4 STAGES CARDS HORIZONTAL GRID */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-stretch relative">
          {/* Card 1: Comercial */}
          <div className="bg-[#EFF6FF] border border-[#BFDBFE] rounded-2xl p-5 relative flex flex-col justify-between hover:shadow-md transition">
            <div className="absolute top-4 right-4 bg-[#E5252A] text-white text-[11px] font-black w-6 h-6 rounded-full flex items-center justify-center shadow">
              <Bell className="w-3.5 h-3.5 fill-white" />
            </div>

            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-[#2563EB] text-white flex items-center justify-center shadow-md shrink-0">
                  <Headphones className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-black text-[#1E3A8A]">Comercial</h3>
                  <p className="text-xs text-gray-600 font-semibold">Cadastra o frete</p>
                </div>
              </div>

              <div className="space-y-2 text-xs font-semibold text-gray-700">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#16A34A] shrink-0" />
                  <span>Inclui os dados do cliente</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#16A34A] shrink-0" />
                  <span>Define a rota e o serviço</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#16A34A] shrink-0" />
                  <span>Envia para Expedição</span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => navigate('fretes_comercial')}
              className="mt-5 w-full py-2 px-3 rounded-xl bg-white hover:bg-blue-50 text-[#1E3A8A] border border-[#BFDBFE] text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <span>Ver Fretes Comercial</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Card 2: Expedição */}
          <div className="bg-[#FEFCE8] border border-[#FEF08A] rounded-2xl p-5 relative flex flex-col justify-between hover:shadow-md transition">
            <div className="absolute top-4 right-4 bg-[#E5252A] text-white text-[11px] font-black w-6 h-6 rounded-full flex items-center justify-center shadow">
              <Bell className="w-3.5 h-3.5 fill-white" />
            </div>

            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-[#EAB308] text-white flex items-center justify-center shadow-md shrink-0">
                  <Building2 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-black text-[#713F12]">Expedição</h3>
                  <p className="text-xs text-gray-600 font-semibold">Prepara e libera</p>
                </div>
              </div>

              <div className="space-y-2 text-xs font-semibold text-gray-700">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#16A34A] shrink-0" />
                  <span>Confere a documentação</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#16A34A] shrink-0" />
                  <span>Agenda o carregamento</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#16A34A] shrink-0" />
                  <span>Libera para Monitoramento</span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => navigate('fretes_expedicao')}
              className="mt-5 w-full py-2 px-3 rounded-xl bg-white hover:bg-amber-50 text-[#713F12] border border-[#FEF08A] text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <span>Ver Fretes Expedição</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Card 3: Monitoramento */}
          <div className="bg-[#F0FDF4] border border-[#BBF7D0] rounded-2xl p-5 relative flex flex-col justify-between hover:shadow-md transition">
            <div className="absolute top-4 right-4 bg-[#E5252A] text-white text-[11px] font-black w-6 h-6 rounded-full flex items-center justify-center shadow">
              <Bell className="w-3.5 h-3.5 fill-white" />
            </div>

            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-[#16A34A] text-white flex items-center justify-center shadow-md shrink-0">
                  <MapPin className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-black text-[#14532D]">Monitoramento</h3>
                  <p className="text-xs text-gray-600 font-semibold">Acompanha a viagem</p>
                </div>
              </div>

              <div className="space-y-2 text-xs font-semibold text-gray-700">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#16A34A] shrink-0" />
                  <span>Atualiza o status do frete</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#16A34A] shrink-0" />
                  <span>Informa ocorrências</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#16A34A] shrink-0" />
                  <span>Finaliza e envia para Financeiro</span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => navigate('fretes_ativos')}
              className="mt-5 w-full py-2 px-3 rounded-xl bg-white hover:bg-green-50 text-[#14532D] border border-[#BBF7D0] text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <span>Ver Fretes Ativos</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Card 4: Financeiro */}
          <div className="bg-[#FAF5FF] border border-[#E9D5FF] rounded-2xl p-5 relative flex flex-col justify-between hover:shadow-md transition">
            <div className="absolute top-4 right-4 bg-[#E5252A] text-white text-[11px] font-black w-6 h-6 rounded-full flex items-center justify-center shadow">
              <Bell className="w-3.5 h-3.5 fill-white" />
            </div>

            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-[#9333EA] text-white flex items-center justify-center shadow-md shrink-0">
                  <Coins className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-black text-[#581C87]">Financeiro</h3>
                  <p className="text-xs text-gray-600 font-semibold">Conclui o processo</p>
                </div>
              </div>

              <div className="space-y-2 text-xs font-semibold text-gray-700">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#16A34A] shrink-0" />
                  <span>Recebe o frete finalizado</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#16A34A] shrink-0" />
                  <span>Confere valores e documentações</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#16A34A] shrink-0" />
                  <span>Registra e encerra</span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => navigate('financeiro')}
              className="mt-5 w-full py-2 px-3 rounded-xl bg-white hover:bg-purple-50 text-[#581C87] border border-[#E9D5FF] text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <span>Ver Financeiro</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* 3. BOTTOM 3 COLUMNS (Identical to Visual Reference) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* COL 1 (Left 4 cols): Exemplo Prático do Processo */}
        <div className="lg:col-span-4 bg-white rounded-2xl p-6 border border-gray-200/90 shadow-sm flex flex-col justify-between h-full">
          <div>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700 shrink-0">
                <ListOrdered className="w-5 h-5 text-amber-600" />
              </div>
              <h3 className="text-base font-black text-[#15191D]">Exemplo prático do processo</h3>
            </div>

            {/* Vertical timeline connected with dashed border */}
            <div className="relative pl-6 space-y-7 before:absolute before:left-3.5 before:top-3 before:bottom-3 before:w-0.5 before:border-l-2 before:border-dashed before:border-[#FFD400]">
              {/* Event 1: Comercial */}
              <div className="relative">
                <div className="absolute -left-6 top-0 w-7 h-7 rounded-full bg-blue-100 border-2 border-white flex items-center justify-center text-blue-600 shadow-sm">
                  <Truck className="w-3.5 h-3.5" />
                </div>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-black text-[#15191D]">1. Comercial</span>
                  <span className="text-xs font-mono font-bold text-gray-400">10:15</span>
                </div>
                <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">
                  Frete #4587 cadastrado e enviado para a Expedição.
                </p>
              </div>

              {/* Event 2: Expedição */}
              <div className="relative">
                <div className="absolute -left-6 top-0 w-7 h-7 rounded-full bg-amber-100 border-2 border-white flex items-center justify-center text-amber-600 shadow-sm">
                  <Building2 className="w-3.5 h-3.5" />
                </div>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-black text-[#15191D]">2. Expedição</span>
                  <span className="text-xs font-mono font-bold text-gray-400">11:02</span>
                </div>
                <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">
                  Frete #4587 liberado e encaminhado para o Monitoramento.
                </p>
              </div>

              {/* Event 3: Monitoramento */}
              <div className="relative">
                <div className="absolute -left-6 top-0 w-7 h-7 rounded-full bg-green-100 border-2 border-white flex items-center justify-center text-green-600 shadow-sm">
                  <MapPin className="w-3.5 h-3.5" />
                </div>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-black text-[#15191D]">3. Monitoramento</span>
                  <span className="text-xs font-mono font-bold text-gray-400">14:37</span>
                </div>
                <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">
                  Frete #4587 entregue e finalizado. Enviado para o Financeiro.
                </p>
              </div>

              {/* Event 4: Financeiro */}
              <div className="relative">
                <div className="absolute -left-6 top-0 w-7 h-7 rounded-full bg-purple-100 border-2 border-white flex items-center justify-center text-purple-600 shadow-sm">
                  <Coins className="w-3.5 h-3.5" />
                </div>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-black text-[#15191D]">4. Financeiro</span>
                  <span className="text-xs font-mono font-bold text-gray-400">15:10</span>
                </div>
                <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">
                  Frete #4587 conferido e encerrado.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-gray-100 text-[11px] text-gray-500 flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-[#FFD400]" />
            <span>Fluxo contínuo com registro de horário exato e responsável.</span>
          </div>
        </div>

        {/* COL 2 (Center 4 cols): Notificações no sistema (Mockup visual idêntico) */}
        <div className="lg:col-span-4 bg-white rounded-2xl p-6 border border-gray-200/90 shadow-sm space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700 shrink-0">
              <Bell className="w-5 h-5 text-amber-600" />
            </div>
            <h3 className="text-base font-black text-[#15191D]">Notificações no sistema</h3>
          </div>

          {/* Mini Mockup Window */}
          <div className="bg-[#080B0D] rounded-xl p-3.5 shadow-lg border border-gray-800 space-y-3">
            {/* Header with Bell and Avatar */}
            <div className="flex items-center justify-between text-white pb-2 border-b border-gray-800">
              <div className="relative">
                <Bell className="w-5 h-5 fill-white" />
                <span className="absolute -top-1.5 -right-1.5 bg-[#E5252A] text-white text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center">
                  {unreadCount}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-gray-300">
                  {currentUser?.name || 'Administrador Geral'}
                </span>
                <div className="w-7 h-7 rounded-full bg-[#15191D] border border-[#FFD400] flex items-center justify-center text-[10px] font-black text-[#FFD400]">
                  ROD
                </div>
              </div>
            </div>

            {/* Notifications List Card */}
            <div className="bg-white rounded-lg p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-black text-[#15191D]">Notificações</span>
                  <span className="bg-[#E5252A] text-white text-[10px] font-black px-1.5 py-0.2 rounded-full">
                    {unreadCount}
                  </span>
                </div>
                {onMarkAllRead && (
                  <button
                    type="button"
                    onClick={onMarkAllRead}
                    className="text-[10px] font-bold text-blue-600 hover:underline cursor-pointer"
                  >
                    Marcar todas como lidas
                  </button>
                )}
              </div>

              {/* Notification items */}
              <div className="space-y-2 divide-y divide-gray-100">
                {previewNotifications.length > 0 ? (
                  previewNotifications.map((notif) => {
                    const color =
                      notif.dotColor === 'green'
                        ? 'green'
                        : notif.dotColor === 'red' || notif.dotColor === 'yellow'
                        ? 'purple'
                        : 'blue';
                    const Icon =
                      notif.targetSection === 'financeiro'
                        ? Coins
                        : notif.targetSection === 'fretes_ativos'
                        ? MapPin
                        : Truck;
                    return (
                      <div
                        key={notif.id}
                        onClick={() => {
                          if (onAccessNotification) onAccessNotification(notif);
                          else if (notif.targetSection) navigate(notif.targetSection);
                        }}
                        className="pt-2 first:pt-0 flex items-start gap-2.5 group cursor-pointer hover:bg-gray-50 rounded p-1 transition"
                      >
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                            color === 'blue'
                              ? 'bg-blue-100 text-blue-600'
                              : color === 'green'
                              ? 'bg-green-100 text-green-600'
                              : 'bg-purple-100 text-purple-600'
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1">
                            <p className="text-xs font-black text-[#15191D] group-hover:text-blue-600 truncate">
                              {notif.title}
                            </p>
                            <span className="text-[10px] font-mono text-gray-400 shrink-0">
                              {notif.timeLabel || 'Agora'}
                            </span>
                          </div>
                          <p className="text-[11px] text-gray-500 leading-snug line-clamp-2">
                            {notif.subtitle}
                          </p>
                        </div>
                        {!notif.read && (
                          <span className="w-2 h-2 rounded-full bg-[#FFD400] shrink-0 mt-1.5" />
                        )}
                      </div>
                    );
                  })
                ) : (
                  <p className="text-xs text-gray-500 py-3 text-center">
                    Nenhuma notificação pendente no momento.
                  </p>
                )}
              </div>

              {/* Action Button */}
              <button
                type="button"
                onClick={() => {
                  if (onOpenNotifications) onOpenNotifications();
                }}
                className="w-full mt-2 py-2 px-3 rounded-lg bg-[#FFD400] hover:bg-[#ffdf33] text-[#080B0D] text-xs font-black transition flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
              >
                <span>Ver todas as notificações</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* COL 3 (Right 4 cols): Benefícios e Como a notificação funciona */}
        <div className="lg:col-span-4 space-y-4">
          {/* Card: Benefícios do modelo */}
          <div className="bg-white rounded-2xl p-6 border border-gray-200/90 shadow-sm space-y-3.5">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700 shrink-0">
                <Zap className="w-5 h-5 text-amber-600 fill-amber-500" />
              </div>
              <h3 className="text-base font-black text-[#15191D]">Benefícios do modelo</h3>
            </div>

            <div className="space-y-2.5 text-xs font-semibold text-gray-700 pt-1">
              <div className="flex items-start gap-2.5">
                <Check className="w-4 h-4 text-[#16A34A] shrink-0 mt-0.5" />
                <span>Comunicação automática entre setores</span>
              </div>
              <div className="flex items-start gap-2.5">
                <Check className="w-4 h-4 text-[#16A34A] shrink-0 mt-0.5" />
                <span>Sem chat e sem grupos</span>
              </div>
              <div className="flex items-start gap-2.5">
                <Check className="w-4 h-4 text-[#16A34A] shrink-0 mt-0.5" />
                <span>Baixo consumo no Neon e Vercel</span>
              </div>
              <div className="flex items-start gap-2.5">
                <Check className="w-4 h-4 text-[#16A34A] shrink-0 mt-0.5" />
                <span>Fluxo claro e organizado do frete</span>
              </div>
              <div className="flex items-start gap-2.5">
                <Check className="w-4 h-4 text-[#16A34A] shrink-0 mt-0.5" />
                <span>Capacidade para 20+ usuários no plano gratuito</span>
              </div>
              <div className="flex items-start gap-2.5">
                <Check className="w-4 h-4 text-[#16A34A] shrink-0 mt-0.5" />
                <span>Notificações em tempo real ao acessar o sistema (sem atualização contínua)</span>
              </div>
            </div>
          </div>

          {/* Card: Como a notificação funciona? */}
          <div className="bg-[#EFF6FF] rounded-2xl p-5 border border-[#BFDBFE] space-y-2">
            <div className="flex items-center gap-2 text-[#1E3A8A]">
              <Info className="w-4 h-4 shrink-0" />
              <h4 className="text-xs font-black uppercase tracking-wider">
                Como a notificação funciona?
              </h4>
            </div>
            <p className="text-xs text-gray-700 leading-relaxed font-medium">
              A notificação é criada no momento da ação (ex.: cadastrar, liberar, finalizar). O usuário recebe o aviso no sino do sistema e também na página inicial, no painel de atividades.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
