import React, { useEffect, useRef, useCallback } from 'react';

// --- Standalone Squiggly Component ---
interface SquigglyProgressProps {
    progress: number; // 0-100, or -1 for indeterminate
    color?: string;
    width?: number | string;
    height?: number | string;
}

const SQ_WAVE_LENGTH = 32;
const SQ_LINE_AMP = 3;
const SQ_PHASE_SPEED = 8;
const SQ_STROKE_W = 6;
const SQ_TRANSITION_PERIODS = 1.5;
const SQ_DISABLED_ALPHA = 0.25;

export const SquigglyProgress: React.FC<SquigglyProgressProps> = ({ 
    progress, 
    color = '#2ea043', 
    width = '100%', 
    height = 24 
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const requestRef = useRef<number | null>(null);
    const phaseRef = useRef(0);
    const lastTimeRef = useRef<number | null>(null);
    const progressRef = useRef(progress);

    useEffect(() => { progressRef.current = progress; }, [progress]);

    const lerpInvSat = (a: number, b: number, v: number) => Math.max(0, Math.min(1, (v - a) / (b - a)));

    const buildWavePath = useCallback((waveStart: number, waveEnd: number, waveProgressPx: number, transitionEnabled: boolean) => {
        const path = new Path2D();
        path.moveTo(waveStart, 0);
        let currentX = waveStart;
        let waveSign = 1;
        const dist = SQ_WAVE_LENGTH / 2;

        const computeAmp = (x: number, sign: number) => {
            if (transitionEnabled) {
                const length = SQ_TRANSITION_PERIODS * SQ_WAVE_LENGTH;
                const coeff = lerpInvSat(waveProgressPx + length / 2, waveProgressPx - length / 2, x);
                return sign * SQ_LINE_AMP * coeff;
            }
            return sign * SQ_LINE_AMP;
        };

        let currentAmp = computeAmp(currentX, waveSign);
        while (currentX < waveEnd) {
            waveSign = -waveSign;
            const nextX = currentX + dist;
            const midX = currentX + dist / 2;
            const nextAmp = computeAmp(nextX, waveSign);
            path.bezierCurveTo(midX, currentAmp, midX, nextAmp, nextX, nextAmp);
            currentAmp = nextAmp;
            currentX = nextX;
        }
        return path;
    }, []);

    useEffect(() => {
        const animate = (time: number) => {
            if (!canvasRef.current) return;
            const canvas = canvasRef.current;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            if (lastTimeRef.current === null) lastTimeRef.current = time;
            const dt = (time - lastTimeRef.current) / 1000;
            lastTimeRef.current = time;
            phaseRef.current = (phaseRef.current + dt * SQ_PHASE_SPEED) % SQ_WAVE_LENGTH;

            const dpr = window.devicePixelRatio || 1;
            const W = canvas.clientWidth;
            const H = canvas.clientHeight;
            
            if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
                canvas.width = Math.round(W * dpr);
                canvas.height = Math.round(H * dpr);
                ctx.scale(dpr, dpr);
            }

            ctx.clearRect(0, 0, W, H);
            ctx.save();
            ctx.translate(0, H / 2);

            const currentProgressValue = progressRef.current;
            const isIndeterminate = currentProgressValue < 0;
            const currentProgress = isIndeterminate ? 1 : currentProgressValue / 100;
            const totalProgressPx = W * currentProgress;
            const waveStart = -phaseRef.current - SQ_WAVE_LENGTH / 2;
            const path = buildWavePath(waveStart, isIndeterminate ? W : totalProgressPx + SQ_WAVE_LENGTH, totalProgressPx, isIndeterminate);

            if (totalProgressPx < W && !isIndeterminate) {
                ctx.save();
                ctx.strokeStyle = color;
                ctx.globalAlpha = SQ_DISABLED_ALPHA;
                ctx.lineWidth = SQ_STROKE_W;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(totalProgressPx, 0);
                ctx.lineTo(W, 0);
                ctx.stroke();
                ctx.restore();
            }

            ctx.save();
            ctx.beginPath();
            ctx.rect(0, -(SQ_LINE_AMP + SQ_STROKE_W), totalProgressPx, (SQ_LINE_AMP + SQ_STROKE_W) * 2);
            ctx.clip();
            ctx.strokeStyle = color;
            ctx.lineWidth = SQ_STROKE_W;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.stroke(path);
            ctx.restore();

            ctx.restore();
            requestRef.current = requestAnimationFrame(animate);
        };

        requestRef.current = requestAnimationFrame(animate);
        return () => { if (requestRef.current) cancelAnimationFrame(requestRef.current); };
    }, [buildWavePath, color]);

    return <canvas ref={canvasRef} style={{ width, height }} />;
};

