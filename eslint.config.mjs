import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
// workspace.tsx: UI V1 legada, não importada por nenhuma rota (substituída por workspace-v2). Remover só com autorização.
export default defineConfig([...nextVitals, ...nextTs, globalIgnores([".next/**", "src/generated/**", "next-env.d.ts", "src/components/workspace.tsx"])]);
