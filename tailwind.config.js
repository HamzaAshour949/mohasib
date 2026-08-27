/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{ts,tsx,html}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['system-ui', 'ui-sans-serif', 'sans-serif'],
        ar: ['"SF Arabic"', '"Geeza Pro"', '"Noto Naskh Arabic"', 'Amiri', 'system-ui', 'sans-serif']
      },
      colors: {
        bg: '#0F1115',
        bg2: '#1E2330',
        panel: '#161A22',
        surface: '#161A22',
        surface2: '#1E2330',
        line: '#2A3142',
        border: '#2A3142',
        fg: '#E6E9EF',
        fg2: '#8B93A7',
        text: '#E6E9EF',
        textDim: '#8B93A7',
        accent: '#3FA7A0',
        accentSoft: 'rgba(63,167,160,0.15)',
        positive: '#5CC98C',
        negative: '#E96B6B',
        warning: '#E6B85C'
      }
    }
  },
  plugins: []
};
