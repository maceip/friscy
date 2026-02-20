import React, { useState } from 'react';
import { Power, ShieldAlert, Cpu, Activity, Info, Zap, Plus, Terminal, Hexagon } from 'lucide-react';
import { FriscyMachine } from '../lib/FriscyMachine';

interface IntroOverlayProps {
    machine: FriscyMachine;
    onBoot: () => void;
    type: 'welcome' | 'stats' | 'simple';
}

export const IntroOverlay: React.FC<IntroOverlayProps> = ({ machine, onBoot, type }) => {
    const [envs, setEnvs] = useState<string[]>([]);
    const [newEnv, setNewEnv] = useState('');
    const [isInputActive, setIsInputActive] = useState(false);
    const [isBootAnimation, setIsBootAnimation] = useState(false);

    const handleBoot = () => {
        setIsBootAnimation(true);
        // Delay the actual boot callback until the doors are almost open
        setTimeout(onBoot, 600);
    };

    const addEnv = () => {
        if (newEnv.includes('=') && !envs.includes(newEnv)) {
            setEnvs([...envs, newEnv]);
            if (machine.config.env) machine.config.env.push(newEnv);
            else machine.config.env = [newEnv];
            setNewEnv('');
            setIsInputActive(false);
        }
    };

    return (
        <div data-testid="intro-overlay" className="absolute inset-0 z-40 flex overflow-hidden pointer-events-none">
            {/* Left Door */}
            <div className={`absolute inset-y-0 left-0 w-1/2 bg-[#050810] border-r border-friscy-blue/20 transition-transform duration-700 ease-in-out pointer-events-auto z-50 ${isBootAnimation ? '-translate-x-full' : 'translate-x-0'}`}>
                <div className="absolute inset-0 opacity-[0.03] pointer-events-none" 
                     style={{ 
                        backgroundImage: `linear-gradient(var(--color-friscy-blue) 1px, transparent 1px), linear-gradient(90deg, var(--color-friscy-blue) 1px, transparent 1px)`,
                        backgroundSize: '30px 30px',
                        transform: 'perspective(1000px) rotateX(45deg) scale(2)',
                     }} 
                />
                {/* Content clipped to left side */}
                <div className="absolute top-0 left-0 w-[200%] h-full flex flex-col items-center justify-center p-8">
                    {type === 'welcome' && <WelcomeContent machine={machine} onBoot={handleBoot} />}
                    {type === 'stats' && <StatsContent machine={machine} onBoot={handleBoot} envs={envs} setIsInputActive={setIsInputActive} />}
                    {type === 'simple' && <SimpleContent machine={machine} onBoot={handleBoot} />}
                </div>
            </div>

            {/* Right Door */}
            <div className={`absolute inset-y-0 right-0 w-1/2 bg-[#050810] border-l border-friscy-blue/20 transition-transform duration-700 ease-in-out pointer-events-auto z-50 ${isBootAnimation ? 'translate-x-full' : 'translate-x-0'}`}>
                <div className="absolute inset-0 opacity-[0.03] pointer-events-none" 
                     style={{ 
                        backgroundImage: `linear-gradient(var(--color-friscy-blue) 1px, transparent 1px), linear-gradient(90deg, var(--color-friscy-blue) 1px, transparent 1px)`,
                        backgroundSize: '30px 30px',
                        transform: 'perspective(1000px) rotateX(45deg) scale(2)',
                     }} 
                />
                {/* Content clipped to right side */}
                <div className="absolute top-0 right-0 w-[200%] h-full flex flex-col items-center justify-center p-8">
                    {type === 'welcome' && <WelcomeContent machine={machine} onBoot={handleBoot} />}
                    {type === 'stats' && <StatsContent machine={machine} onBoot={handleBoot} envs={envs} setIsInputActive={setIsInputActive} />}
                    {type === 'simple' && <SimpleContent machine={machine} onBoot={handleBoot} />}
                </div>
            </div>

            {/* Input Overlay (Global) */}
            {isInputActive && (
                <div className="absolute inset-0 bg-[#050810]/90 z-[100] flex items-center justify-center p-4 pointer-events-auto">
                    <div className="w-full max-w-xs space-y-4 animate-in slide-in-from-bottom-2">
                        <div className="space-y-1">
                            <label className="text-[10px] font-black uppercase tracking-[0.3em] text-friscy-blue">Add Parameter</label>
                            <input 
                                autoFocus
                                value={newEnv}
                                onChange={(e) => setNewEnv(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && addEnv()}
                                placeholder="KEY=VALUE"
                                className="w-full bg-black border border-friscy-blue/30 rounded px-3 py-2 text-xs font-mono text-gray-200 outline-none focus:border-friscy-blue"
                            />
                        </div>
                        <div className="flex gap-2">
                            <button onClick={addEnv} className="flex-1 h-10 bg-friscy-blue text-[#050810] font-black text-[10px] uppercase tracking-widest rounded">Socket In</button>
                            <button onClick={() => setIsInputActive(false)} className="px-4 h-10 border border-white/10 text-white/40 font-black text-[10px] uppercase tracking-widest rounded">Cancel</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// --- Sub-components for cleaner door content ---

const WelcomeContent = ({ machine, onBoot }: any) => (
    <div className="max-w-md w-full space-y-6 relative z-10">
        <div className="space-y-2">
            <div className="flex items-center gap-2 text-friscy-blue">
                <Info className="w-4 h-4" />
                <h2 className="text-xs font-black uppercase tracking-[0.3em]">System Initialization</h2>
            </div>
            <h1 className="text-2xl font-black italic tracking-tighter text-gray-100">Welcome to fRISCy</h1>
            <p className="text-[11px] text-gray-400 leading-relaxed font-medium">
                You are about to launch a high-performance RISC-V 64-bit emulator directly in your browser. 
            </p>
        </div>
        <div className="pt-4">
            <button 
                title="Boot System"
                onClick={onBoot} 
                className="group relative w-full h-12 bg-friscy-blue text-[#050810] font-black uppercase tracking-[0.2em] text-xs rounded overflow-hidden"
            >
                <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-500 skew-x-[-20deg]" />
                <div className="flex items-center justify-center gap-3">
                    <Power className="w-4 h-4" />
                    <span>Initialize {machine.config.name}</span>
                </div>
            </button>
        </div>
    </div>
);

const StatsContent = ({ machine, onBoot, envs, setIsInputActive }: any) => (
    <div className="w-full flex flex-col items-center justify-center space-y-16">
        <div className="relative">
            {/* Minimal Power Node */}
            <button 
                title="Boot System"
                onClick={onBoot}
                className="relative w-20 h-20 group transition-all"
            >
                <div className="absolute inset-0 border border-friscy-blue/20 rounded-full flex items-center justify-center group-hover:border-friscy-blue/50 transition-colors">
                    <div className="w-12 h-12 border border-friscy-blue/10 rounded-full flex items-center justify-center">
                        <Power className="w-6 h-6 text-friscy-blue/60 group-hover:text-friscy-blue transition-colors" />
                    </div>
                </div>
                {/* Thin technical axis lines */}
                <div className="absolute -top-16 left-1/2 -translate-x-1/2 w-[1px] h-16 bg-white/5" />
                <div className="absolute -bottom-16 left-1/2 -translate-x-1/2 w-[1px] h-16 bg-white/5" />
                <div className="absolute -left-16 top-1/2 -translate-y-1/2 h-[1px] w-16 bg-white/5" />
                <div className="absolute -right-16 top-1/2 -translate-y-1/2 h-[1px] w-16 bg-white/5" />
            </button>

            {/* Precision Parameter Sockets */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 pointer-events-none">
                {[0, 1, 2, 3].map((i) => {
                    const angle = (i * Math.PI) / 2 + Math.PI / 4;
                    const x = Math.cos(angle) * 105;
                    const y = Math.sin(angle) * 105;
                    const hasEnv = envs[i];
                    return (
                        <div key={i} style={{ transform: `translate(${x}px, ${y}px)` }} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-auto">
                            <div className={`w-8 h-8 rounded border flex items-center justify-center transition-all ${hasEnv ? 'bg-friscy-blue/5 border-friscy-blue/40 shadow-[inset_0_0_10px_rgba(89,194,255,0.1)]' : 'bg-black/20 border-white/5 hover:border-white/10'}`}>
                                {hasEnv ? (
                                    <div className="w-1.5 h-1.5 bg-friscy-blue rounded-full shadow-[0_0_5px_#59c2ff]" />
                                ) : (
                                    <button onClick={() => setIsInputActive(true)} className="w-full h-full flex items-center justify-center text-white/10 hover:text-friscy-blue/40 transition-colors">
                                        <Plus className="w-3 h-3" />
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
        
        <div className="flex gap-12 opacity-40">
            <StatItem icon={<Cpu className="w-3 h-3" />} label="Process" value="RV64GC" />
            <StatItem icon={<Zap className="w-3 h-3" />} label="Tier" value="JIT-W" />
        </div>
    </div>
);

const SimpleContent = ({ machine, onBoot }: any) => (
    <button 
        title="Boot System"
        onClick={onBoot} 
        className="group relative flex flex-col items-center gap-4 transition-all hover:scale-110"
    >
        <div className="w-16 h-16 rounded-full border-2 border-friscy-blue/20 flex items-center justify-center group-hover:border-friscy-blue transition-colors overflow-hidden">
            <Power className="w-6 h-6 text-friscy-blue/40 group-hover:text-friscy-blue transition-colors" />
        </div>
        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-500 group-hover:text-friscy-blue transition-colors">Boot {machine.config.name}</span>
    </button>
);

const StatItem: React.FC<{ icon: React.ReactNode, label: string, value: string }> = ({ icon, label, value }) => (
    <div className="flex flex-col items-center space-y-1">
        <div className="flex items-center gap-1.5 text-[8px] text-white/20 uppercase font-bold tracking-tighter">
            {icon}
            <span>{label}</span>
        </div>
        <div className="text-[10px] font-black text-gray-400 tracking-wider uppercase">
            {value}
        </div>
    </div>
);

