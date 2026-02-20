import React, { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { 
  X, Minus, Square, Copy, Share2, 
  RotateCcw, ExternalLink, GripHorizontal, ArrowDownLeft,
  Pause, Play
} from 'lucide-react';

interface WindowFrameProps {
  id: string;
  title: string;
  icon?: string;
  children: React.ReactNode;
  onClose: () => void;
  onMinimize: () => void;
  onMaximize: () => void;
  onRestore: () => void;
  onShare: () => void;
  onPopout: () => void;
  onTogglePause?: () => void;
  isMaximized: boolean;
  isMinimized: boolean;
  isPoppedOut?: boolean;
  isPaused?: boolean;
  machineStats?: any;
}

export const WindowFrame: React.FC<WindowFrameProps> = ({
  id, title, icon, children,
  onClose, onMinimize, onMaximize, onRestore, onShare, onPopout, onTogglePause,
  isMaximized, isMinimized, isPoppedOut = false, isPaused = false, machineStats
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    zIndex: isDragging ? 100 : (isMaximized ? 50 : 1),
    // If maximized, we take over the screen. Otherwise, we rely on grid layout.
    position: (isMaximized || isPoppedOut) ? 'fixed' as const : 'relative' as const,
    inset: (isMaximized || isPoppedOut) ? 0 : 'auto',
    width: (isMaximized || isPoppedOut) ? '100%' : 'auto',
    height: (isMaximized || isPoppedOut) ? '100%' : '100%',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-testid={`window-${id}`}
      className={`
        flex flex-col bg-[#050810] border border-[#1e293b] rounded-lg overflow-hidden shadow-2xl transition-all duration-300 relative group
        ${isDragging ? 'opacity-80 scale-[1.02] ring-2 ring-friscy-blue z-[150]' : ''}
        ${isMinimized ? 'h-[40px]' : 'h-full'}
        ${(isMaximized || isPoppedOut) ? '!rounded-none !border-0 z-[50]' : ''}
      `}
    >
      {/* Window Header */}
      <div 
        className={`h-9 bg-[#0d1117] flex items-center justify-between px-2 border-b border-[#1e293b] select-none shrink-0 z-20 ${(!isMaximized && !isPoppedOut) ? 'cursor-grab active:cursor-grabbing' : ''}`}
        onDoubleClick={(e) => { e.stopPropagation(); isMaximized ? onRestore() : onMaximize(); }}
      >
        {/* Left Controls: Pause/Play, Restore, Popout */}
        <div className="flex items-center gap-1.5 relative z-30" key={isPaused ? 'paused' : 'running'}>
          {isPaused ? (
            <button 
              data-testid="pause-button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); onTogglePause?.(); }}
              className="p-1 rounded bg-friscy-blue/20 text-friscy-blue animate-pulse transition-colors"
              title="Resume Session"
            >
              <Play className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button 
              data-testid="pause-button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); onTogglePause?.(); }}
              className="p-1 hover:bg-white/5 rounded text-gray-500 hover:text-friscy-blue transition-colors"
              title="Pause & Snapshot"
            >
              <Pause className="w-3.5 h-3.5" />
            </button>
          )}
          <button 
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onRestore(); }}
            className="p-1 hover:bg-white/5 rounded text-gray-500 hover:text-friscy-blue transition-colors"
            title="Restore Window"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button 
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onPopout(); }}
            className="p-1 hover:bg-white/5 rounded text-gray-500 hover:text-purple-400 transition-colors"
            title={isPoppedOut ? "Pop In" : "Pop Out"}
          >
            {isPoppedOut ? <ArrowDownLeft className="w-3.5 h-3.5" /> : <ExternalLink className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Center Drag Handle (Title area) */}
        <div 
          {...(!isMaximized ? { ...attributes, ...listeners } : {})}
          className="flex-1 flex justify-center min-w-0 mx-2 h-full items-center"
        >
          <div className="flex items-center gap-2 px-3 py-0.5 rounded hover:bg-white/[0.02] transition-colors max-w-full">
            {icon && (
              <img 
                src={icon} 
                className={`w-3.5 h-3.5 shrink-0 ${id.includes('claude') ? '' : 'invert opacity-80'}`} 
                alt="" 
              />
            )}
            <span className="text-[10px] font-bold text-gray-400 group-hover:text-gray-200 truncate tracking-wider uppercase">
                {title}
            </span>
            {!isMaximized && <GripHorizontal className="w-3.5 h-3.5 text-gray-600 group-hover:text-gray-500 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />}
          </div>
        </div>

        {/* Right Controls: Min, Max, Close */}
        <div className="flex items-center gap-1.5 relative z-30">
          <button 
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onMinimize(); }}
            className="p-1 hover:bg-yellow-500/10 rounded text-gray-500 hover:text-yellow-500 transition-colors"
            title="Minimize"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button 
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); isMaximized ? onRestore() : onMaximize(); }}
            className="p-1 hover:bg-blue-500/10 rounded text-gray-500 hover:text-blue-400 transition-colors"
            title={isMaximized ? "Restore Down" : "Maximize"}
          >
            {isMaximized ? <Copy className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
          </button>
          <button 
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            className="p-1 hover:bg-red-500/10 rounded text-gray-500 hover:text-red-500 transition-colors"
            title="Close"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Window Content */}
      <div className={`flex-1 relative bg-[#0a0e14] overflow-hidden ${isMinimized ? 'hidden' : 'block'}`}>
        {children}
        
        {/* Vitality Rail (Context/Fuel Telemetry) */}
        {machineStats && id !== 'hub' && (
          <div className="absolute bottom-0 left-0 right-0 h-1 flex gap-px px-4 mb-1 z-30 opacity-60">
            {Array.from({length: 40}).map((_, i) => {
                const pct = i / 40 * 100;
                let color = 'bg-gray-900';
                if (pct < machineStats.context) color = 'bg-friscy-blue shadow-[0_0_2px_#59c2ff]';
                return <div key={i} className={`flex-1 h-full rounded-full transition-colors duration-500 ${color}`} />;
            })}
          </div>
        )}

        {/* Frozen / Paused Overlay */}
        {isPaused && (
          <div className="absolute inset-0 z-50 bg-black/40 backdrop-blur-[1px] pointer-events-none flex items-center justify-center">
            {/* Mirror Sheen Effect */}
            <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/5 to-white/0 opacity-30" />
            <div className="border border-friscy-blue/20 bg-[#050810]/80 px-4 py-2 rounded text-[10px] font-black uppercase tracking-[0.3em] text-friscy-blue shadow-2xl animate-pulse">
              Snapshot Active
            </div>
          </div>
        )}
        
        {/* Aesthetic "Drag Lines" on 4 sides (middle) */}
        <div className="absolute top-1/2 left-0 w-[2px] h-6 -mt-3 bg-[#1e293b] rounded-r pointer-events-none opacity-50" />
        <div className="absolute top-1/2 right-0 w-[2px] h-6 -mt-3 bg-[#1e293b] rounded-l pointer-events-none opacity-50" />
        <div className="absolute top-0 left-1/2 w-6 h-[2px] -ml-3 bg-[#1e293b] rounded-b pointer-events-none opacity-50" />
        <div className="absolute bottom-0 left-1/2 w-6 h-[2px] -ml-3 bg-[#1e293b] rounded-t pointer-events-none opacity-50" />
      </div>
    </div>
  );
};
