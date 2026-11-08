import type { Metadata } from "next";
import "./passaporte.css";

/**
 * Passaporte do Alimento: página PÚBLICA do lote, aberta pelo QR da etiqueta. Fora do BI (sem BiShell, sem stream).
 * no-referrer: o token não vaza para sites externos no cabeçalho Referer.
 */
export const metadata: Metadata = {
  title: "Passaporte do Alimento · RICHARDS",
  description: "Origem, temperatura de conservação, triagem sanitária e destino de um lote de alimento doado.",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default function PassportLayout({ children }: { children: React.ReactNode }) { return children; }
