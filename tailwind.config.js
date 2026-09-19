/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cyber: {
          bg: "#080c14",
          card: "rgba(13, 20, 36, 0.75)",
          border: "rgba(30, 58, 95, 0.5)",
          cyan: "#00f0ff",
          blue: "#0066ff",
          lime: "#00ff66",
          amber: "#ffaa00",
          rose: "#ff0055",
          purple: "#9933ff",
        },
      },
      boxShadow: {
        'cyan-glow': '0 0 15px rgba(0, 240, 255, 0.4)',
        'lime-glow': '0 0 15px rgba(0, 255, 102, 0.4)',
        'rose-glow': '0 0 15px rgba(255, 0, 85, 0.4)',
        'amber-glow': '0 0 15px rgba(255, 170, 0, 0.4)',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Courier New', 'monospace'],
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

