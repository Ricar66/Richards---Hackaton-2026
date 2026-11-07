import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
export const metadata: Metadata = { title: "Convite QR Code · RICHARDS Intelligence" };
/**
 * QR estático sem token para a VPS oficial do hackathon. Se a URL mudar, atualize o PNG
 * com scripts/entrega/gerar_qr_plateia.py e esta URL no MESMO commit.
 */
const PUBLIC_URL = "http://187.77.229.205:8090/plateia";
export default function Page() {
  return <section style={{ maxWidth: 940, margin: "0 auto", padding: "28px 14px 60px" }}>
    <p style={{ color: "#86eabf", letterSpacing: ".14em", fontSize: 12, fontWeight: 750 }}>EXPERIÊNCIA INTERATIVA · HACKATHON SENAC 2026</p>
    <h1 style={{ fontSize: "clamp(28px, 4vw, 44px)", margin: "14px 0", letterSpacing: "-.04em" }}>A plateia também participa.</h1>
    <p style={{ fontSize: 16, color: "#bad0cc", maxWidth: 670 }}>Projete este QR Code: o visitante acompanha cada leitura no celular, sem senha e sem acessar o BI administrativo.</p>
    <div style={{ display: "flex", gap: 28, flexWrap: "wrap", alignItems: "center", background: "linear-gradient(125deg,#10312a,#111f25)", border: "1px solid #31564f", borderRadius: 20, padding: 24, marginTop: 28 }}>
      <div style={{ background: "#fff", padding: 14, borderRadius: 15, flexShrink: 0, width: 274, height: 274 }}>
        <Image src="/qr-plateia.svg" alt="QR Code para acessar a plateia ao vivo" width={246} height={246} priority unoptimized style={{ width: "100%", height: "100%" }} />
      </div>
      <div style={{ flex: "1 1 260px", minWidth: 0 }}>
        <p style={{ color: "#95e6c2", fontSize: 11, letterSpacing: ".14em" }}>APONTE A CÂMERA DO CELULAR</p>
        <h2 style={{ fontSize: 30, lineHeight: 1.15, margin: "8px 0 12px" }}>Veja os sensores em tempo real.</h2>
        <p>Vazão de água em tempo real. Dados físicos e simulados sempre identificados.</p>
        <a href={PUBLIC_URL} target="_blank" rel="noopener noreferrer" style={{ color: "#8aecc4", overflowWrap: "anywhere" }}>{PUBLIC_URL}</a>
        <p style={{ marginTop: 16 }}><Link href="/plateia" style={{ color: "#a5cdff" }}>Abrir prévia neste servidor</Link></p>
      </div>
    </div>
    <p style={{ color: "#a7c2bc", marginTop: 20 }}>QR destinado à VPS oficial na porta 8090, não ao localhost. Validar a leitura em 4G e na rede do evento antes da apresentação.</p>
  </section>;
}
