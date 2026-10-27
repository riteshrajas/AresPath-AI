/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        mars: {
          dark: '#0B0D13',
          card: '#121622',
          border: '#1F293D',
          red: '#E05A47',
          orange: '#FF7A59',
          cyan: '#00F0FF',
          accent: '#00B4D8',
          caution: '#FACC15',
          danger: '#EF4444',
          safe: '#10B981'
        }
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif']
      }
    },
  },
  plugins: [],
}
