const path = require("path");
const { defineConfig, loadEnv } = require("vite");
const tailwindcss = require("@tailwindcss/vite").default;

module.exports = defineConfig(({ mode }) => {
    const projectRoot = path.resolve(__dirname, "..");
    const env = loadEnv(mode, projectRoot, "");
    const backendTarget = process.env.BACKEND_URL || env.BACKEND_URL || "http://127.0.0.1:3000";

    return {
        envDir: projectRoot,
        plugins: [tailwindcss()],
        server: {
            proxy: {
                "/api": backendTarget,
                "/signup": backendTarget,
                "/signin": backendTarget,
                "/forgot-password": backendTarget,
                "/reset-password": backendTarget,
                "/notes": backendTarget,
                "/history": backendTarget,
                "/google": backendTarget
            }
        },
        build: {
            outDir: path.resolve(__dirname, "dist"),
            emptyOutDir: true
        }
    };
});
