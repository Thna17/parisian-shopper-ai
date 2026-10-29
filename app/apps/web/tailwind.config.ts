import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        app: {
          bg: 'var(--bg)',
          surface: 'var(--surface)',
          'surface-subtle': 'var(--surface2)',
          primary: 'var(--text)',
          muted: 'var(--muted)',
          border: 'var(--border)',
        },
        navy: {
          900: '#243746',
          800: '#2D4457',
        },
        gold: {
          500: '#B59761',
          400: '#C7AC7B',
        },
        status: {
          good: 'var(--good)',
          warn: 'var(--warn)',
          bad: 'var(--bad)',
        },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        khmer: ['Noto Sans Khmer', 'Khmer OS', 'sans-serif'],
      },
      boxShadow: {
        subtle: 'var(--shadow)',
        elevated: 'var(--shadow-lg)',
      },
      borderRadius: {
        DEFAULT: '12px',
        lg: '17px',
      },
    },
  },
  plugins: [],
} satisfies Config;
