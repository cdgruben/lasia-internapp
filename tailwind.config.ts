import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        lasia: { 50: "#edfdf3", 100: "#d5f8e2", 600: "#118447", 700: "#0d6639", 900: "#083b23" }
      }
    }
  },
  plugins: []
};

export default config;
