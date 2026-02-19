import React, { useMemo } from 'react';
import { Layers, GitMerge, Zap, ShieldCheck } from 'lucide-react';

interface Brick {
    id: string;
    type: 'remote' | 'local' | 'staged' | 'conflict';
    label: string;
    col: number;
    row: number;
}

export const GitArkanoid: React.FC = () => {
    // Mock data representing a chunky worktree
    const bricks: Brick[] = useMemo(() => [
        // Row 0: Remote Master (Gold)
        { id: 'r1', type: 'remote', label: 'origin/main', col: 0, row: 0 },
        { id: 'r2', type: 'remote', label: 'origin/main', col: 1, row: 0 },
        { id: 'r3', type: 'remote', label: 'origin/main', col: 2, row: 0 },
        { id: 'r4', type: 'remote', label: 'origin/main', col: 3, row: 0 },
        { id: 'r5', type: 'remote', label: 'origin/main', col: 4, row: 0 },
        
        // Row 1: Local synced
        { id: 'l1', type: 'local', label: 'feat/ui', col: 0, row: 1 },
        { id: 'l2', type: 'local', label: 'feat/ui', col: 1, row: 1 },
        
        // Row 2: Staged / Dirty
        { id: 's1', type: 'staged', label: 'AppShelf.tsx', col: 3, row: 2 },
        { id: 's2', type: 'staged', label: 'styles.css', col: 4, row: 2 },
        
        // Conflicts / Divergence
        { id: 'c1', type: 'conflict', label: 'REBASE REQ', col: 2, row: 1 },
    ], []);

    const getTypeStyles = (type: Brick['type']) => {
        switch(type) {
            case 'remote': return 'bg-amber-900/40 border-amber-500/50 text-amber-200/70';
            case 'local': return 'bg-slate-800/60 border-slate-500/40 text-slate-300';
            case 'staged': return 'bg-blue-900/30 border-blue-400/40 text-blue-200/80';
            case 'conflict': return 'bg-red-950/40 border-red-500/60 text-red-200 animate-pulse';
        }
    };

    return (
        <div className="w-full h-full bg-[#050810] flex flex-col overflow-hidden relative border border-white/5">
            {/* Header info */}
            <div className="h-10 bg-black/60 border-b border-white/5 flex items-center px-6 justify-between shrink-0">
                <div className="flex items-center gap-3">
                    <div className="w-1.5 h-1.5 bg-amber-600 rounded-full opacity-50" />
                    <span className="text-[9px] font-bold uppercase tracking-[0.3em] text-gray-500 italic">Sync Matrix</span>
                </div>
                <div className="flex gap-6">
                    <Legend item="Origin" color="bg-amber-700/50" />
                    <Legend item="Local" color="bg-slate-700" />
                    <Legend item="Pending" color="bg-blue-800/50" />
                </div>
            </div>

            {/* The "Game" Board */}
            <div className="flex-1 p-8 overflow-y-auto custom-scrollbar">
                <div className="max-w-3xl mx-auto">
                    
                    {/* Visualizer Container */}
                    <div className="relative grid grid-cols-5 gap-3 perspective-[1000px]">
                        {bricks.map((brick) => (
                            <div 
                                key={brick.id}
                                style={{ 
                                    gridColumnStart: brick.col + 1,
                                    gridRowStart: brick.row + 1,
                                    transform: `translateZ(${brick.row * -5}px)`
                                }}
                                className={`
                                    relative h-12 rounded border flex flex-col items-center justify-center p-2 transition-all hover:bg-white/5 cursor-crosshair group
                                    ${getTypeStyles(brick.type)}
                                `}
                            >
                                <span className="text-[7px] font-bold uppercase tracking-widest truncate w-full text-center">
                                    {brick.label}
                                </span>
                                
                                {/* Technical data tag */}
                                <div className="absolute top-0 right-1 text-[5px] opacity-20 font-mono">
                                    {brick.id.toUpperCase()}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Bottom Action Bar */}
                    <div className="flex justify-center mt-12 pt-8 border-t border-white/5">
                        <div className="w-full max-w-md h-12 bg-black/40 border border-white/10 rounded flex items-center px-6 justify-between">
                            <div className="flex items-center gap-3">
                                <GitMerge className="w-4 h-4 text-slate-500" />
                                <div className="flex flex-col">
                                    <span className="text-[8px] font-black uppercase tracking-widest text-gray-400">Head Status</span>
                                    <span className="text-[7px] font-bold text-red-500/70 tracking-tighter uppercase">Diverged / Remote Ahead</span>
                                </div>
                            </div>
                            <button className="h-7 px-4 border border-blue-500/30 text-blue-400 font-bold text-[8px] uppercase tracking-widest rounded hover:bg-blue-500/10 transition-all">
                                Rebase Origin
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Aesthetic Side Overlays */}
            <div className="absolute top-1/2 right-4 -translate-y-1/2 flex flex-col gap-2 opacity-20">
                <div className="w-1 h-12 bg-friscy-blue rounded-full" />
                <div className="w-1 h-4 bg-gray-600 rounded-full" />
                <div className="w-1 h-20 bg-friscy-blue rounded-full" />
            </div>
        </div>
    );
};

const Legend = ({ item, color }: { item: string, color: string }) => (
    <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-sm ${color}`} />
        <span className="text-[8px] font-bold uppercase tracking-tighter text-gray-500">{item}</span>
    </div>
);
