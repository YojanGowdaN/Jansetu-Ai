/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        governance: {
          50: '#f0f4f8',
          100: '#d9e2ec',
          500: '#102a43',
          600: '#0b1b2b',
          700: '#07111b',
        },
        saffron: {
          500: '#ff9933',
          600: '#e68a00',
        },
      },
    },
  },
  plugins: [],
};
