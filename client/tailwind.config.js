/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"IBM Plex Sans Arabic"', '"Noto Sans Arabic"', 'system-ui', '-apple-system', 'Segoe UI', 'Tahoma', 'sans-serif'],
      },
      colors: {
        brand: { 50: '#eef6f2', 100: '#d5eadf', 600: '#0f6b4a', 700: '#0b573c', 800: '#08432e' },
      },
    },
  },
  plugins: [],
};
