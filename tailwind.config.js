import defaultTheme from 'tailwindcss/defaultTheme';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // "Lacquer & Gold" palette — hex values mirror src/styles/theme.css :root
      // (kept as literals so Tailwind opacity modifiers like bg-gold/40 work).
      colors: {
        lacquer: {
          DEFAULT: '#6b0f17',
          deep: '#4a0a10',
          bright: '#8a141d',
        },
        ox: '#2a0608',
        ink: {
          DEFAULT: '#170406',
          true: '#0c0204',
        },
        gold: {
          DEFAULT: '#d9b25e',
          light: '#f4e3a8',
          mid: '#c79a44',
          deep: '#8a6420',
          shadow: '#5b3f12',
        },
        pearl: {
          DEFAULT: '#f6efe0',
          2: '#ece0c8',
        },
        cardface: {
          DEFAULT: '#faf6ec',
          edge: '#e6d9bc',
        },
        jade: {
          DEFAULT: '#3f9d77',
          deep: '#1f6b4c',
        },
        suit: {
          red: '#b3242b',
          blk: '#221a17',
        },
      },
      fontFamily: {
        sans: ['"Be Vietnam Pro"', ...defaultTheme.fontFamily.sans],
        display: ['"Be Vietnam Pro"', ...defaultTheme.fontFamily.sans],
        // Latin "BEIKAO" wordmark ONLY — never for Vietnamese (diacritic) text.
        logo: ['"Playfair Display"', 'Georgia', 'serif'],
      },
      boxShadow: {
        card: '0 18px 40px -12px rgba(0,0,0,.6), 0 3px 8px rgba(0,0,0,.4)',
        soft: '0 10px 30px -8px rgba(0,0,0,.5)',
      },
      animation: {
        'fade-up': 'fadeUp .5s ease both',
        pop: 'pop .4s ease both',
        'glow-pulse': 'glowPulse 1.4s ease-in-out infinite',
        shimmer: 'shimmer 2.4s linear infinite',
        float: 'float 3s ease-in-out infinite',
        'spin-slow': 'spin-slow 24s linear infinite',
      },
    },
  },
  plugins: [],
};
