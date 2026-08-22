/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          background: '#fcf8f8',
          accent: '#994d51',
          secondary: '#f3e7e8',
        }
      }
    },
  },
  plugins: [],
}
