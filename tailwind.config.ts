import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: { 950: "#0a1530", 900: "#0d1b3e", 800: "#13244f", 700: "#1c3266", 600: "#2a4585" },
        gold: { 300: "#f0d18a", 400: "#e3b95c", 500: "#d4a53f", 600: "#b88a2a", 700: "#8f6a1e" },
        ivory: { 50: "#fdfbf6", 100: "#faf7f0", 200: "#f1ebdc" },
        ink: "#1a2238",
      },
      fontFamily: {
        display: ["var(--font-display)", "serif"],
        sans: ["var(--font-body)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
