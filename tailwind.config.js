/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        felt: {
          DEFAULT: '#0f5132',
          dark: '#0a3d26',
          light: '#157347',
        },
      },
    },
  },
  plugins: [],
};
