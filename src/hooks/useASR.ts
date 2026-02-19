import { useState, useCallback, useRef } from 'react';
// @ts-ignore
import { pipeline } from '@xenova/transformers';

export interface ASRProgress {
  status: 'initiating' | 'downloading' | 'done' | 'progress';
  name?: string;
  file?: string;
  progress?: number;
  loaded?: number;
  total?: number;
}

export function useASR() {
  const [isWhisperReady, setIsWhisperReady] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState<ASRProgress | null>(null);
  const whisperProcessor = useRef<any>(null);
  const nativeRecognition = useRef<any>(null);
  
  const analyserNode = useRef<AnalyserNode | null>(null);
  const [isUsingNative, setIsUsingNative] = useState(false);

  const initWhisper = useCallback(async () => {
    if (whisperProcessor.current) return;
    try {
      let device = 'wasm';
      if ('gpu' in navigator) {
          try {
              const adapter = await (navigator as any).gpu.requestAdapter();
              if (adapter) device = 'webgpu';
          } catch (e) {
              console.warn('WebGPU not available', e);
          }
      }

      whisperProcessor.current = await pipeline('automatic-speech-recognition', 'Xenova/whisper-small', {
        device,
        dtype: 'q4',
        progress_callback: (progress: ASRProgress) => {
          setLoadingProgress(progress);
        }
      });
      setIsWhisperReady(true);
      setLoadingProgress(null);
    } catch (err) {
      console.error('Whisper init failed:', err);
      setLoadingProgress(null);
    }
  }, []);

  const transcribeWhisper = useCallback(async (audioData: Float32Array): Promise<string> => {
    if (!whisperProcessor.current) return "";
    const output = await whisperProcessor.current(audioData, {
      chunk_length_s: 30,
      stride_length_s: 5,
      language: 'en',
      task: 'transcribe',
      return_timestamps: false,
    });
    return output.text.trim();
  }, []);

  const startNativeSpeech = useCallback((onResult: (text: string, isFinal: boolean) => void, onEnd: () => void) => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return null;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: any) => {
        let interimTranscript = '';
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i][0].confidence < 0.1) continue;
            if (event.results[i].isFinal) finalTranscript += event.results[i][0].transcript;
            else interimTranscript += event.results[i][0].transcript;
        }
        if (finalTranscript || interimTranscript) onResult(finalTranscript || interimTranscript, !!finalTranscript);
    };
    recognition.onerror = () => onEnd();
    recognition.onend = () => {
        setIsUsingNative(false);
        onEnd();
    };
    recognition.start();
    setIsUsingNative(true);
    nativeRecognition.current = recognition;
    return recognition;
  }, []);

  const stopNativeSpeech = useCallback(() => {
      if (nativeRecognition.current) {
          nativeRecognition.current.stop();
          nativeRecognition.current = null;
          setIsUsingNative(false);
      }
  }, []);

  const setupVisualizer = useCallback((stream: MediaStream, audioContext: AudioContext) => {
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 64;
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      analyserNode.current = analyser;
      return analyser;
  }, []);

  return {
    initWhisper,
    transcribeWhisper,
    isWhisperReady,
    loadingProgress,
    startNativeSpeech,
    stopNativeSpeech,
    setupVisualizer,
    analyserNode,
    isUsingNative
  };
}
