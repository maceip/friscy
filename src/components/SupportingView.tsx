import React, { useState, useEffect, useRef } from 'react';
import { FuturisticNotepad } from './FuturisticNotepad';
import { GitArkanoid } from './GitArkanoid';

interface SupportingViewProps {
    activeApp: string | null;
}

export const SupportingView: React.FC<SupportingViewProps> = ({ activeApp }) => {
    const [displayApp, setDisplayApp] = useState<string | null>(activeApp);
    const [isTransitioning, setIsTransitioning] = useState(false);
    const [rotation, setRotation] = useState(0);
    const [isCopyHubActive, setIsCopyHubActive] = useState(false);
    const prevAppRef = useRef<string | null>(activeApp);
    const containerRef = useRef<HTMLDivElement>(null);

    // Handle Copy-Paste Hub activation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
                setIsCopyHubActive(true);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const handleMouseLeave = () => {
        if (isCopyHubActive) {
            setIsCopyHubActive(false);
        }
    };

    // Handle App transitions with "Hidden Door" rotation and "Jedi Doors"
    useEffect(() => {
        if (activeApp !== prevAppRef.current) {
            setIsTransitioning(true);
            
            // Start rotation
            setRotation(prev => prev + 180);

            // Halfway through rotation, swap the app
            setTimeout(() => {
                setDisplayApp(activeApp);
                prevAppRef.current = activeApp;
            }, 400);

            // End transition
            setTimeout(() => {
                setIsTransitioning(false);
            }, 800);
        }
    }, [activeApp]);

    const renderCurrentApp = (appId: string | null) => {
        if (isCopyHubActive) {
            return (
                <div className="w-full h-full flex flex-col items-center justify-center bg-purple-950/20 border border-purple-500/30 rounded-lg p-8">
                    <div className="text-xl font-black text-purple-400 italic tracking-tighter mb-4">NEURAL CLIPBOARD</div>
                    <div className="grid grid-cols-2 gap-4 w-full max-w-md">
                        {[1, 2, 3, 4].map(i => (
                            <div key={i} className="h-20 bg-black/40 border border-white/5 rounded flex items-center justify-center text-[10px] text-gray-500 uppercase tracking-widest hover:border-purple-500/50 cursor-pointer transition-all">
                                Slot {i}: Empty
                            </div>
                        ))}
                    </div>
                    <div className="mt-6 text-[8px] text-purple-400/50 uppercase tracking-[0.3em] animate-pulse">Monitoring Global Ingest...</div>
                </div>
            );
        }

        switch (appId) {
            case 'notepad': return <FuturisticNotepad />;
            case 'github': return <GitArkanoid />;
            case 'env': return (
                <div className="w-full h-full flex flex-col items-center justify-center p-12 bg-[#050810]">
                    <div className="text-[10px] font-black text-friscy-blue uppercase tracking-[0.4em] mb-12 opacity-50">Environment Matrix</div>
                    <div className="flex gap-8 relative">
                        {['PROD', 'STAGING', 'DEV', 'LOCAL'].map((env, i) => (
                            <div key={env} className="group relative cursor-pointer">
                                <div className={`w-12 h-16 rounded-lg border-2 transition-all duration-500 transform group-hover:-translate-y-4 group-hover:scale-110 shadow-[0_0_15px_rgba(89,194,255,0.1)] group-hover:shadow-[0_0_25px_rgba(89,194,255,0.4)]
                                    ${i === 2 ? 'bg-blue-600/40 border-blue-400 shadow-[0_0_20px_rgba(59,130,246,0.5)]' : 'bg-gray-900/40 border-gray-700'}`} 
                                />
                                <div className="absolute top-full mt-4 left-1/2 -translate-x-1/2 text-[8px] font-bold text-gray-500 uppercase tracking-widest whitespace-nowrap group-hover:text-white transition-colors">
                                    {env}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            );
            default: return (
                <div className="w-full h-full flex items-center justify-center bg-black/20 italic text-gray-600 text-[10px] tracking-[0.2em] uppercase">
                    Select a neural module from the rail below
                </div>
            );
        }
    };

    return (
        <div 
            ref={containerRef}
            className="w-full h-full relative overflow-hidden perspective-[2000px]"
            onMouseLeave={handleMouseLeave}
        >
            {/* Hidden Door Rotation Wrapper */}
            <div 
                className="w-full h-full transition-transform duration-700 preserve-3d"
                style={{ 
                    transform: `rotateY(${rotation}deg)`,
                    transformStyle: 'preserve-3d'
                }}
            >
                {/* Front Face */}
                <div className="absolute inset-0 backface-hidden">
                    {renderCurrentApp(displayApp)}
                </div>
                
                {/* Back Face (Visible during 180 deg rotation) */}
                <div className="absolute inset-0 backface-hidden" style={{ transform: 'rotateY(180deg)' }}>
                    {renderCurrentApp(displayApp)}
                </div>
            </div>

            {/* Jedi Doors (Sliding from middle) */}
            <div className={`absolute inset-0 pointer-events-none z-[100] flex ${isTransitioning ? 'opacity-100' : 'opacity-0'} transition-opacity duration-300`}>
                {/* Left Door */}
                <div 
                    className="flex-1 bg-[#050810] border-r border-green-500/20 relative overflow-hidden transition-transform duration-500 ease-in-out"
                    style={{ 
                        transform: isTransitioning ? 'translateX(0)' : 'translateX(-100%)',
                        background: 'linear-gradient(90deg, #050810 0%, #0a1510 100%)'
                    }}
                >
                    {/* Green Wire Mesh Overlay */}
                    <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] mix-blend-screen" />
                    <div className="absolute inset-0 bg-green-500/5 backdrop-blur-[2px]" />
                </div>

                {/* Right Door */}
                <div 
                    className="flex-1 bg-[#050810] border-l border-green-500/20 relative overflow-hidden transition-transform duration-500 ease-in-out"
                    style={{ 
                        transform: isTransitioning ? 'translateX(0)' : 'translateX(100%)',
                        background: 'linear-gradient(-90deg, #050810 0%, #0a1510 100%)'
                    }}
                >
                    <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] mix-blend-screen" />
                    <div className="absolute inset-0 bg-green-500/5 backdrop-blur-[2px]" />
                </div>
            </div>

            {/* Industrial Smoke/Fog Effect Overlay */}
            <div className="absolute inset-0 pointer-events-none mix-blend-overlay opacity-20 bg-gradient-to-b from-transparent via-black to-transparent" />
        </div>
    );
};
