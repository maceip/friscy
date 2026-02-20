import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import 'xterm/css/xterm.css';
import { FriscyMachine } from '../lib/FriscyMachine';
import { unzipSync, gunzipSync } from 'fflate';
// @ts-ignore
import { parseTar } from '../../friscy-bundle/overlay.js';
import { Mic, MicOff } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useASR } from '../hooks/useASR';
import { SquigglySpinner } from './ProgressOverlay';

interface TerminalViewProps {
  machine: FriscyMachine;
  active: boolean;
  voiceActiveId?: string | null;
  onMicStateChange?: (analyser: AnalyserNode | null) => void;
}

const DARK_THEME = {
  background: '#0a0e14', foreground: '#e6e1cf', selectionBackground: '#1d3b53', selectionForeground: '#e6e1cf',
  cursor: '#ff8f40', black: '#1c2433', red: '#ff3333', green: '#c2d94c', yellow: '#ff8f40',
  blue: '#59c2ff', magenta: '#d2a6ff', cyan: '#73d0ff', white: '#c7c7c7',
  brightBlack: '#3e4b59', brightRed: '#ff6666', brightGreen: '#bae67e', brightYellow: '#ffb454',
  brightBlue: '#73b8ff', brightMagenta: '#dfbfff', brightCyan: '#95e6cb', brightWhite: '#f0f0f0',
};

const LIGHT_THEME = {
  background: '#ffffff', foreground: '#1e293b', selectionBackground: '#cbd5e1', selectionForeground: '#1e293b',
  cursor: '#ff8f40', black: '#000000', red: '#e11d48', green: '#16a34a', yellow: '#d97706',
  blue: '#2563eb', magenta: '#9333ea', cyan: '#0891b2', white: '#e2e8f0',
  brightBlack: '#475569', brightRed: '#f43f5e', brightGreen: '#22c55e', brightYellow: '#f59e0b',
  brightBlue: '#3b82f6', brightMagenta: '#a855f7', brightCyan: '#06b6d4', brightWhite: '#f8fafc',
};

