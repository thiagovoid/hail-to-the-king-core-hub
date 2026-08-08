/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'bg-base': '#0d1117',
        'bg-surface': '#1a2030',
        'accent-gold': '#f0a500',
        'accent-green': '#00c48c',
        'accent-red': '#e84040',
        // WoW class colors
        'class-death-knight': '#c41e3a',
        'class-demon-hunter': '#a330c9',
        'class-druid': '#ff7c0a',
        'class-evoker': '#33937f',
        'class-hunter': '#aad372',
        'class-mage': '#3fc7eb',
        'class-monk': '#00ff98',
        'class-paladin': '#f48cba',
        'class-priest': '#ffffff',
        'class-rogue': '#fff468',
        'class-shaman': '#0070dd',
        'class-warlock': '#8788ee',
        'class-warrior': '#c69b3a',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      backgroundColor: {
        dark: '#0d1117',
      },
    },
  },
  plugins: [],
};
