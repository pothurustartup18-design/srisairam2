import type { Config } from 'tailwindcss';

// Every colour, radius, shadow and type size below resolves to a CSS variable
// defined in src/styles/tokens.css — change the design there, not here.
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const brand = {
  DEFAULT: v('brand-600'),
  lt: v('brand-50'),
  dk: v('brand-700'),
  50: v('brand-50'),
  100: v('brand-100'),
  200: v('brand-200'),
  300: v('brand-300'),
  400: v('brand-400'),
  500: v('brand-500'),
  600: v('brand-600'),
  700: v('brand-700'),
  800: v('brand-800'),
  900: v('brand-900'),
};

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
        blue: brand,
        brand,
        accent: { DEFAULT: v('accent'), soft: v('accent-soft'), ink: v('accent-ink') },
        canvas: v('canvas'),
        surface: { DEFAULT: v('surface'), 2: v('surface-2'), 3: v('surface-3') },
        line: { DEFAULT: v('line'), strong: v('line-strong') },
        ink: { DEFAULT: v('ink'), 2: v('ink-2') },
        muted: v('muted'),
        faint: v('faint'),
        success: { DEFAULT: v('success'), soft: v('success-soft') },
        warning: { DEFAULT: v('warning'), soft: v('warning-soft') },
        danger: { DEFAULT: v('danger'), soft: v('danger-soft') },
        info: { DEFAULT: v('info'), soft: v('info-soft') },
        green: {
          DEFAULT: '#059669',
          lt:      '#ECFDF5',
          50:      '#ECFDF5',
          100:     '#D1FAE5',
          200:     '#A7F3D0',
          700:     '#047857',
          800:     '#065F46',
        },
        amber: {
          DEFAULT: '#D97706',
          lt:      '#FFFBEB',
          50:      '#FFFBEB',
          100:     '#FEF3C7',
          200:     '#FDE68A',
          700:     '#B45309',
          800:     '#92400E',
        },
        red: {
          DEFAULT: '#E11D48',
          lt:      '#FFF1F2',
          50:      '#FFF1F2',
          100:     '#FFE4E6',
          200:     '#FECDD3',
          700:     '#BE123C',
          800:     '#9F1239',
        },
        purple: {
          DEFAULT: '#7C3AED',
          lt:      '#F5F3FF',
          50:      '#F5F3FF',
          100:     '#EDE9FE',
          200:     '#DDD6FE',
          700:     '#6D28D9',
          800:     '#5B21B6',
        },
        slate: {
          50:  '#F8FAFC',
          100: '#F1F5F9',
          200: '#E5E9F2',
          300: '#CBD3E1',
          400: '#94A3B8',
          500: '#64748B',
          600: '#475569',
          700: '#334155',
          800: '#1E293B',
          900: '#0F172A',
        },
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        '2xl': 'var(--radius-2xl)',
      },
      boxShadow: {
        xs: 'var(--shadow-xs)',
        card: 'var(--shadow-card)',
        raised: 'var(--shadow-raised)',
        modal: 'var(--shadow-overlay)',
        overlay: 'var(--shadow-overlay)',
        focus: 'var(--focus-ring)',
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
        mono: ['var(--font-mono)'],
      },
      fontSize: {
        '2xs': ['var(--text-2xs)', { lineHeight: '1.4' }],
        xs:    ['var(--text-xs)', { lineHeight: '1.45' }],
        sm:    ['var(--text-sm)', { lineHeight: '1.5' }],
        base:  ['var(--text-base)', { lineHeight: '1.55' }],
        md:    ['var(--text-md)', { lineHeight: '1.5' }],
        lg:    ['var(--text-lg)', { lineHeight: '1.45' }],
        xl:    ['var(--text-xl)', { lineHeight: '1.35' }],
        '2xl': ['var(--text-2xl)', { lineHeight: '1.3' }],
        '3xl': ['var(--text-3xl)', { lineHeight: '1.2' }],
        '4xl': ['var(--text-4xl)', { lineHeight: '1.1' }],
      },
      height: { control: 'var(--control-h)', 'control-sm': 'var(--control-h-sm)' },
      minHeight: { control: 'var(--control-h)', tap: '44px' },
      minWidth: { tap: '44px' },
      transitionTimingFunction: { out: 'var(--ease-out)' },
    },
  },
  plugins: [],
};

export default config;
