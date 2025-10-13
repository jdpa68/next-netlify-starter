/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./pages/**/*.{js,jsx,ts,tsx}",
    "./pages_app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: "#040D2C",
          accent: "#C2AA80"
        }
      },
      borderRadius: {
        "xl": "1rem",
        "2xl": "1.25rem"
      },
      boxShadow: {
        dropdown: "0 10px 25px -5px rgba(0,0,0,0.15), 0 8px 10px -6px rgba(0,0,0,0.12)"
      }
    }
  },
  plugins: []
};
