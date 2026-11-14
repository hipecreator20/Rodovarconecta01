import React, { useEffect, useId, useRef, useState } from 'react';
import {
  Bell,
  ChevronDown,
  ChevronRight,
  LogOut,
  Shield,
  SlidersHorizontal,
  User,
} from 'lucide-react';
import type { Employee, SystemConfig } from '../types';
import { resolveAvatarUrl } from '../lib/serverApi';

export interface UserProfileMenuProps {
  currentUser: Employee;
  systemConfig?: SystemConfig | null;
  unreadNotificationsCount: number;
  pendingAccessRequestsCount?: number;
  canAccessAdmin: boolean;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  onOpenProfile: () => void;
  onOpenPreferences: () => void;
  onOpenNotifications: () => void;
  onOpenAdmin: () => void;
  onLogout: () => void | Promise<void>;
  variant?: 'desktop' | 'mobile';
}

export function getUserInitials(name?: string): string {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return 'RD';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function resolveAccessProfileLabel(user?: Employee | null): string {
  if (!user) return 'Colaborador';
  if (user.accessLevel === 'ADMINISTRADOR') return 'Administrador';
  const profileMap: Record<string, string> = {
    DIRETORIA: 'Diretoria',
    RH: 'RH',
    FINANCEIRO: 'Financeiro',
    COMERCIAL: 'Comercial',
    EXPEDICAO: 'Expedição',
    MONITORAMENTO: 'Monitoramento',
  };
  if (user.accessProfile && profileMap[user.accessProfile]) {
    return profileMap[user.accessProfile];
  }
  if (user.accessLevel === 'DIRETORIA') return 'Diretoria';
  const deptNorm = String(user.department || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
  if (deptNorm === 'administrativo') return 'Administrativo';
  if (deptNorm === 'recursos humanos' || deptNorm === 'rh') return 'RH';
  if (deptNorm === 'financeiro') return 'Financeiro';
  if (deptNorm === 'comercial') return 'Comercial';
  if (deptNorm === 'expedicao') return 'Expedição';
  if (deptNorm === 'monitoramento') return 'Monitoramento';
  if (deptNorm === 'diretoria') return 'Diretoria';
  return user.department || 'Colaborador';
}

function hasUsableCustomPhoto(user?: Employee | null, resolvedUrl?: string): boolean {
  if (!user?.hasCustomAvatar || !resolvedUrl) return false;
  const clean = resolvedUrl.split('?')[0].toLowerCase();
  return !clean.endsWith('/default-avatar.png') && clean.length > 0;
}

const ProfileAvatar: React.FC<{
  user: Employee;
  systemConfig?: SystemConfig | null;
  sizeClass: string;
  textSizeClass: string;
  borderClass?: string;
}> = ({ user, systemConfig, sizeClass, textSizeClass, borderClass = 'ring-2 ring-[#FFD400]' }) => {
  const [imgFailed, setImgFailed] = useState(false);
  const avatarSrc = resolveAvatarUrl(user, systemConfig);

  useEffect(() => {
    setImgFailed(false);
  }, [user.avatar, user.hasCustomAvatar, systemConfig?.revision]);

  const showPhoto = hasUsableCustomPhoto(user, avatarSrc) && !imgFailed;
  const initials = getUserInitials(user.name);

  if (showPhoto) {
    return (
      <img
        src={avatarSrc}
        alt={user.name}
        referrerPolicy="no-referrer"
        onError={() => setImgFailed(true)}
        className={`${sizeClass} rounded-full object-cover aspect-square ${borderClass} bg-[#080B0D] shrink-0`}
      />
    );
  }

  return (
    <div
      aria-hidden="true"
      className={`${sizeClass} rounded-full ${borderClass} bg-[#080B0D] text-[#FFD400] flex items-center justify-center font-extrabold tracking-tight ${textSizeClass} shrink-0 select-none`}
    >
      {initials}
    </div>
  );
};

export const UserProfileMenu: React.FC<UserProfileMenuProps> = ({
  currentUser,
  systemConfig,
  unreadNotificationsCount,
  pendingAccessRequestsCount = 0,
  canAccessAdmin,
  isOpen,
  onToggle,
  onClose,
  onOpenProfile,
  onOpenPreferences,
  onOpenNotifications,
  onOpenAdmin,
  onLogout,
  variant = 'desktop',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuItemsRef = useRef<Array<HTMLButtonElement | null>>([]);
  const menuId = useId();
  const openedByKeyboardRef = useRef(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const accessProfileLabel = resolveAccessProfileLabel(currentUser);
  const isSessionActive =
    Boolean(currentUser?.id) &&
    currentUser.active !== false &&
    currentUser.approvalStatus === 'APROVADO';

  // Close on Escape and manage keyboard focus return
  useEffect(() => {
    if (!isOpen) return;

    if (openedByKeyboardRef.current) {
      openedByKeyboardRef.current = false;
      requestAnimationFrame(() => {
        menuItemsRef.current[0]?.focus();
      });
    }

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        triggerRef.current?.focus();
      }
    };

    const handlePointerDownOutside = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown, true);
    document.addEventListener('mousedown', handlePointerDownOutside);
    document.addEventListener('touchstart', handlePointerDownOutside, { passive: true });
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown, true);
      document.removeEventListener('mousedown', handlePointerDownOutside);
      document.removeEventListener('touchstart', handlePointerDownOutside);
    };
  }, [isOpen, onClose]);

  const handleMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const items = menuItemsRef.current.filter((el): el is HTMLButtonElement => Boolean(el));
    if (items.length === 0) return;

    const currentIndex = items.findIndex((el) => el === document.activeElement);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = currentIndex >= 0 ? (currentIndex + 1) % items.length : 0;
      items[next]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = currentIndex >= 0 ? (currentIndex - 1 + items.length) % items.length : items.length - 1;
      items[prev]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      items[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      items[items.length - 1]?.focus();
    } else if (e.key === 'Tab') {
      onClose();
    }
  };

  const handleTriggerKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      if (!isOpen) {
        openedByKeyboardRef.current = true;
      }
    }
  };

  const handleLogoutClick = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      onClose();
      await onLogout();
    } finally {
      setIsLoggingOut(false);
    }
  };

  // Keep dynamic refs array compact
  let itemCursor = 0;
  const assignItemRef = () => {
    const idx = itemCursor;
    itemCursor += 1;
    return (el: HTMLButtonElement | null) => {
      menuItemsRef.current[idx] = el;
    };
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger Button */}
      {variant === 'mobile' ? (
        <button
          ref={triggerRef}
          type="button"
          onClick={onToggle}
          onKeyDown={handleTriggerKeyDown}
          aria-haspopup="menu"
          aria-expanded={isOpen}
          aria-controls={isOpen ? menuId : undefined}
          aria-label={`Menu da conta de ${currentUser.name}`}
          className="relative flex items-center gap-1 p-0.5 rounded-full hover:bg-white/10 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFD400]"
        >
          <ProfileAvatar
            user={currentUser}
            systemConfig={systemConfig}
            sizeClass="w-8 h-8"
            textSizeClass="text-[11px]"
            borderClass="ring-2 ring-[#FFD400]/90"
          />
        </button>
      ) : (
        <button
          ref={triggerRef}
          type="button"
          onClick={onToggle}
          onKeyDown={handleTriggerKeyDown}
          aria-haspopup="menu"
          aria-expanded={isOpen}
          aria-controls={isOpen ? menuId : undefined}
          aria-label={`Menu da conta de ${currentUser.name}`}
          className={`group flex items-center gap-2.5 lg:gap-3 pl-1.5 pr-2.5 py-1.5 rounded-2xl border transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFD400] ${
            isOpen
              ? 'bg-white/15 border-[#FFD400]/70 shadow-md'
              : 'bg-black/25 hover:bg-white/10 border-white/10 hover:border-white/25'
          }`}
        >
          <ProfileAvatar
            user={currentUser}
            systemConfig={systemConfig}
            sizeClass="w-9 h-9 lg:w-10 lg:h-10"
            textSizeClass="text-xs lg:text-[13px]"
            borderClass="ring-2 ring-[#FFD400]/90 group-hover:ring-[#FFD400]"
          />
          <div className="text-left min-w-0 max-w-[130px] lg:max-w-[185px]">
            <p className="text-[13px] lg:text-sm font-bold text-white leading-tight truncate">
              {currentUser.name}
            </p>
            <p className="text-[11px] text-gray-300 leading-tight truncate mt-0.5">
              {currentUser.department}
              {currentUser.roleTitle ? ` • ${currentUser.roleTitle}` : ''}
            </p>
          </div>
          <ChevronDown
            className={`w-4 h-4 text-gray-300 group-hover:text-[#FFD400] shrink-0 transition-transform duration-150 motion-reduce:transition-none ${
              isOpen ? 'rotate-180 text-[#FFD400]' : ''
            }`}
          />
        </button>
      )}

      {/* Backdrop + Floating Panel */}
      {isOpen && (
        <>
          <div
            aria-hidden="true"
            className="fixed inset-0 z-40 bg-[#080B0D]/20 md:bg-transparent"
            onClick={onClose}
          />
          <div
            id={menuId}
            role="menu"
            aria-label="Opções da conta do colaborador"
            onKeyDown={handleMenuKeyDown}
            className={`rv-menu-enter z-50 bg-white text-[#080B0D] rounded-2xl border border-[#080B0D]/10 shadow-[0_20px_50px_-12px_rgba(8,11,13,0.32),0_4px_14px_-2px_rgba(8,11,13,0.1)] overflow-hidden ${
              variant === 'mobile'
                ? 'fixed top-[56px] right-3 w-[min(340px,calc(100vw-24px))] max-h-[calc(100dvh-80px)] overflow-y-auto'
                : 'absolute right-0 top-[calc(100%+10px)] w-[min(336px,calc(100vw-24px))] max-h-[calc(100dvh-130px)] overflow-y-auto'
            }`}
          >
            {/* Brand Institutional Accent Strip */}
            <div className="h-1 w-full bg-gradient-to-r from-[#080B0D] via-[#FFD400] to-[#080B0D]" />

            {/* Session Identity Card */}
            <div className="p-4 bg-[#F8FAFC] border-b border-gray-200/80">
              <div className="flex items-start gap-3">
                <ProfileAvatar
                  user={currentUser}
                  systemConfig={systemConfig}
                  sizeClass="w-12 h-12"
                  textSizeClass="text-sm"
                  borderClass="ring-2 ring-[#FFD400] shadow-xs"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[14.5px] font-extrabold text-[#080B0D] leading-snug break-words">
                    {currentUser.name}
                  </p>
                  <p className="text-[12px] font-semibold text-[#334155] leading-snug mt-0.5 truncate">
                    {currentUser.roleTitle || 'Colaborador'}
                    {currentUser.department ? ` · ${currentUser.department}` : ''}
                  </p>
                  <p className="text-[11.5px] text-[#64748B] truncate mt-0.5">
                    {currentUser.email}
                  </p>
                </div>
              </div>

              <div className="mt-3 pt-2.5 border-t border-gray-200/70 flex items-center justify-between gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold tracking-wide bg-[#080B0D] text-[#FFD400] px-2.5 py-1 rounded-lg">
                  <Shield className="w-3 h-3 shrink-0" />
                  <span>{accessProfileLabel}</span>
                </span>

                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700">
                  <span
                    aria-hidden="true"
                    className={`w-2 h-2 rounded-full ${
                      isSessionActive ? 'bg-emerald-500' : 'bg-amber-500'
                    }`}
                  />
                  <span>{isSessionActive ? 'Sessão ativa' : 'Sessão restrita'}</span>
                </span>
              </div>
            </div>

            {/* Menu Actions */}
            <div className="p-2 space-y-0.5">
              {/* 1. Meu Perfil */}
              <button
                ref={assignItemRef()}
                type="button"
                role="menuitem"
                onClick={() => {
                  onClose();
                  onOpenProfile();
                }}
                className="w-full min-h-[44px] flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-[#F8FAFC] active:bg-gray-100 transition-colors cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFD400]"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-9 h-9 rounded-xl bg-[#080B0D]/5 group-hover:bg-[#FFD400] text-[#080B0D] flex items-center justify-center shrink-0 transition-colors">
                    <User className="w-4 h-4 stroke-[2.2]" />
                  </span>
                  <div className="min-w-0">
                    <span className="block text-[13px] font-bold text-[#080B0D] leading-tight">
                      Meu Perfil
                    </span>
                    <span className="block text-[11px] text-[#64748B] truncate mt-0.5">
                      Dados pessoais, foto e biografia
                    </span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-[#080B0D] shrink-0 transition-transform group-hover:translate-x-0.5 motion-reduce:transform-none" />
              </button>

              {/* 2. Preferências */}
              <button
                ref={assignItemRef()}
                type="button"
                role="menuitem"
                onClick={() => {
                  onClose();
                  onOpenPreferences();
                }}
                className="w-full min-h-[44px] flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-[#F8FAFC] active:bg-gray-100 transition-colors cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFD400]"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-9 h-9 rounded-xl bg-[#080B0D]/5 group-hover:bg-[#FFD400] text-[#080B0D] flex items-center justify-center shrink-0 transition-colors">
                    <SlidersHorizontal className="w-4 h-4 stroke-[2.2]" />
                  </span>
                  <div className="min-w-0">
                    <span className="block text-[13px] font-bold text-[#080B0D] leading-tight">
                      Preferências
                    </span>
                    <span className="block text-[11px] text-[#64748B] truncate mt-0.5">
                      Conta, senha e alertas de notificação
                    </span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-[#080B0D] shrink-0 transition-transform group-hover:translate-x-0.5 motion-reduce:transform-none" />
              </button>

              {/* 3. Notificações */}
              <button
                ref={assignItemRef()}
                type="button"
                role="menuitem"
                onClick={() => {
                  onClose();
                  onOpenNotifications();
                }}
                className="w-full min-h-[44px] flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-[#F8FAFC] active:bg-gray-100 transition-colors cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFD400]"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-9 h-9 rounded-xl bg-[#080B0D]/5 group-hover:bg-[#FFD400] text-[#080B0D] flex items-center justify-center shrink-0 transition-colors">
                    <Bell className="w-4 h-4 stroke-[2.2]" />
                  </span>
                  <div className="min-w-0">
                    <span className="block text-[13px] font-bold text-[#080B0D] leading-tight">
                      Notificações
                    </span>
                    <span className="block text-[11px] text-[#64748B] truncate mt-0.5">
                      Central de avisos corporativos
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {unreadNotificationsCount > 0 && (
                    <span className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full bg-[#E5252A] text-white text-[11px] font-extrabold tabular-nums">
                      {unreadNotificationsCount > 99 ? '99+' : unreadNotificationsCount}
                    </span>
                  )}
                  <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-[#080B0D] transition-transform group-hover:translate-x-0.5 motion-reduce:transform-none" />
                </div>
              </button>

              {/* 4. Administração (Exclusivo Administrador) */}
              {canAccessAdmin && (
                <button
                  ref={assignItemRef()}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onClose();
                    onOpenAdmin();
                  }}
                  className="w-full min-h-[44px] flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-[#FFFBEB] active:bg-amber-100/70 transition-colors cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFD400]"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-9 h-9 rounded-xl bg-[#FFD400]/25 group-hover:bg-[#FFD400] text-[#080B0D] flex items-center justify-center shrink-0 transition-colors">
                      <Shield className="w-4 h-4 stroke-[2.2]" />
                    </span>
                    <div className="min-w-0">
                      <span className="block text-[13px] font-bold text-[#080B0D] leading-tight">
                        Administração
                      </span>
                      <span className="block text-[11px] text-[#64748B] truncate mt-0.5">
                        Usuários, permissões e sistema
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {pendingAccessRequestsCount > 0 && (
                      <span
                        title="Solicitações pendentes de aprovação"
                        className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full bg-[#080B0D] text-[#FFD400] text-[11px] font-extrabold tabular-nums"
                      >
                        {pendingAccessRequestsCount}
                      </span>
                    )}
                    <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-[#080B0D] transition-transform group-hover:translate-x-0.5 motion-reduce:transform-none" />
                  </div>
                </button>
              )}
            </div>

            {/* Discreet Divider + Real Logout */}
            <div className="px-2 pb-2 pt-1.5 border-t border-gray-100">
              <button
                ref={assignItemRef()}
                type="button"
                role="menuitem"
                disabled={isLoggingOut}
                onClick={handleLogoutClick}
                className="w-full min-h-[44px] flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-left text-[#B91C1C] hover:bg-red-50 active:bg-red-100/80 transition-colors cursor-pointer disabled:opacity-60 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E5252A]"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-9 h-9 rounded-xl bg-red-50 group-hover:bg-red-100 text-[#E5252A] flex items-center justify-center shrink-0 transition-colors">
                    <LogOut className="w-4 h-4 stroke-[2.2]" />
                  </span>
                  <div className="min-w-0">
                    <span className="block text-[13px] font-extrabold leading-tight">
                      {isLoggingOut ? 'Encerrando sessão...' : 'Sair da Conta'}
                    </span>
                    <span className="block text-[11px] text-red-600/80 truncate mt-0.5">
                      Encerrar sessão autenticada
                    </span>
                  </div>
                </div>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
