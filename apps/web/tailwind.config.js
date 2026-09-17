/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        // Restrained neutral palette — warm grays, near-black ink
        bg: '#fafaf9',
        surface: '#ffffff',
        raised: '#f5f5f4',
        ink: '#1c1917',
        'ink-2': '#57534e',
        'ink-3': '#a8a29e',
        line: '#e7e5e4',
        'line-strong': '#d6d3d1',
        // Single accent used sparingly
        accent: {
          DEFAULT: '#0f766e', // teal-700 — quiet, professional
          soft: '#f0fdfa',
          hover: '#115e59',
        },
        success: '#15803d',
        'success-soft': '#f0fdf4',
        warning: '#b45309',
        'warning-soft': '#fffbeb',
        danger: '#b91c1c',
        'danger-soft': '#fef2f2',
      },
      fontSize: {
        // Deliberate type scale — few sizes, consistent
        display: ['1.875rem', { lineHeight: '2.25rem', letterSpacing: '-0.02em', fontWeight: '600' }],
        h1: ['1.5rem', { lineHeight: '2rem', letterSpacing: '-0.02em', fontWeight: '600' }],
        h2: ['1.125rem', { lineHeight: '1.5rem', fontWeight: '600' }],
        h3: ['0.9375rem', { lineHeight: '1.5rem', fontWeight: '600' }],
        body: ['0.875rem', { lineHeight: '1.5rem' }],
        secondary: ['0.8125rem', { lineHeight: '1.25rem' }],
        caption: ['0.75rem', { lineHeight: '1rem' }],
        label: ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.06em', fontWeight: '500' }],
      },
      fontFamily: {
        sans: ['ui-sans-serif', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', '"Helvetica Neue"', 'Arial', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(28 25 23 / 0.04)',
        raised: '0 2px 8px -2px rgb(28 25 23 / 0.10)',
        overlay: '0 8px 30px -4px rgb(28 25 23 / 0.18)',
      },
      maxWidth: {
        content: '72rem',
      },
    },
  },
  plugins: [],
};