// --- Squiggly Spinner Component (Android Compose Expressive Style) ---
interface SquigglySpinnerProps {
    color?: string;
    size?: number;
}

export const SquigglySpinner: React.FC<SquigglySpinnerProps> = ({ 
    color = 'currentColor', 
    size = 14 
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const requestRef = useRef<number | null>(null);
    const phaseRef = useRef(0);
    const rotationRef = useRef(0);
    const lastTimeRef = useRef<number | null>(null);

    useEffect(() => {
        const animate = (time: number) => {
            if (!canvasRef.current) return;
            const canvas = canvasRef.current;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            if (lastTimeRef.current === null) lastTimeRef.current = time;
            const dt = (time - lastTimeRef.current) / 1000;
            lastTimeRef.current = time;

            // Update phase and rotation for "expressive" motion
            phaseRef.current = (phaseRef.current + dt * 12);
            rotationRef.current = (rotationRef.current + dt * 3);

            const dpr = window.devicePixelRatio || 1;
            if (canvas.width !== Math.round(size * dpr)) {
                canvas.width = Math.round(size * dpr);
                canvas.height = Math.round(size * dpr);
                ctx.scale(dpr, dpr);
            }

            ctx.clearRect(0, 0, size, size);
            ctx.save();
            ctx.translate(size / 2, size / 2);
            ctx.rotate(rotationRef.current);

            const baseRadius = size * 0.35;
            const amp = size * 0.08;
            const freq = 6; // Number of squiggles

            ctx.beginPath();
            ctx.strokeStyle = color;
            ctx.lineWidth = SQ_STROKE_W / 2; // Half stroke as requested
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            for (let i = 0; i <= 360; i += 5) {
                const angle = (i * Math.PI) / 180;
                // Add squiggle to radius
                const r = baseRadius + Math.sin(angle * freq + phaseRef.current) * amp;
                const x = r * Math.cos(angle);
                const y = r * Math.sin(angle);
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }

            ctx.closePath();
            ctx.stroke();
            ctx.restore();

            requestRef.current = requestAnimationFrame(animate);
        };

        requestRef.current = requestAnimationFrame(animate);
        return () => { if (requestRef.current) cancelAnimationFrame(requestRef.current); };
    }, [color, size]);

    return <canvas ref={canvasRef} style={{ width: size, height: size }} />;
};

// --- Full Overlay Component ---
interface ProgressOverlayProps {
  progress: number;
  stage: string;
  detail?: string;
  active: boolean;
}

export const ProgressOverlay: React.FC<ProgressOverlayProps> = ({ progress, stage, detail, active }) => {
  if (!active) return null;

  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[var(--bg-app)] animate-in fade-in duration-500">
      <div className="mb-6 text-3xl font-bold tracking-tighter text-friscy-blue italic">fRISCy</div>
      <div className="mb-4 text-sm font-bold uppercase tracking-[0.2em] text-[var(--text-muted)]">{stage}</div>
      <div className="w-64">
        <SquigglyProgress progress={progress} color="#59c2ff" />
      </div>
      {detail && <div className="mt-4 text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]/50">{detail}</div>}
    </div>
  );
};
