import { defineConfig } from "vite";

// Relative base so the build works under https://<user>.github.io/<repo>/
export default defineConfig({
  base: "./",
  define: {
    // 构建日期（用于页脚“更新”日期，而不是页面打开时间）
    __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
