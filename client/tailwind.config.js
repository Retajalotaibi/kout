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
        // Warm neutral surface, muted green accent.
        paper: { DEFAULT: '#f8f7f3', card: '#ffffff', line: '#e7e4dc', muted: '#efede6' },
        ink: { DEFAULT: '#2b2a27', soft: '#5f5c55', faint: '#8d8981' },
        brand: { 50: '#eef6f2', 100: '#d5eadf', 600: '#0f6b4a', 700: '#0b573c', 800: '#08432e' },
      },
      boxShadow: { composer: '0 1px 2px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.05)' },
    },
  },
  plugins: [],
};
