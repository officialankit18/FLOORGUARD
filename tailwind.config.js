/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: '#080D18',
          secondary: '#101827',
          card: '#151F30',
          elevated: '#1C293C',
        },
        cyan: {
          DEFAULT: '#F6BD16',
          glow: 'rgba(246, 189, 22, 0.25)',
          dark: '#B77900',
        },
        signal: {
          blue: '#438BFF',
          glow: 'rgba(67, 139, 255, 0.25)',
        },
        text: {
          primary: '#F4F7FC',
          secondary: '#9AAAC0',
          muted: '#62738d',
        },
        border: {
          DEFAULT: '#29374B',
          subtle: '#1C293C',
          bright: '#3d526e',
        },
        state: {
          success: '#36D399',
          warning: '#F6BD60',
          critical: '#FF5D73',
          info: '#438BFF',
        }
      },
      fontFamily: {
        sans: ['Inter', 'Manrope', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      animation: {
        'pulse-subtle': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'radar-sweep': 'radar 4s linear infinite',
      },
      keyframes: {
        radar: {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        }
      }
    },
  },
  plugins: [],
}
