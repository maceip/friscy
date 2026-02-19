import React, { useState, useCallback, useEffect, useRef } from 'react';
import { FriscyMachine, MachineConfig } from './lib/FriscyMachine';
import { DesktopLayout } from './components/DesktopLayout';
import { SquigglyProgress } from './components/ProgressOverlay';
import { WaveformVisualizer } from './components/WaveformVisualizer';
import { Plus, Sun, Moon, X } from 'lucide-react';
import { listen } from 'quicklink';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import { BootState, MachineStats } from './types/emulator';

const PRESETS: MachineConfig[] = [
  {
    id: 'claude',
    name: 'Claude Code',
    image: 'claude-code:latest',
    rootfs: '/friscy-bundle/rootfs.tar',
    entrypoint: ['/usr/bin/node', '--jitless', '--max-old-space-size=256', '/usr/local/bin/claude-repl.js'],
    env: [
        'LD_PRELOAD=/usr/lib/vh_preload.so',
        'NODE_OPTIONS=--jitless --max-old-space-size=256 -r /etc/dns-preload.js',
        'ANTHROPIC_API_KEY=PLACEHOLDER'
    ],
    icon: '/friscy-bundle/claude-splat.svg' 
  },
  {
    id: 'alpine',
    name: 'Alpine Linux',
    image: 'alpine:latest',
    rootfs: '/friscy-bundle/rootfs.tar',
    entrypoint: '/bin/sh',
    env: ['LD_PRELOAD=/usr/lib/vh_preload.so'],
    icon: '/friscy-bundle/alpine-icon.svg'
  },
  {
    id: 'go-server',
    name: 'Go Server',
    image: 'friscy-goserver',
    rootfs: '/friscy-bundle/rootfs.tar',
    entrypoint: ['/bin/echo_server'],
    icon: '/friscy-bundle/go-icon.svg'
  },
  {
    id: 'local',
    name: 'Local Terminal',
    image: 'local:host',
    rootfs: '/friscy-bundle/rootfs.tar',
    entrypoint: ['/bin/sh', '-c', 'echo "\x1b[32mLocal Terminal Mode\x1b[0m"; echo "Click the folder icon above to mount a local directory."; /bin/sh'],
    icon: '/friscy-bundle/nodejs-icon.svg'
  }
];

