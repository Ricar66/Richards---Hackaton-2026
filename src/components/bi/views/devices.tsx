"use client";
import { Cpu, PlugZap, Wifi, WifiOff } from "lucide-react";
import type { DashboardDTO } from "@/modules/analytics/domain/dashboard";
import { agoBR, dateBR, numBR } from "@/lib/format";
import { useDashboard, useNow } from "../hooks";
import { GlobalFilters } from "../filters";
import { EmptyState, Footnote, PageHeader, Panel, StaleBanner, Tag } from "../primitives";
import { CONNECTIVITY_LABEL, CONNECTIVITY_TONE } from "../labels";
import { DeviceTable } from "./monitoring";

export function Devices({ initial }: { initial: DashboardDTO }) {
  const { data, stale } = useDashboard(initial);
  const now = useNow();
  return <>
    <PageHeader kicker="Infraestrutura IoT" title="Dispositivos">Estado de comunicação calculado pelo último pacote recebido (mais de 120 s sem leitura = sem comunicação). Manutenção é decisão humana.</PageHeader>
    <GlobalFilters data={data} showDevice={false} />
    <StaleBanner since={stale} />
    <div className="grid-main">
    {data.devices.length ? <div className="device-cards">
      {data.devices.map(d => <article key={d.id} className={`device-card ${d.connectivity.toLowerCase()}`}>
        <header>
          <span className="device-ico">{d.connectivity === "ONLINE" ? <Wifi size={18} /> : d.connectivity === "NEVER_SEEN" ? <PlugZap size={18} /> : <WifiOff size={18} />}</span>
          <div><b>{d.code}</b><small>{d.label} · {d.siteName}</small></div>
          <Tag tone={CONNECTIVITY_TONE[d.connectivity]}>{CONNECTIVITY_LABEL[d.connectivity]}</Tag>
        </header>
        <dl className="facts">
          <div><dt>Último contato</dt><dd>{d.lastSeen ? <>{now === null ? dateBR(d.lastSeen) : agoBR(new Date(d.lastSeen).getTime(), now)}<small>{dateBR(d.lastSeen)}</small></> : "nenhum pacote recebido"}</dd></div>
          <div><dt>Leituras no período</dt><dd>{d.samples}<small>{d.liters === null ? "sem volume" : `${numBR(d.liters, 1)} L`}</small></dd></div>
          <div><dt>Regra de alerta</dt><dd>≥ {numBR(d.minFlowLpm, 2)} L/min<small>por {d.continuousSeconds} s contínuos</small></dd></div>
          <div><dt>Calibração</dt><dd>{numBR(d.pulsesPerLiter, 0)}<small>pulsos por litro (YF-S201)</small></dd></div>
        </dl>
        <p className="muted-text small">Versão de firmware não é enviada pelo dispositivo hoje; não exibimos valor presumido.</p>
      </article>)}
    </div> : <EmptyState title="Nenhum dispositivo cadastrado" icon={<Cpu size={18} />} />}
      <Panel id="p-dev-contract" title="Como o ESP32 fala com a plataforma">
        <ul className="method">
          <li><code>POST /api/iot/telemetry</code> com <code>x-device-key</code> (chave por dispositivo, guardada só como hash).</li>
          <li>Cada leitura leva <code>bootId</code> + <code>sequence</code>: reenvio não duplica volume.</li>
          <li>Sem rede, o firmware guarda até 12 leituras e reenvia em ordem; 503 é temporário, 401 espera 30 s.</li>
          <li>Relógio do ESP32 fora de ±5 min é recusado (sem NTP não há leitura confiável).</li>
        </ul>
      </Panel>
    </div>
    <Panel id="p-dev-table" title="Leituras por sensor no período"><DeviceTable data={data} /></Panel>
    <Footnote data={data} />
  </>;
}
