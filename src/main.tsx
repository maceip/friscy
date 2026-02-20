import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// WebMCP Imperative API Registration
if ('webmcp' in window) {
  const mcp = (window as any).webmcp;
  
  mcp.registerTool({
    name: 'import_docker_image',
    description: 'Pull a Docker image from Docker Hub and run it in a RISC-V emulator',
    parameters: {
      type: 'object',
      properties: {
        image: { type: 'string', description: 'Docker image reference, e.g. ubuntu:latest' }
      },
      required: ['image']
    },
    execute: async ({ image }: { image: string }) => {
      window.location.href = `/?tool=import_docker_image&image=${encodeURIComponent(image)}`;
      return { success: true, message: `Importing ${image}...` };
    }
  });

  mcp.registerTool({
    name: 'spawn_dual_terminal',
    description: 'Open a side-by-side workspace with a cloud RISC-V terminal and a local terminal',
    execute: async () => {
      window.location.href = '/?tool=spawn_dual_terminal';
      return { success: true, message: 'Spawning dual terminal...' };
    }
  });
}

console.log('[main.tsx] executing...');
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
