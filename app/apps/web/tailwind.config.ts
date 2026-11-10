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
          950: '#192e35',
          900: '#243746',
          800: '#2D4457',
        },
        gold: {
          50: '#fbf8f1',
          100: '#f5eddd',
          200: '#e8d9ba',
          300: '#d8c395',
          600: '#9a7c45',
          700: '#7c6238',
          800: '#655132',
          900: '#51412b',
          500: '#B59761',
          400: '#C7AC7B',
        },
        brand: { burgundy: '#243746', gold: '#b59761' },
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
        DEFAULT: '8px',
        lg: '8px',
        xl: '12px',
        '2xl': '16px',
      },
    },
  },
  plugins: [],
} satisfies Config;
