const TONES = ['accent', 'accent2', 'ok', 'warn', 'danger', 'critical', 'muted', 'line', 'ink']
const safelist = TONES.flatMap((c) => [
  `bg-${c}`, `text-${c}`, `border-${c}`, `fill-${c}`, `stroke-${c}`,
  `bg-${c}/5`, `bg-${c}/10`, `bg-${c}/15`, `bg-${c}/20`, `bg-${c}/25`, `bg-${c}/30`,
  `bg-${c}/12`, `bg-${c}/[.05]`, `bg-${c}/[.07]`,
  `border-${c}/15`, `border-${c}/20`, `border-${c}/25`, `border-${c}/30`, `border-${c}/40`, `border-${c}/50`,
  `text-${c}/70`, `ring-${c}/30`, `shadow-${c}/20`,
])

/* The Button component builds its classes as `btn-${variant}` and `btn-${size}`,
   which the content scanner cannot see, so every one of them has to be listed
   here or the buttons render with no background and no height. */
const BUTTONS = [
  'btn', 'btn-primary', 'btn-secondary', 'btn-ghost', 'btn-danger', 'btn-outline',
  'btn-xs', 'btn-sm', 'btn-md', 'btn-lg', 'btn-icon',
]
safelist.push(...BUTTONS)

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  safelist,
  theme: {
    extend: {
      colors: {
        bg: 'rgb(var(--bg) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        surface2: 'rgb(var(--surface2) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        faint: 'rgb(var(--faint) / <alpha-value>)',
        accent: 'rgb(var(--accent) / <alpha-value>)',
        accent2: 'rgb(var(--accent2) / <alpha-value>)',
        ok: 'rgb(var(--ok) / <alpha-value>)',
        warn: 'rgb(var(--warn) / <alpha-value>)',
        danger: 'rgb(var(--danger) / <alpha-value>)',
        critical: 'rgb(var(--critical) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Consolas', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgb(0 0 0 / 0.24), 0 8px 24px -12px rgb(0 0 0 / 0.5)',
        pop: '0 24px 60px -20px rgb(0 0 0 / 0.65)',
      },
      keyframes: {
        in: { from: { opacity: 0, transform: 'translateY(4px)' }, to: { opacity: 1, transform: 'none' } },
        pop: { from: { opacity: 0, transform: 'scale(.97)' }, to: { opacity: 1, transform: 'none' } },
        slide: { from: { transform: 'translateX(100%)' }, to: { transform: 'none' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        pulseRing: { '0%': { boxShadow: '0 0 0 0 rgb(var(--accent) / .45)' }, '70%': { boxShadow: '0 0 0 10px rgb(var(--accent) / 0)' }, '100%': { boxShadow: '0 0 0 0 rgb(var(--accent) / 0)' } },
      },
      animation: {
        in: 'in .18s ease-out both',
        pop: 'pop .16s ease-out both',
        slide: 'slide .22s cubic-bezier(.22,1,.36,1) both',
        shimmer: 'shimmer 1.6s infinite',
        ring: 'pulseRing 2s infinite',
      },
    },
  },
  plugins: [],
}
