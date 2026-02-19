import React, { useState, useEffect } from 'react';
import {
  DndContext, 
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  defaultDropAnimationSideEffects,
  DragStartEvent,
  DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { WindowFrame } from './WindowFrame';
import { TerminalView } from './TerminalView';
import { ProgressOverlay } from './ProgressOverlay';
import { IntroOverlay } from './IntroOverlay';
import { AppShelf3D } from './AppShelf3D';
import { FuturisticNotepad } from './FuturisticNotepad';
import { GitArkanoid } from './GitArkanoid';
import { FriscyMachine } from '../lib/FriscyMachine';
import { BootState, MachineStats } from '../types/emulator';

interface DesktopLayoutProps {
  systemMachine: FriscyMachine;
  bootProgress: BootState;
  isPaused: boolean;
  onMountLocal: () => void;
  activeAnalyser: AnalyserNode | null;
  voiceActiveId: string | null;
  onMicStateChange: (analyser: AnalyserNode | null, id: string | null) => void;
  onBootSystem: () => void;
  onTogglePause: () => void;
  machineStats: MachineStats;
}

interface WindowInstanceProps {
    id: string;
    customClass?: string;
    systemMachine: FriscyMachine;
    bootProgress: BootState;
    isPaused: boolean;
    machineStats: MachineStats;
    onMountLocal: () => void;
    onBootSystem: () => void;
    onTogglePause: () => void;
    activeAnalyser: AnalyserNode | null;
    voiceActiveId: string | null;
    onMicStateChange: (analyser: AnalyserNode | null, id: string | null) => void;
    maximizedId: string | null;
    setMaximizedId: (id: string | null) => void;
    minimizedIds: Set<string>;
    setMinimizedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
    isPoppedOut: boolean;
    activeHubApp: string | null;
    setActiveHubApp: (app: string | null) => void;
    handlePopToggle: (id: string) => void;
}

const WindowInstance: React.FC<WindowInstanceProps> = ({
    id, customClass = "", systemMachine, bootProgress, isPaused, machineStats,
    onMountLocal, onBootSystem, onTogglePause, activeAnalyser, voiceActiveId, onMicStateChange,
    maximizedId, setMaximizedId, minimizedIds, setMinimizedIds, isPoppedOut,
    activeHubApp, setActiveHubApp, handlePopToggle
}) => {
    if (maximizedId && maximizedId !== id) return null;

    const isMaximized = maximizedId === id || isPoppedOut;
    const isMinimized = minimizedIds.has(id);
    const isActuallyIdle = systemMachine.status === 'idle';
    const isIdle = isActuallyIdle && !isPaused;
    const isBooting = bootProgress.pct < 100 && bootProgress.pct >= -1 && !isActuallyIdle && !isPaused;

    const windowTitle = id === 'claude' ? 'Claude Code' : (id === 'alpine' ? 'System Config' : (activeHubApp === 'notepad' ? 'Neural Notepad' : (activeHubApp === 'github' ? 'Neural Sync' : 'App Hub')));
    const windowIcon = id === 'claude' ? '/friscy-bundle/claude-splat.svg' : (id === 'alpine' ? '/friscy-bundle/alpine-icon.svg' : '/friscy-bundle/go-icon.svg');

    return (
      <div className={`${isMinimized ? 'h-auto' : 'h-full'} ${customClass} transition-all duration-300`}>
import { SupportingView } from './SupportingView';
import { FriscyMachine } from '../lib/FriscyMachine';
...
        <WindowFrame
          id={id}
          title={windowTitle}
          icon={windowIcon}
          isMaximized={isMaximized}
          isMinimized={isMinimized}
          isPoppedOut={isPoppedOut}
          isPaused={isPaused}
          machineStats={machineStats}
          onClose={() => {
              if (id === 'hub' && activeHubApp) setActiveHubApp(null);
          }}
          onMinimize={() => setMinimizedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
          })}
          onMaximize={() => setMaximizedId(id)}
          onRestore={() => setMaximizedId(null)}
          onShare={onMountLocal}
          onPopout={() => handlePopToggle(id)}
          onTogglePause={onTogglePause}
        >
          <div className="relative w-full h-full bg-black">
            {id === 'hub' ? (
                <div className="flex flex-col h-full">
                    <div className="flex-1 min-h-0">
                        <SupportingView activeApp={activeHubApp} />
                    </div>
                    <div className="h-32 border-t border-white/5 shrink-0">
                        <AppShelf3D onSelectApp={setActiveHubApp} />
                    </div>
                </div>
            ) : (
                <>
                    {isIdle && (
                        <IntroOverlay 
                            machine={systemMachine} 
                            onBoot={onBootSystem}
                            type={id === 'claude' ? 'welcome' : 'stats'}
                        />
                    )}
                    
                    <TerminalView 
                        machine={systemMachine} 
                        active={!isMinimized && !isActuallyIdle} 
                        voiceActiveId={voiceActiveId}
                        onMicStateChange={(analyser) => onMicStateChange(analyser, id)}
                    />
                    
                    {isBooting && (
                        <ProgressOverlay 
                            active={true} 
                            progress={bootProgress.pct} 
                            stage={bootProgress.stage} 
                            detail={bootProgress.detail} 
                        />
                    )}
                </>
            )}
          </div>
        </WindowFrame>
      </div>
    );
};

