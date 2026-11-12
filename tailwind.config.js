/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        obsidian: '#050608',
        panel: '#090C10',
        panelAlt: '#0D1118',
        borderSharp: '#1E2736',
        amberTerm: '#FF9F1C',
        cyanTerm: '#00E5FF',
        greenTerm: '#00E676',
        redTerm: '#FF1744',
        magentaTerm: '#D500F9',
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', '"Fira Code"', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};

