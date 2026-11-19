/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        obsidian: '#0B0F17',
        panel: '#111722',
        panelAlt: '#161E2E',
        borderSharp: '#222D3F',
        amberTerm: '#F5B74F',
        cyanTerm: '#56B6F7',
        greenTerm: '#34D399',
        redTerm: '#F87171',
        magentaTerm: '#A78BFA',
      },
      fontFamily: {
        sans: ['"Inter"', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
    },
  },
  plugins: [],
};
