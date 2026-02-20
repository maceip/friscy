import React, { useState } from 'react';
import { TerminalView } from './TerminalView';
import { FriscyMachine } from '../lib/FriscyMachine';
import { ExternalLink, FolderPlus, X, Zap } from 'lucide-react';

interface MachineContainerProps {
  machine: FriscyMachine;
  active: boolean;
  onClose: () => void;
}

export const MachineContainer: React.FC<MachineContainerProps> = ({ machine, active, onClose }) => {
  const [isSyncing, setIsSyncing] = useState(false);

  const popOut = () => {
    // In a production app, we would use a BroadcastChannel or SharedWorker
    // to keep the same machine running but show it in a new window.
    // For now, we open a standalone URL for this instance ID.
    const url = new URL(window.location.href);
    url.searchParams.set('popout', machine.config.id);
    url.searchParams.set('preset', machine.config.id.split('-')[0]);
    window.open(url.toString(), `friscy-${machine.config.id}`, 'width=800,height=600');
  };

  const shareFolder = async () => {
    try {
      if (!('showDirectoryPicker' in window)) {
          alert('File System Access API not supported in this browser.');
          return;
      }
      setIsSyncing(true);
      // @ts-ignore - showDirectoryPicker is experimental but standard in Chrome
      const handle = await window.showDirectoryPicker();
      
      // We would now register this handle with the machine's VectorHeart shim
      // so it can perform sync reads/writes to this local folder.
      machine.writeStdin(`
\x1b[32m[host] Mounted local folder: ${handle.name}\x1b[0m
`);
      
    } catch (e) {
      console.warn('Folder sharing cancelled or failed', e);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className={`flex-1 flex flex-col min-h-0 ${active ? 'flex' : 'hidden'}`}>
      <div className="bg-gray-900/50 px-4 py-1 flex justify-between items-center border-b border-friscy-border/30 backdrop-blur-sm">
        <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                <Zap className="w-3 h-3 text-friscy-orange fill-friscy-orange/20" />
                <span>Instance: {machine.config.id.slice(-6)}</span>
            </div>
            {machine.status === 'running' && (
                <div className="flex items-center gap-1 text-[10px] text-green-500 font-bold uppercase tracking-wider">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                    <span>Live</span>
                </div>
            )}
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={shareFolder}
            disabled={isSyncing}
            className="p-1.5 hover:bg-white/5 rounded-md text-gray-400 hover:text-friscy-blue transition-colors title='Share Local Folder'"
          >
            <FolderPlus className={`w-4 h-4 ${isSyncing ? 'animate-bounce' : ''}`} />
          </button>
          <button 
            onClick={popOut}
            className="p-1.5 hover:bg-white/5 rounded-md text-gray-400 hover:text-friscy-blue transition-colors title='Pop out Window'"
          >
            <ExternalLink className="w-4 h-4" />
          </button>
          <button 
            onClick={onClose}
            className="p-1.5 hover:bg-white/5 rounded-md text-gray-400 hover:text-red-400 transition-colors title='Terminate'"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div className="flex-1 relative">
        <TerminalView machine={machine} active={active} />
      </div>
    </div>
  );
};
