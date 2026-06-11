/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Neutrals / Surfaces
        bg: "hsl(var(--bg))",
        surface: "hsl(var(--surface))",
        "surface-2": "hsl(var(--surface-2))",
        border: "hsl(var(--border))",
        "border-strong": "hsl(var(--border-strong))",

        // Text
        text: "hsl(var(--text))",
        "text-muted": "hsl(var(--text-muted))",
        "text-faint": "hsl(var(--text-faint))",

        // Brand / Accents
        primary: {
          DEFAULT: "hsl(var(--primary))",
          hover: "hsl(var(--primary-hover))",
          soft: "hsl(var(--primary-soft))",
        },
        wood: "hsl(var(--wood))",
        olive: {
          DEFAULT: "hsl(var(--olive))",
          soft: "hsl(var(--olive-soft))",
        },

        // Semantic States
        success: {
          DEFAULT: "hsl(var(--success))",
          soft: "hsl(var(--success-soft))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          soft: "hsl(var(--warning-soft))",
        },
        error: {
          DEFAULT: "hsl(var(--error))",
          soft: "hsl(var(--error-soft))",
        },
        info: {
          DEFAULT: "hsl(var(--info))",
          soft: "hsl(var(--surface-2))",
        },
      },
      borderRadius: {
        card: "14px",
        button: "10px",
        pill: "999px",
      },
      fontFamily: {
        display: ["Fraunces", "serif"],
        sans: ["Albert Sans", "sans-serif"],
        mono: ["IBM Plex Mono", "monospace"],
      },
      fontSize: {
        display: ["3rem", { lineHeight: "1.15", letterSpacing: "-0.01em" }],
        h1: ["1.75rem", { lineHeight: "1.15", letterSpacing: "-0.01em" }],
        h2: ["1.375rem", { lineHeight: "1.15", letterSpacing: "-0.01em" }],
        h3: ["1.125rem", { lineHeight: "1.15", letterSpacing: "-0.01em" }],
        body: ["0.9375rem", { lineHeight: "1.5" }],
        small: ["0.8125rem", { lineHeight: "1.5" }],
        "mono-small": ["0.8125rem", { lineHeight: "1.5" }],
      },
      spacing: {
        gutter: "32px",
        "gutter-compact": "24px",
        section: "48px",
        "card-padding": "24px",
        "card-padding-compact": "16px",
        "sidebar-expanded": "232px",
        "sidebar-collapsed": "64px",
      },
      maxWidth: {
        content: "1200px",
        settings: "760px",
        welcome: "720px",
        reading: "72ch",
      },
      boxShadow: {
        card: "0 1px 2px rgba(23,21,17,0.04), 0 4px 16px rgba(107,74,45,0.07)",
        "card-hover": "0 2px 4px rgba(23,21,17,0.06), 0 8px 24px rgba(107,74,45,0.1)",
      },
      transitionDuration: {
        micro: "150ms",
        normal: "300ms",
        slow: "600ms",
        "very-slow": "900ms",
      },
      transitionTimingFunction: {
        "ease-out-quint": "cubic-bezier(0.22, 1, 0.36, 1)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        pulse: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.5" },
        },
        shimmer: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        "fade-up": "fade-up 300ms ease-out-quint",
        "fade-in": "fade-in 150ms ease-out",
        pulse: "pulse 2s ease-in-out infinite",
        shimmer: "shimmer 1.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
}
