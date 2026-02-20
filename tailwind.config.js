/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        friscy: {
          bg: '#050810',
          panel: '#0a0e14',
          border: 'rgba(89,194,255,0.15)',
          orange: '#ff8f40',
          blue: '#59c2ff',
          magenta: '#d2a6ff'
        }
      },
      fontFamily: {
        mono: ['Maple Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'Liberation Mono', 'Courier New', 'monospace'],
      },
    },
  },
  plugins: [],
}
