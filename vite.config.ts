import { fileURLToPath, URL } from "node:url";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const configuredBase = env.VITE_APP_BASE_PATH || "/";
  if (!/^\/(?!\/)[^?#\\]*$/.test(configuredBase)) {
    throw new Error("VITE_APP_BASE_PATH 必须为同源绝对子路径，例如 /workflow/");
  }
  const appBase = configuredBase.endsWith("/") ? configuredBase : configuredBase + "/";
  const apiBase = env.VITE_API_BASE_URL?.startsWith("/") && !env.VITE_API_BASE_URL.startsWith("//")
    ? env.VITE_API_BASE_URL.replace(/\/$/, "") : "/api";

  return {
    base: appBase,
    plugins: [vue(), tailwindcss()],
    resolve: {
      alias: [
        {
          find: /^@workflow\/designer\/style\.css$/,
          replacement: fileURLToPath(
            new URL(
              "./packages/workflow-designer/src/style.css",
              import.meta.url,
            ),
          ),
        },
        {
          find: /^@workflow\/designer$/,
          replacement: fileURLToPath(
            new URL(
              "./packages/workflow-designer/src/index.ts",
              import.meta.url,
            ),
          ),
        },
        {
          find: "@",
          replacement: fileURLToPath(new URL("./src", import.meta.url)),
        },
        // { "@": fileURLToPath(new URL("./src", import.meta.url)) },
      ],
    },
    server: {
      host: true,
      port: 5171,
      proxy: {
        [apiBase + "/camunda"]: {
          target: env.CAMUNDA_PROXY_TARGET,
          changeOrigin: true,
          rewrite: (path) => "/engine-rest" + path.slice((apiBase + "/camunda").length),
          ...(env.CAMUNDA_PROXY_AUTH ? { auth: env.CAMUNDA_PROXY_AUTH } : {}),
        },
        [apiBase]: {
          target: env.API_PROXY_TARGET,
          changeOrigin: true,
          rewrite: (path) => "/api" + path.slice(apiBase.length),
          ...(env.API_PROXY_AUTH ? { auth: env.API_PROXY_AUTH } : {}),
        },
      },
    },
  };
});
