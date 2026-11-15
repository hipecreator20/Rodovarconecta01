import React, { useEffect, useRef } from 'react';

interface ConfettiPiece {
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  color: string;
  rotation: number;
  vr: number;
  swayAmp: number;
  swayFreq: number;
  phase: number;
  shape: 'rect' | 'circle' | 'ribbon';
}

const CONFETTI_COLORS = [
  '#FFD400', // Rodovar Gold
  '#F59E0B', // Amber
  '#10B981', // Emerald
  '#3B82F6', // Royal Blue
  '#EF4444', // Coral Red
  '#EC4899', // Magenta
  '#8B5CF6', // Violet
  '#FFFFFF', // Crisp White
];

interface ConfettiRainOverlayProps {
  burstKey: number;
}

export const ConfettiRainOverlay: React.FC<ConfettiRainOverlayProps> = ({ burstKey }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!burstKey || typeof window === 'undefined') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const width = window.innerWidth;
    const height = window.innerHeight;
    const count = width < 640 ? 95 : 150;
    const pieces: ConfettiPiece[] = Array.from({ length: count }, (_, idx) => {
      const shapes: ConfettiPiece['shape'][] = ['rect', 'rect', 'ribbon', 'circle'];
      return {
        x: Math.random() * width,
        y: -20 - Math.random() * Math.min(340, height * 0.45),
        w: 6 + Math.random() * 6,
        h: 8 + Math.random() * 8,
        vx: (Math.random() - 0.5) * 2.4,
        vy: 2.8 + Math.random() * 4.2,
        color: CONFETTI_COLORS[idx % CONFETTI_COLORS.length],
        rotation: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 0.16,
        swayAmp: 0.6 + Math.random() * 1.4,
        swayFreq: 0.03 + Math.random() * 0.04,
        phase: Math.random() * Math.PI * 2,
        shape: shapes[idx % shapes.length],
      };
    });

    const startTime = performance.now();
    const durationMs = 3000;
    let tick = 0;

    const render = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / durationMs);
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

      const globalAlpha = progress > 0.72 ? Math.max(0, 1 - (progress - 0.72) / 0.28) : 1;
      tick += 1;

      let anyVisible = false;
      for (const p of pieces) {
        p.x += p.vx + Math.sin(tick * p.swayFreq + p.phase) * p.swayAmp;
        p.y += p.vy;
        p.vy = Math.min(p.vy + 0.045, 7.2);
        p.rotation += p.vr;

        if (p.y < window.innerHeight + 30) {
          anyVisible = true;
        } else {
          continue;
        }

        ctx.save();
        ctx.globalAlpha = globalAlpha;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        const tiltScale = Math.cos(tick * 0.08 + p.phase);
        ctx.scale(1, Math.abs(tiltScale) < 0.2 ? 0.2 : tiltScale);
        ctx.fillStyle = p.color;

        if (p.shape === 'circle') {
          ctx.beginPath();
          ctx.arc(0, 0, p.w * 0.48, 0, Math.PI * 2);
          ctx.fill();
        } else if (p.shape === 'ribbon') {
          ctx.fillRect(-p.w * 0.35, -p.h * 0.85, p.w * 0.7, p.h * 1.7);
        } else {
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        }
        ctx.restore();
      }

      if (elapsed < durationMs && anyVisible) {
        rafRef.current = requestAnimationFrame(render);
      } else {
        ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
        rafRef.current = null;
      }
    };

    rafRef.current = requestAnimationFrame(render);

    return () => {
      window.removeEventListener('resize', resize);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [burstKey]);

  if (!burstKey) return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none z-9999"
    />
  );
};
