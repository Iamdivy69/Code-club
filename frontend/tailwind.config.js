export default {
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: {
    fontFamily: { sans: ['Syne', 'sans-serif'], mono: ['JetBrains Mono', 'monospace'] },
    spacing: { 'touch-min': '44px' },
  } },
};
