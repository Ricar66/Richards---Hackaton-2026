import type { Metadata, Viewport } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
// Fontes empacotadas no build (sem requisição ao Google em tempo de uso). Plus Jakarta Sans é a identidade herdada do V3.
const body = Inter({ subsets: ["latin"], variable: "--font-body", display: "swap" });
const display = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-display", display: "swap" });
export const metadata: Metadata = {
  title: "RICHARDS Intelligence | Monitoramento hidráulico",
  description: "Vazão de água, mapa hidráulico e investigação com IoT",
};
/** Tema escuro "sala de operação": controles nativos (select, data, rolagem) e barra do navegador no mesmo tom. */
export const viewport: Viewport = { colorScheme: "dark", themeColor: "#071217" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="pt-BR" className={`${body.variable} ${display.variable}`}><body>{children}</body></html>;
}
