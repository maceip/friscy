import React, { useEffect, useRef } from 'react';
import { useTheme } from '../contexts/ThemeContext';

interface WaveformVisualizerProps {
  analyser: AnalyserNode | null;
}

export const WaveformVisualizer: React.FC<WaveformVisualizerProps> = ({ analyser }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const { theme } = useTheme();

  useEffect(() => {
    if (!analyser || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animationRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);

      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      const barWidth = (width / bufferLength) * 2.5;
      let x = 0;

      // Color based on theme
      const color = theme === 'dark' 
        ? 'rgba(255, 255, 255,' 
        : 'rgba(15, 23, 42,'; // Dark slate for light mode

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * height;

        ctx.fillStyle = `${color} ${0.3 + (dataArray[i] / 255) * 0.7})`;
        
        // Draw bars from center out
        ctx.fillRect(x, (height - barHeight) / 2, barWidth, barHeight);

        x += barWidth + 1;
      }
    };

    draw();

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [analyser, theme]);

  if (!analyser) return null;

  return (
    <canvas 
      ref={canvasRef} 
      width={24} 
      height={16} 
      className="opacity-80 transition-opacity"
    />
  );
};
