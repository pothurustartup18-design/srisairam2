import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
  ],
  // Safelist dynamic avatar/icon color classes used in TSX
  safelist: [
    { pattern: /bg-(blue|green|red|amber|purple|slate)-(50|100|200|lt|dk)?/ },
    { pattern: /text-(blue|green|red|amber|purple|slate)-(50|100|200|400|500|600|700|800|900|DEFAULT)?/ },
    { pattern: /border-(blue|green|red|amber|purple|slate)-(200|300|lt)?/ },
  ],
  theme: {
    extend: {
      colors: {
        blue: {
          DEFAULT: '#2563EB',
          lt:      '#EFF6FF',
          dk:      '#1D4ED8',
          50:      '#EFF6FF',
          100:     '#DBEAFE',
          200:     '#BFDBFE',
          400:     '#60A5FA',
          500:     '#3B82F6',
          700:     '#1D4ED8',
        },
        green: {
          DEFAULT: '#16A34A',
          lt:      '#DCFCE7',
          50:      '#F0FDF4',
          100:     '#DCFCE7',
          200:     '#BBF7D0',
          700:     '#15803D',
          800:     '#166534',
        },
        amber: {
          DEFAULT: '#D97706',
          lt:      '#FEF3C7',
          50:      '#FFFBEB',
          100:     '#FEF3C7',
          200:     '#FDE68A',
          700:     '#B45309',
          800:     '#78350F',
        },
        red: {
          DEFAULT: '#DC2626',
          lt:      '#FEE2E2',
          50:      '#FFF1F2',
          100:     '#FEE2E2',
          200:     '#FECACA',
          700:     '#B91C1C',
          800:     '#991B1B',
        },
        purple: {
          DEFAULT: '#7C3AED',
          lt:      '#F5F3FF',
          50:      '#FAF5FF',
          100:     '#F3E8FF',
          200:     '#E9D5FF',
          700:     '#6D28D9',
          800:     '#5B21B6',
        },
        slate: {
          50:  '#F8FAFC',
          100: '#F1F5F9',
          200: '#E2E8F0',
          300: '#CBD5E1',
          400: '#94A3B8',
          500: '#64748B',
          600: '#475569',
          700: '#334155',
          800: '#1E293B',
          900: '#0F172A',
        },
      },
      borderRadius: {
        sm: '6px',
        md: '10px',
        lg: '14px',
      },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04)',
        modal: '0 20px 25px -5px rgba(0,0,0,.10), 0 10px 10px -5px rgba(0,0,0,.04)',
      },
      fontFamily: {
        sans: ['Outfit', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        '2xs': ['10px', { lineHeight: '1.4' }],
        xs:    ['11px', { lineHeight: '1.4' }],
        sm:    ['13px', { lineHeight: '1.5' }],
        base:  ['14px', { lineHeight: '1.5' }],
        md:    ['15px', { lineHeight: '1.5' }],
        lg:    ['16px', { lineHeight: '1.5' }],
        xl:    ['18px', { lineHeight: '1.4' }],
        '2xl': ['20px', { lineHeight: '1.3' }],
        '3xl': ['22px', { lineHeight: '1.2' }],
        '4xl': ['28px', { lineHeight: '1.1' }],
      },
    },
  },
  plugins: [],
};

export default config;
