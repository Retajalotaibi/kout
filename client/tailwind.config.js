/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"IBM Plex Sans Arabic"', '"Noto Sans Arabic"', 'system-ui', '-apple-system', 'Segoe UI', 'Tahoma', 'sans-serif'],
        serif: ['"Source Serif 4"', '"Noto Naskh Arabic"', 'Georgia', 'serif'],
      },
      colors: {
        // White surface, navy primary, light gold accent.
        paper: { DEFAULT: '#ffffff', card: '#ffffff', line: '#e2e8f0', muted: '#f1f5f9' },
        ink: { DEFAULT: '#0f172a', soft: '#475569', faint: '#94a3b8' },
        brand: { 50: '#eef3f9', 100: '#d6e2f0', 600: '#1e3a5f', 700: '#172e4c', 800: '#10223a' },
        gold: { 50: '#fbf6e6', 100: '#f3e6b8', 500: '#c9a227', 700: '#8a6d12' },
      },
      boxShadow: { composer: '0 1px 2px rgba(15,23,42,0.05), 0 6px 20px rgba(30,58,95,0.08)', card: '0 1px 2px rgba(15,23,42,0.04)' },
    },
  },
  plugins: [],
};
