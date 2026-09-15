/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        void: "#07090f",
        panel: "#0b0f19",
        grid: "#111827",
        neon: {
          cyan: "#00f0ff",
          magenta: "#ff2bd6",
          lime: "#b6ff00",
          amber: "#ffb000",
          red: "#ff3b5c",
        },
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', '"IBM Plex Mono"', "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        "neon-cyan": "0 0 8px #00f0ff, 0 0 24px rgba(0,240,255,0.35)",
        "neon-magenta": "0 0 8px #ff2bd6, 0 0 24px rgba(255,43,214,0.35)",
        "neon-lime": "0 0 8px #b6ff00, 0 0 24px rgba(182,255,0,0.35)",
      },
      keyframes: {
        pulseGlow: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.55" },
        },
        blink: { "0%, 100%": { opacity: "1" }, "50%": { opacity: "0" } },
      },
      animation: {
        pulseGlow: "pulseGlow 1.6s ease-in-out infinite",
        blink: "blink 1s step-end infinite",
      },
    },
  },
  plugins: [],
};
