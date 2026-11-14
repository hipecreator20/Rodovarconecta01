import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, ArrowLeftRight, CheckCircle2, Info, X } from 'lucide-react';

export type PortalToastType = 'error' | 'success' | 'transfer' | 'info';

export interface PortalToastInput {
  type?: PortalToastType;
  title?: string;
  message: string;
  durationMs?: number;
}

interface PortalToastItem {
  id: string;
  type: PortalToastType;
  title: string;
  message: string;
  durationMs: number;
}

const TOAST_EVENT = 'rodovar:portal-toast';

export function inferToastTypeFromMessage(message: string): PortalToastType {
  const lower = String(message || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (
    lower.includes('transferid') ||
    lower.includes('encaminhad') ||
    lower.includes('assumid') ||
    lower.includes('devolvid')
  ) {
    return 'transfer';
  }
  if (
    lower.includes('erro') ||
    lower.includes('falha') ||
    lower.includes('inval') ||
    lower.includes('nao foi possivel') ||
    lower.includes('bloquead') ||
    lower.includes('negad') ||
    lower.includes('excede') ||
    lower.includes('obrigatori')
  ) {
    return 'error';
  }
  if (
    lower.includes('concluid') ||
    lower.includes('salvo') ||
    lower.includes('salva') ||
    lower.includes('atualizad') ||
    lower.includes('alterad') ||
    lower.includes('confirmad') ||
    lower.includes('gerada') ||
    lower.includes('liberad') ||
    lower.includes('reativad') ||
    lower.includes('validad') ||
    lower.includes('excluid') ||
    lower.includes('sucesso') ||
    lower.includes('criada') ||
    lower.includes('aprovad')
  ) {
    return 'success';
  }
  return 'info';
}

function defaultTitleForType(type: PortalToastType): string {
  switch (type) {
    case 'error':
      return 'Atenção / Erro';
    case 'transfer':
      return 'Transferido';
    case 'success':
      return 'Concluído';
    default:
      return 'Aviso';
  }
}

export function emitPortalToast(input: PortalToastInput | string): void {
  if (typeof window === 'undefined') return;
  const normalized: PortalToastInput =
    typeof input === 'string' ? { message: input } : input;
  const cleanMessage = String(normalized.message || '').trim();
  if (!cleanMessage) return;

  const type = normalized.type || inferToastTypeFromMessage(cleanMessage);
  const title = normalized.title || defaultTitleForType(type);
  const durationMs =
    typeof normalized.durationMs === 'number'
      ? normalized.durationMs
      : type === 'error'
      ? 6500
      : 4800;

  window.dispatchEvent(
    new CustomEvent<PortalToastItem>(TOAST_EVENT, {
      detail: {
        id: `pt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type,
        title,
        message: cleanMessage,
        durationMs,
      },
    })
  );
}

export const GlobalToastViewport: React.FC = () => {
  const [toasts, setToasts] = useState<PortalToastItem[]>([]);

  useEffect(() => {
    const timers = new Map<string, number>();

    const handleToast = (ev: Event) => {
      const detail = (ev as CustomEvent<PortalToastItem>).detail;
      if (!detail || !detail.message) return;

      setToasts((prev) => {
        // Avoid spamming exact duplicate active message
        const filtered = prev.filter(
          (item) => !(item.type === detail.type && item.message === detail.message)
        );
        return [detail, ...filtered].slice(0, 4);
      });

      const timerId = window.setTimeout(() => {
        setToasts((prev) => prev.filter((item) => item.id !== detail.id));
        timers.delete(detail.id);
      }, detail.durationMs);
      timers.set(detail.id, timerId);
    };

    window.addEventListener(TOAST_EVENT, handleToast);
    return () => {
      window.removeEventListener(TOAST_EVENT, handleToast);
      timers.forEach((t) => window.clearTimeout(t));
      timers.clear();
    };
  }, []);

  if (typeof document === 'undefined' || toasts.length === 0) return null;

  const dismiss = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return createPortal(
    <div
      aria-live="polite"
      className="fixed top-4 right-4 left-4 sm:left-auto z-[9999] flex flex-col gap-2.5 sm:w-[400px] pointer-events-none"
    >
      {toasts.map((t) => {
        const styleByType = {
          error: {
            border: 'border-[#E5252A]',
            badgeBg: 'bg-[#E5252A]/15 text-[#FCA5A5]',
            icon: <AlertTriangle className="w-4 h-4 text-[#F87171] shrink-0" />,
          },
          success: {
            border: 'border-emerald-400',
            badgeBg: 'bg-emerald-500/20 text-emerald-300',
            icon: <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />,
          },
          transfer: {
            border: 'border-sky-400',
            badgeBg: 'bg-sky-500/20 text-sky-300',
            icon: <ArrowLeftRight className="w-4 h-4 text-sky-400 shrink-0" />,
          },
          info: {
            border: 'border-[#FFD400]',
            badgeBg: 'bg-[#FFD400]/20 text-[#FFD400]',
            icon: <Info className="w-4 h-4 text-[#FFD400] shrink-0" />,
          },
        }[t.type];

        return (
          <div
            key={t.id}
            role={t.type === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto rv-menu-enter bg-[#080B0D] text-white border border-white/15 border-l-4 ${styleByType.border} rounded-2xl px-4 py-3.5 shadow-[0_20px_50px_-10px_rgba(0,0,0,0.65)] flex items-start gap-3`}
          >
            <div className={`w-8 h-8 rounded-xl ${styleByType.badgeBg} flex items-center justify-center shrink-0 mt-0.5`}>
              {styleByType.icon}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-extrabold uppercase tracking-wider text-white/80">
                {t.title}
              </p>
              <p className="text-xs font-semibold text-white leading-snug mt-0.5 break-words">
                {t.message}
              </p>
            </div>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Fechar aviso"
              className="p-1 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>,
    document.body
  );
};
