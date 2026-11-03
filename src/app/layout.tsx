import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
 title:"RICHARDS Intelligence | BI de recursos, ocorrências e impacto", description:"Observabilidade operacional, prevenção e impacto social com IoT",
};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="pt-BR"><body>{children}</body></html>}
