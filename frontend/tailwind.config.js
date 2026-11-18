/** Couleurs branchées sur les variables CSS (src/styles/tokens.css) : un seul endroit pour l'identité. */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        paper: v('paper'), panel: v('panel'), ink: v('ink'), 'ink-soft': v('ink-soft'), line: v('line'),
        accent: v('accent'), 'accent-soft': v('accent-soft'), gold: v('gold'), 'gold-soft': v('gold-soft'),
        sea: v('sea'), teal: v('teal'), 'teal-soft': v('teal-soft'), danger: v('danger'), 'danger-soft': v('danger-soft'),
        warn: v('warn'), 'warn-soft': v('warn-soft'), ok: v('ok'), 'ok-soft': v('ok-soft'), info: v('info'), 'info-soft': v('info-soft'),
      },
      fontFamily: {
        serif: ['"Iowan Old Style"', '"Palatino Linotype"', 'Palatino', '"Book Antiqua"', 'Georgia', 'serif'],
        sans: ['system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'sans-serif'],
      },
      borderRadius: { DEFAULT: 'var(--radius)', lg: 'var(--radius-lg)' },
      boxShadow: { card: 'var(--shadow-card)', pop: 'var(--shadow-pop)' },
      spacing: { sidebar: 'var(--sidebar-width)' },
    },
  },
  plugins: [],
};
