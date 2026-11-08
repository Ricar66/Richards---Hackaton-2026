import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { DEMO_ORG_ID } from "@/lib/constants";
import { dateBR, numBR } from "@/lib/format";
import { isLoopbackUrl, publicBaseUrl } from "@/lib/public-url";
import { passportCode, passportPath } from "@/modules/donations/domain/passport";
import { passportQrSvg } from "@/modules/donations/infrastructure/passport-qr";
import { PrintButton } from "./print-button";
import "./etiqueta.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Etiqueta do lote · RICHARDS", robots: { index: false, follow: false } };

/** Etiqueta do lote com o QR do Passaporte do Alimento. Privada (senha do operador): quem tem o QR tem o link. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lot = await getDb().donationBatch.findFirst({ where: { id, organizationId: DEMO_ORG_ID }, include: { organization: { select: { name: true } } } });
  if (!lot) notFound();
  if (!lot.passportToken) return <main className="lbl"><p className="lbl-warn">Este lote ainda não tem passaporte. Emita na gaveta do lote, em Doações.</p></main>;
  const url = publicBaseUrl(await headers()) + passportPath(lot.passportToken);
  return <main className="lbl">
    <div className="lbl-actions">
      <PrintButton />
      {isLoopbackUrl(url) && <p className="lbl-warn" role="alert">O QR aponta para {new URL(url).host}: celular não abre esse endereço. Abra o BI pelo IP da rede (ex.: http://192.168.x.x:3000) ou defina RICHARDS_PUBLIC_URL e gere de novo.</p>}
    </div>
    <article className="lbl-card" aria-label="Etiqueta do lote">
      {/* SVG gerado no servidor e entregue como imagem (data URI): nenhum HTML bruto entra na página. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- QR local em data URI; next/image não otimiza SVG. */}
      <img className="lbl-qr" src={`data:image/svg+xml;utf8,${encodeURIComponent(passportQrSvg(url))}`} alt="QR do Passaporte do Alimento deste lote" width={296} height={296} />
      <div className="lbl-info">
        <small>Passaporte do Alimento</small>
        <b className="lbl-kg">{numBR(Number(lot.weightKg), 2)} kg</b>
        <p className="lbl-desc">{lot.description}</p>
        <p>{lot.organization.name}</p>
        <p>{dateBR(lot.createdAt)}</p>
        <p className="lbl-code">Lote {passportCode(lot.passportToken)}</p>
        {lot.source === "SIMULATED" && <p className="lbl-sim">SIMULADO · não é alimento real</p>}
        <p className="lbl-hint">Escaneie para ver origem, temperatura, triagem e destino.</p>
      </div>
    </article>
  </main>;
}