const AppContent: React.FC = () => {
  const [systemMachine, setSystemMachine] = useState<FriscyMachine | null>(null);
  const [bootProgress, setBootProgress] = useState<BootState>({ pct: 0, stage: 'Idle' });
  const [isPaused, setIsPaused] = useState(false);
  const [sharedRootfs, setSharedRootfs] = useState<ArrayBuffer | null>(null);
  const [isLoadingRootfs, setIsLoadingRootfs] = useState(true);
  
  const [activeAnalyser, setActiveAnalyser] = useState<AnalyserNode | null>(null);
  const [voiceActiveId, setVoiceActiveId] = useState<string | null>(null);
  const [stats, setStats] = useState<MachineStats>({ 
    opfs: '0MB', 
    ram: '0MB', 
    net: 'IDLE', 
    instructions: '0',
    localDisk: false,
    containerSync: false,
    context: 85,
    fuel: 62,
    workstream: 'main*',
    activeProvider: 'Claude'
  });

  const { theme } = useTheme();
  const initialized = useRef(false);
  const [steamVisible, setSteamVisible] = useState(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    listen();
    async function loadRootfs() {
        try {
            const resp = await fetch('/friscy-bundle/rootfs.tar');
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const buf = await resp.arrayBuffer();
            setSharedRootfs(buf);
            setIsLoadingRootfs(false);
            setSteamVisible(true);
            
            // Initialize the single shared System Machine
            const config = PRESETS[0]; // Base on Claude config
            const m = new FriscyMachine({ ...config, id: 'system-core' });
            
            m.onProgress = (pct, stage, detail) => {
                setBootProgress({ pct, stage, detail });
            };
            let lastStatsUpdate = 0;
            m.onJitStats = (jitStats) => {
                const now = Date.now();
                if (now - lastStatsUpdate < 100) return;
                lastStatsUpdate = now;
                setStats(prev => ({
                    ...prev,
                    ram: `${Math.round((jitStats.ramUsage || 0) / (1024 * 1024))}MB`,
                    instructions: (jitStats.instructions || 0).toLocaleString(),
                    localDisk: m.localDiskMounted,
                    containerSync: m.syncActive
                }));
            };

            setSystemMachine(m);
        } catch (e) {
            console.error('[App] Failed to load shared rootfs', e);
            setIsLoadingRootfs(false);
        }
    }
    loadRootfs();
  }, []);

  const bootSystem = useCallback(() => {
      if (!systemMachine || !sharedRootfs) return;
      const bufferToUse = sharedRootfs.slice(0);
      systemMachine.boot(bufferToUse);
  }, [systemMachine, sharedRootfs]);

  const togglePause = useCallback(() => {
      if (!systemMachine) return;
      if (isPaused) {
          console.log('[App] Resuming system...');
          // Resume: re-boot machine with the latest snapshotted VFS
          const buffer = systemMachine.snapshotData || sharedRootfs;
          systemMachine.boot(buffer?.slice(0));
          setIsPaused(false);
      } else {
          console.log('[App] Pausing system (requesting snapshot)...');
          systemMachine.snapshot((data) => {
              console.log('[App] Snapshot received, terminating worker (state: paused)');
              systemMachine.snapshotData = data;
              systemMachine.terminate('paused');
              setIsPaused(true);
          });
      }
  }, [systemMachine, isPaused, sharedRootfs]);

  const handleMicChange = useCallback((analyser: AnalyserNode | null, id: string | null) => {
      setActiveAnalyser(analyser);
      setVoiceActiveId(id);
  }, []);

  const mountLocalFolder = async () => {
    if (!systemMachine) return;
    try {
      if (!('showDirectoryPicker' in window)) {
          alert('File System Access API not supported in this browser.');
          return;
      }
      // @ts-ignore
      const handle = await window.showDirectoryPicker();
      systemMachine.localDiskMounted = true;
      systemMachine.mountLocal(handle); // Send handle to worker
      systemMachine.writeStdin(`\n\x1b[32m[host] Mounted local folder: ${handle.name} to /mnt/host\x1b[0m\n`);
      setStats(prev => ({ ...prev, localDisk: true }));
    } catch (e) {
      console.warn('Folder sharing failed', e);
    }
  };

  if (isLoadingRootfs) {
      return (
          <div className="flex flex-col items-center justify-center h-screen bg-[#050810] text-[#64748b] gap-6">
              <div className="text-4xl font-black text-[#59c2ff] italic tracking-tighter">fRISCy</div>
              <div className="w-64">
                <SquigglyProgress progress={-1} color="#59c2ff" />
              </div>
              <div className="text-[10px] font-bold uppercase tracking-[0.3em] opacity-50">Initializing Shared Hypervisor</div>
          </div>
      );
  }

  return (
    <div className={`flex flex-col h-screen overflow-hidden font-mono selection:bg-[#59c2ff]/30 transition-colors duration-500 ${theme === 'light' ? 'light' : ''}`}>
      <div className={`steam-container transition-opacity duration-1000 ${steamVisible ? 'opacity-100' : 'opacity-0'}`}>
        <div className="steam-wisp" style={{ left: '15%', animationDelay: '0s' }} />
        <div className="steam-wisp" style={{ left: '45%', animationDelay: '3s' }} />
        <div className="steam-wisp" style={{ left: '75%', animationDelay: '1s' }} />
      </div>

      {systemMachine && (
        <DesktopLayout 
            systemMachine={systemMachine}
            bootProgress={bootProgress}
            isPaused={isPaused}
            onMountLocal={mountLocalFolder}
            activeAnalyser={activeAnalyser}
            voiceActiveId={voiceActiveId}
            onMicStateChange={handleMicChange}
            onBootSystem={bootSystem}
            onTogglePause={togglePause}
            machineStats={stats}
        />
      )}

      {/* Unified Status Bar */}
      <footer className="h-10 md:h-8 buffed-material border-t border-[var(--border-subtle)] flex items-center justify-between px-4 select-none shrink-0 overflow-hidden relative z-[100] hidden md:flex text-[var(--text-muted)]">
        {/* Left: Branding & Workstream */}
        <div className="flex items-center gap-6 shrink-0">
            <div className="flex items-center gap-3">
                <span className="text-[11px] font-black italic tracking-tighter text-[var(--color-friscy-blue)]">fRISCy</span>
                <span className="text-[8px] opacity-20 tracking-[0.2em] hidden lg:inline">システム稼働中</span>
            </div>
            
            <div className="flex items-center gap-2 px-2 py-0.5 bg-white/5 rounded border border-white/5">
                <span className="text-[8px] opacity-40">GIT:</span>
                <span className="text-[9px] font-bold text-friscy-blue tracking-tighter">{stats.workstream}</span>
            </div>
        </div>

        {/* Center: Neural Resources */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-4">
            <div className="flex flex-col items-center gap-0.5">
                <div className="flex justify-between w-24 text-[7px] font-black uppercase opacity-40 tracking-tighter">
                    <span>Context</span>
                    <span>{stats.context}%</span>
                </div>
                <div className="w-24 h-1 bg-gray-800 rounded-full overflow-hidden flex gap-px">
                    {Array.from({length: 12}).map((_, i) => (
                        <div key={i} className={`flex-1 h-full ${i/12*100 < stats.context ? 'bg-friscy-blue shadow-[0_0_3px_rgba(89,194,255,0.5)]' : 'bg-gray-900'}`} />
                    ))}
                </div>
            </div>

            <div className="h-4 w-[1px] bg-white/10" />

            <div className="flex flex-col items-center gap-0.5">
                <div className="flex justify-between w-24 text-[7px] font-black uppercase opacity-40 tracking-tighter">
                    <span>Fuel</span>
                    <span>{stats.fuel}%</span>
                </div>
                <div className="w-24 h-1 bg-gray-800 rounded-full overflow-hidden flex gap-px">
                    {Array.from({length: 12}).map((_, i) => (
                        <div key={i} className={`flex-1 h-full ${i/12*100 < stats.fuel ? 'bg-amber-500' : 'bg-gray-900'}`} />
                    ))}
                </div>
            </div>
        </div>

        {/* Right: System Health */}
        <div className="flex items-center gap-4 shrink-0">
            <div className="flex items-center gap-0 text-[9px] font-bold uppercase tracking-widest opacity-60">
                <span className="w-16 text-right">{stats.ram}</span>
                <span className="px-2 opacity-30">|</span>
                <span className="w-16 text-right">{stats.net}</span>
                <span className="px-2 opacity-30">|</span>
                <span className="w-24 text-right">{stats.instructions}</span>
            </div>

            <div className="flex items-center gap-3 opacity-80 hover:opacity-100 transition-opacity ml-2">
                <img src="/friscy-bundle/webmcp-icon.svg" className="w-4 h-4 invert" alt="MCP" />
                <img src="/friscy-bundle/riscv-logo.jpg" className="w-4 h-4 rounded-sm invert" alt="RV" />
            </div>
        </div>
      </footer>
    </div>
  );
};

const App: React.FC = () => {
    return (
        <ThemeProvider>
            <AppContent />
        </ThemeProvider>
    );
};

export default App;
