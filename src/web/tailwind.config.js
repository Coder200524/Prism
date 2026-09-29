/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        'df-bg': '#0B1020',
        'df-text': '#E6ECFF',
        'df-pink': '#FF3D6E',
        'df-cyan': '#00E5D0',
        'df-border': '#1B2540',
        'df-panel': '#0E1428',
        'df-dim': '#6B7A9E',
      },
      fontFamily: {
        display: ['"Archivo Black"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
        pixel: ['"VT323"', 'monospace'],
      },
    },
  },
  plugins: [],
};
