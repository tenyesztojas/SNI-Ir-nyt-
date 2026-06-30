import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        sni: {
          bg: "#FAF8F4",
          blue: "#CFE3E8",
          bluedark: "#5B8A99",
          green: "#D9E8D6",
          greendark: "#5C8A5C",
          beige: "#F1E7D8",
          text: "#2E2E2E",
          warn: "#B65C3D",
          brand: {
            teal: "#34D8C3",
            blue: "#1C8AA8",
            navy: "#123A5C",
          },
        },
      },
      borderRadius: {
        xl2: "1.25rem",
      },
      fontFamily: {
        sans: [
          "Nunito",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
      },
      boxShadow: {
        soft: "0 2px 8px -2px rgba(18, 58, 92, 0.10), 0 8px 24px -8px rgba(18, 58, 92, 0.12)",
        softHover: "0 4px 14px -2px rgba(18, 58, 92, 0.14), 0 14px 32px -10px rgba(18, 58, 92, 0.18)",
      },
    },
  },
  plugins: [],
};
export default config;
