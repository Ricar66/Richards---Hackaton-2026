import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
// Fontes empacotadas no build (sem requisição ao Google em tempo de uso). Plus Jakarta Sans é a identidade herdada do V3.
const body = Inter({ subsets: ["latin"], variable: "--font-body", display: "swap" });
const display = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-display", display: "swap" });
export const metadata: Metadata = {
  title: "RICHARDS Intelligence | BI de recursos, ocorrências e impacto",
  description: "Observabilidade operacional, prevenção e impacto social com IoT",
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="pt-BR" className={`${body.variable} ${display.variable}`}><body>{children}</body></html>;
}
