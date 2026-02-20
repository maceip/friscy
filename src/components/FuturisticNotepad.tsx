import React, { useState, useEffect, useCallback } from 'react';
import { Sparkles, Brain, CheckCircle2, Circle, Eye, Edit3, Save, GitBranch } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Task {
    id: string;
    text: string;
    completed: boolean;
    byAgent: boolean;
}

export const FuturisticNotepad: React.FC = () => {
    const [tasks, setTasks] = useState<Task[]>([
        { id: '1', text: 'Initialize shared rootfs', completed: true, byAgent: true },
        { id: '2', text: 'Bridge host filesystem via /mnt/host', completed: true, byAgent: false },
        { id: '3', text: 'Monitor Node.js boot sequence', completed: false, byAgent: true },
    ]);
    
    // Persistence: Initialize from localStorage
    const [note, setNote] = useState(() => {
        return localStorage.getItem('friscy-neural-log') || '# Neural Session Log\n\n- [ ] Task 1\n- [x] Task 2\n\nStart your research here...';
    });
    
    const [viewMode, setViewMode] = useState<'edit' | 'preview' | 'split'>('edit');

    // Auto-save on change
    useEffect(() => {
        localStorage.setItem('friscy-neural-log', note);
    }, [note]);

    const handleGitCommit = () => {
        alert('Git integration pending: Workspace not yet connected to a remote workstream.');
    };

    return (
        <div className="w-full h-full bg-[#0a0e14] flex flex-col overflow-hidden">
            {/* Agent Ribbon */}
            <div className="h-12 bg-friscy-blue/5 border-b border-friscy-blue/20 flex items-center px-4 justify-between relative overflow-hidden group">
                <div className="flex items-center gap-3 relative z-10">
                    <div className="relative w-6 h-6">
                        <div className="absolute inset-0 bg-friscy-blue/40 blur-md rounded-full animate-ping" />
                        <div className="absolute inset-0 bg-friscy-blue rounded-full shadow-[0_0_10px_rgba(89,194,255,0.8)] flex items-center justify-center">
                            <Sparkles className="w-3 h-3 text-[#050810]" />
                        </div>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[9px] font-black uppercase tracking-[0.2em] text-friscy-blue leading-none">Neural Observer</span>
                        <span className="text-[7px] font-bold text-gray-500 uppercase tracking-widest mt-1">Status: Tracking Persistence...</span>
                    </div>
                </div>

                {/* View Controls & Git Placeholder */}
                <div className="flex items-center gap-4 relative z-10">
                    <div className="flex bg-black/40 rounded p-0.5 border border-white/5">
                        <button 
                            onClick={() => setViewMode('edit')}
                            className={`p-1.5 rounded ${viewMode === 'edit' ? 'bg-friscy-blue/20 text-friscy-blue' : 'text-gray-500 hover:text-gray-300'}`}
                        >
                            <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button 
                            onClick={() => setViewMode('preview')}
                            className={`p-1.5 rounded ${viewMode === 'preview' ? 'bg-friscy-blue/20 text-friscy-blue' : 'text-gray-500 hover:text-gray-300'}`}
                        >
                            <Eye className="w-3.5 h-3.5" />
                        </button>
                    </div>

                    <button 
                        onClick={handleGitCommit}
                        className="flex items-center gap-2 px-3 h-8 bg-friscy-blue/10 border border-friscy-blue/30 text-friscy-blue rounded hover:bg-friscy-blue/20 transition-all group/git"
                    >
                        <GitBranch className="w-3 h-3 group-hover/git:rotate-12 transition-transform" />
                        <span className="text-[9px] font-black uppercase tracking-widest">Neural Sync</span>
                    </button>
                </div>

                <div className="absolute bottom-0 right-0 left-0 h-[1px] bg-gradient-to-r from-transparent via-friscy-blue/30 to-transparent animate-pulse" />
            </div>

            <div className="flex-1 flex overflow-hidden">
                {/* Editor Pane */}
                {(viewMode === 'edit' || viewMode === 'split') && (
                    <div className="flex-1 p-6 relative bg-black/10">
                        <textarea 
                            className="w-full h-full bg-transparent border-none outline-none resize-none text-xs font-mono text-gray-400 placeholder:text-gray-800 leading-relaxed custom-scrollbar"
                            placeholder="Neural log initiated... begin session notes here."
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                        />
                    </div>
                )}

                {/* Vertical Divider for Split Mode */}
                {viewMode === 'split' && <div className="w-[1px] bg-white/5 h-full" />}

                {/* Preview Pane */}
                {(viewMode === 'preview' || viewMode === 'split') && (
                    <div className="flex-1 p-8 overflow-y-auto custom-scrollbar bg-[#0a0e14]">
                        <article className="prose prose-invert prose-xs max-w-none 
                            prose-headings:text-friscy-blue prose-headings:font-black prose-headings:tracking-tighter prose-headings:italic prose-headings:uppercase
                            prose-p:text-gray-400 prose-p:leading-relaxed
                            prose-li:text-gray-400 prose-strong:text-friscy-blue/80
                            prose-code:text-amber-500 prose-code:bg-white/5 prose-code:px-1 prose-code:rounded
                            prose-pre:bg-black/40 prose-pre:border prose-pre:border-white/5">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {note}
                            </ReactMarkdown>
                        </article>
                    </div>
                )}
            </div>
        </div>
    );
};
