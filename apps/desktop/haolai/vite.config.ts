import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => ({
  define: {
    'import.meta.env.VITE_DESKTOP_VERSION_URL': JSON.stringify(
      loadEnv(mode, path.resolve(__dirname, '../../..'), 'VITE_').VITE_DESKTOP_VERSION_URL?.trim()
        || 'https://mxtsl8.cn/phoenix-api/desktop/version',
    ),
  },
  base: "./",
  // 与 Web/API 共用 monoenv 生成的根 .env；仅 VITE_ 前缀会公开给桌面前端。
  envDir: path.resolve(__dirname, "../../.."),
  publicDir: false,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    minify: true, // 生产环境启用压缩
    sourcemap: false, // 关闭sourcemap减少体积
    rollupOptions: {
      external: Object.keys({}),
    },
  },
  server: {
    host: "0.0.0.0",
    // 计算器会启动多个 Worker，禁用 HMR 可避免开发更新中途替换模块导致计算任务被销毁。
    // hmr: false,
    // 桌面端独占开发端口，避免与浏览器端 main 工作目录互相加载错误代码。
    port: 12832,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/target/**", "**/*.tmpdir/**"],
    },
  },
}));
