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
        // From the Kout logo: royal blue mark, sky-blue wordmark, on white.
        paper: { DEFAULT: '#ffffff', card: '#ffffff', line: '#e2e8f0', muted: '#f1f5f9' },
        ink: { DEFAULT: '#0f172a', soft: '#475569', faint: '#94a3b8' },
        brand: { 50: '#eef5fd', 100: '#d4e6fa', 600: '#1565c0', 700: '#0f50a0', 800: '#0b3d7a' },
        accent: { 50: '#e8f5fd', 100: '#bfe3fa', 500: '#1e9be9', 700: '#0b6fb0' },
      },
      boxShadow: { composer: '0 1px 2px rgba(15,23,42,0.05), 0 6px 20px rgba(21,101,192,0.10)', card: '0 1px 2px rgba(15,23,42,0.04)' },
    },
  },
  plugins: [],
};