export const DesktopLayout: React.FC<DesktopLayoutProps> = ({
  systemMachine,
  bootProgress,
  isPaused,
  onMountLocal,
  activeAnalyser,
  voiceActiveId,
  onMicStateChange,
  onBootSystem,
  onTogglePause,
  machineStats
}) => {
  const [items, setItems] = useState<string[]>(['claude', 'alpine', 'hub']);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [maximizedId, setMaximizedId] = useState<string | null>(null);
  const [minimizedIds, setMinimizedIds] = useState<Set<string>>(new Set());
  const [isMobile, setIsMobile] = useState(false);
  const [activeHubApp, setActiveHubApp] = useState<string | null>(null);

  // Check if we are in a popout window
  const params = new URLSearchParams(window.location.search);
  const popoutId = params.get('popout');
  const isPoppedOut = !!popoutId;

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setItems((items) => {
        const oldIndex = items.indexOf(active.id as string);
        const newIndex = items.indexOf(over.id as string);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
    setActiveId(null);
  };

  const handlePopToggle = (id: string) => {
      if (isPoppedOut) {
          window.close();
          return;
      }
      const url = new URL(window.location.href);
      url.searchParams.set('popout', id);
      window.open(url.toString(), `friscy-${id}`, 'width=800,height=600,menubar=no,toolbar=no,location=no,status=no');
  };

  const renderWindow = (id: string, customClass: string = "") => {
      return <WindowInstance 
        key={`${id}-${isPaused}`}
        id={id}
        customClass={customClass}
        systemMachine={systemMachine}
        bootProgress={bootProgress}
        isPaused={isPaused}
        machineStats={machineStats}
        onMountLocal={onMountLocal}
        onBootSystem={onBootSystem}
        onTogglePause={onTogglePause}
        activeAnalyser={activeAnalyser}
        voiceActiveId={voiceActiveId}
        onMicStateChange={onMicStateChange}
        maximizedId={maximizedId}
        setMaximizedId={setMaximizedId}
        minimizedIds={minimizedIds}
        setMinimizedIds={setMinimizedIds}
        isPoppedOut={isPoppedOut}
        activeHubApp={activeHubApp}
        setActiveHubApp={setActiveHubApp}
        handlePopToggle={handlePopToggle}
      />;
  };

  if (isPoppedOut && popoutId) {
      return (
          <div className="flex-1 flex overflow-hidden h-screen bg-black">
              {renderWindow(popoutId)}
          </div>
      );
  }

  if (isMobile) {
    return (
      <div className="flex-1 flex flex-col p-2 gap-2 overflow-hidden h-[calc(100vh-40px)]">
        {renderWindow('hub', "flex-[1]")}
        {renderWindow('claude', "flex-[2]")}
      </div>
    );
  }

  const isClaudeMinimized = minimizedIds.has('claude');

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <SortableContext items={items} strategy={rectSortingStrategy}>
        <div className="flex-1 flex p-4 gap-4 overflow-hidden h-full max-h-[calc(100vh-40px)]">
          <div className={`transition-all duration-500 ease-in-out ${isClaudeMinimized ? 'w-72 flex-none' : 'flex-1'} min-w-0`}>
            {renderWindow('claude')}
          </div>

          <div className={`transition-all duration-500 ease-in-out ${isClaudeMinimized ? 'flex-1' : 'w-[450px]'} flex flex-col gap-4 shrink-0`}>
            {renderWindow('alpine', minimizedIds.has('alpine') ? "" : "flex-1")}
            {renderWindow('hub', minimizedIds.has('hub') ? "" : "flex-1")}
          </div>
        </div>
      </SortableContext>
    </DndContext>
  );
};