export const TerminalView: React.FC<TerminalViewProps> = ({ machine, active, voiceActiveId, onMicStateChange }) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const { theme } = useTheme();
  const { initWhisper, isWhisperReady, loadingProgress, transcribeWhisper, startNativeSpeech, stopNativeSpeech, setupVisualizer } = useASR();
  
  const [isListening, setIsListening] = useState(false);
  const [cursorPos, setCursorPos] = useState({ top: 0, left: 0 });
  const lastProcessedText = useRef<string>("");

  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const audioBufferRef = useRef<number[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const stopListening = useCallback(() => {
    stopNativeSpeech();
    processorRef.current?.disconnect();
    streamRef.current?.getTracks().forEach(t => t.stop());
    setIsListening(false);
    onMicStateChange?.(null);
    audioBufferRef.current = [];
    lastProcessedText.current = "";
    xtermRef.current?.write('\r\n\x1b[33m[asr] Session Ended.\x1b[0m\r\n');
  }, [stopNativeSpeech, onMicStateChange]);

  // Exclusive voice logic: stop if another terminal becomes active
  useEffect(() => {
    if (isListening && voiceActiveId && voiceActiveId !== machine.config.id) {
        stopListening();
    }
  }, [isListening, voiceActiveId, machine.config.id, stopListening]);

  const startWhisperListening = useCallback(async () => {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        if (!audioCtxRef.current) audioCtxRef.current = new AudioContext({ sampleRate: 16000 });
        const ctx = audioCtxRef.current;
        const source = ctx.createMediaStreamSource(stream);
        const processor = ctx.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;

        const analyser = setupVisualizer(stream, ctx);
        onMicStateChange?.(analyser);

        processor.onaudioprocess = (e) => {
            const inputData = e.inputBuffer.getChannelData(0);
            const audioData = Array.from(inputData);
            audioBufferRef.current.push(...audioData);
            
            // Periodically transcribe (every ~2 seconds of audio)
            if (audioBufferRef.current.length > 32000) {
                const bufferToProcess = new Float32Array(audioBufferRef.current);
                audioBufferRef.current = [];
                transcribeWhisper(bufferToProcess).then(text => {
                    if (text && xtermRef.current) {
                        xtermRef.current.write(text + ' ');
                        machine.writeStdin(text + ' ');
                    }
                });
            }
        };
        source.connect(processor);
        processor.connect(ctx.destination);
        setIsListening(true);
        xtermRef.current?.write('\r\n\x1b[32m[asr] Local Whisper Engine Ready...\x1b[0m\r\n');
    } catch (e) {
        console.error("Whisper Mic Failed", e);
    }
  }, [machine, setupVisualizer, transcribeWhisper, onMicStateChange]);

  const startNativeListening = useCallback(() => {
    startNativeSpeech((text, isFinal) => {
        if (!xtermRef.current) return;
        const diff = text.slice(lastProcessedText.current.length);
        if (diff) { xtermRef.current.write(diff); machine.writeStdin(diff); lastProcessedText.current = text; }
        if (isFinal) { xtermRef.current.write('\n'); machine.writeStdin('\n'); lastProcessedText.current = ""; }
    }, () => {
        setIsListening(false);
        onMicStateChange?.(null);
    });
    
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
        if (!audioCtxRef.current) audioCtxRef.current = new AudioContext({ sampleRate: 16000 });
        const analyser = setupVisualizer(stream, audioCtxRef.current);
        onMicStateChange?.(analyser);
    });

    setIsListening(true);
    xtermRef.current?.write('\r\n\x1b[34m[asr] Native Engine Ready...\x1b[0m\r\n');
  }, [machine, startNativeSpeech, setupVisualizer, onMicStateChange]);

  useEffect(() => {
    if (!terminalRef.current) return;
    const term = new Terminal({
      theme: theme === 'dark' ? DARK_THEME : LIGHT_THEME,
      fontFamily: '"Maple Mono", monospace',
      fontSize: window.innerWidth < 768 ? 12 : 14,
      cursorBlink: true,
      allowProposedApi: true,
      convertEol: true,
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());
    term.loadAddon(new Unicode11Addon());
    term.unicode.activeVersion = '11';
    try { const webgl = new WebglAddon(); term.loadAddon(webgl); } catch (e) { console.warn('WebGL addon failed to load', e); }
    term.open(terminalRef.current);
    fitAddon.fit();
    term.onData((data) => machine.writeStdin(data));
    const savedScrollback = localStorage.getItem(`friscy-scrollback-${machine.config.id}`);
    if (savedScrollback) term.write(savedScrollback);

    let scrollbackBuffer = localStorage.getItem(`friscy-scrollback-${machine.config.id}`) || '';
    let scrollbackDirty = false;
    const flushScrollback = () => { if (scrollbackDirty) { localStorage.setItem(`friscy-scrollback-${machine.config.id}`, scrollbackBuffer); scrollbackDirty = false; } };
    const scrollbackTimer = setInterval(flushScrollback, 500);
    const handleStdout = (text: string) => {
      term.write(text);
      scrollbackBuffer = (scrollbackBuffer + text).slice(-50000);
      scrollbackDirty = true;
      if (term.element) {
          const core = (term as any)._core;
          if (core && core._renderService && core._renderService.dimensions) {
              const charWidth = core._renderService.dimensions.actualCellWidth;
              const charHeight = core._renderService.dimensions.actualCellHeight;
              setCursorPos({ top: core.buffer.y * charHeight, left: core.buffer.x * charWidth });
          }
      }
    };
    const handleStatus = (status: string) => { 
        if (status === 'booting') term.writeln(`\x1b[32mBooting ${machine.config.name}...\x1b[0m`); 
    };

    machine.onStdout = handleStdout;
    machine.onStatusChange = handleStatus as any;

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;
    const el = terminalRef.current;
    const handleDragOver = (e: DragEvent) => { e.preventDefault(); if (el) { el.style.outline = '2px solid #ff8f40'; el.style.outlineOffset = '-2px'; } };
    const handleDragLeave = () => { if (el) el.style.outline = ''; };
    const handleDrop = async (e: DragEvent) => {
        e.preventDefault(); if (el) el.style.outline = '';
        const files = Array.from(e.dataTransfer?.files || []);
        for (const file of files) {
            const reader = new FileReader();
            reader.onload = async (event) => {
                const buffer = event.target?.result as ArrayBuffer;
                const data = new Uint8Array(buffer);
                if (file.name.endsWith('.zip')) {
                    term.writeln(`\r\n\x1b[33m[host] Decompressing ZIP: ${file.name}...\x1b[0m`);
                    try {
                        const unzipped = unzipSync(data);
                        for (const [path, content] of Object.entries(unzipped)) {
                            if (content.length > 0) { machine.writeFile(`/tmp/${path}`, content); term.writeln(`\x1b[32m  -> Extracted ${path} (${(content.length/1024).toFixed(1)}KB)\x1b[0m`); }
                        }
                    } catch (err: any) { term.writeln(`\x1b[31m[host] Decompression failed: ${err.message}\x1b[0m`); }
                } else if (file.name.endsWith('.tar.gz') || file.name.endsWith('.tgz')) {
                    term.writeln(`\r\n\x1b[33m[host] Decompressing TAR.GZ: ${file.name}...\x1b[0m`);
                    try {
                        const decompressed = gunzipSync(data);
                        const entries = parseTar(decompressed);
                        for (const entry of entries) { if (entry.type === '0') { const content = decompressed.slice(entry.offset, entry.offset + entry.size); machine.writeFile(`/tmp/${entry.path}`, content); term.writeln(`\x1b[32m  -> Extracted ${entry.path} (${(content.length/1024).toFixed(1)}KB)\x1b[0m`); } }
                    } catch (err: any) { term.writeln(`\x1b[31m[host] Decompression failed: ${err.message}\x1b[0m`); }
                } else if (file.name.endsWith('.tar')) {
                    term.writeln(`\r\n\x1b[33m[host] Parsing TAR: ${file.name}...\x1b[0m`);
                    try {
                        const entries = parseTar(data);
                        for (const entry of entries) { if (entry.type === '0') { const content = data.slice(entry.offset, entry.offset + entry.size); machine.writeFile(`/tmp/${entry.path}`, content); term.writeln(`\x1b[32m  -> Extracted ${entry.path} (${(content.length/1024).toFixed(1)}KB)\x1b[0m`); } }
                    } catch (err: any) { term.writeln(`\x1b[31m[host] Parsing failed: ${err.message}\x1b[0m`); }
                } else {
                    const path = `/tmp/${file.name}`; machine.writeFile(path, data); term.writeln(`\r\n\x1b[32m[host] Uploaded ${file.name} to ${path} (${(data.length/1024).toFixed(1)}KB)\x1b[0m`);
                }
            };
            reader.readAsArrayBuffer(file);
        }
    };
    el?.addEventListener('dragover', handleDragOver); el?.addEventListener('dragleave', handleDragLeave); el?.addEventListener('drop', handleDrop);
    const handleResize = () => { 
        try {
            if (term.element && term.element.getBoundingClientRect().width > 0) {
                fitAddon.fit(); 
                machine.resize(term.cols, term.rows); 
            }
        } catch (e) {}
    };
    window.addEventListener('resize', handleResize);
    setTimeout(handleResize, 100);
    return () => {
      window.removeEventListener('resize', handleResize);
      el?.removeEventListener('dragover', handleDragOver); el?.removeEventListener('dragleave', handleDragLeave); el?.removeEventListener('drop', handleDrop);
      clearInterval(scrollbackTimer);
      flushScrollback();
      term.dispose();
    };
  }, [machine, theme]);

  const toggleMic = async () => {
    if (isListening) {
        stopListening();
        return;
    }
    if (isWhisperReady) startWhisperListening();
    else {
        startNativeListening();
        if (!loadingProgress) initWhisper();
    }
  };

  useEffect(() => {
    if (active && xtermRef.current) { xtermRef.current.focus(); fitAddonRef.current?.fit(); }
  }, [active]);

  return (
    <div 
      data-testid="terminal-container"
      className={`w-full h-full p-2 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded-lg shadow-inner overflow-hidden relative ${active ? 'block' : 'hidden'}`}>
      <div ref={terminalRef} className="w-full h-full" />
      <button
        onClick={toggleMic}
        className={`absolute bottom-4 right-4 p-1.5 rounded-full border shadow-lg z-30 transition-all ${
            isListening 
                ? 'bg-red-600 border-red-400 text-white animate-mic-pulse' 
                : 'bg-[var(--bg-frame)] border-[var(--border-subtle)] text-[#59c2ff] hover:brightness-110'
        }`}
      >
        {loadingProgress ? <SquigglySpinner size={14} /> : isListening ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
};
