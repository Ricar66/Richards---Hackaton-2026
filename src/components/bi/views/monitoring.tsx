"use client";
import { useState } from "react";
import { LiveSensorTiles } from "../live-sensors";
import { FixtureActivityPanel } from "../fixture-activity-panel";
import { Activity, Droplets, Gauge, MoonStar } from "lucide-react";
import { estimateContinuousFlow } from "@/modules/monitoring/domain/water-loss-estimate";
import type { DashboardDTO } from "@/modules/analytics/domain/dashboard";
import { dateBR, numBR } from "@/lib/format";
import { useDashboard } from "../hooks";
import { useShell } from "../shell";
import { GlobalFilters } from "../filters";
import { FlowChart, Heatmap, SeriesTable, TableToggle, VolumeChart } from "../charts";
import { Delta, Footnote, KpiTile, PageHeader, Panel, ProvenanceBanner, StaleBanner, Tag } from "../primitives";
import { CONNECTIVITY_LABEL, CONNECTIVITY_TONE, FLOW, FLOW_AVG } from "../labels";

export function DeviceTable({ data }: { data: DashboardDTO }) {
  return <div className="table-scroll">
    <table className="data-table">
      <caption className="sr-only">Dispositivos e leituras no período</caption>
      <thead><tr><th scope="col">Sensor</th><th scope="col">Comunicação</th><th scope="col">Último contato</th><th scope="col" className="num">Leituras</th><th scope="col" className="num">Volume (L)</th><th scope="col">Regra de alerta</th><th scope="col" className="num">Calibração</th></tr></thead>
      <tbody>{data.devices.map(d => <tr key={d.id}>
        <td className="nowrap"><b>{d.code}</b><small className="cell-sub">{d.label} · {d.siteName}</small></td>
        <td><Tag tone={CONNECTIVITY_TONE[d.connectivity]}>{CONNECTIVITY_LABEL[d.connectivity]}</Tag></td>
        <td className="nowrap">{d.lastSeen ? dateBR(d.lastSeen) : "nunca"}</td>
        <td className="num">{d.samples}</td>
        <td className="num">{d.liters === null ? "—" : numBR(d.liters, 1)}</td>
        <td>≥ {numBR(d.minFlowLpm, 2)} L/min por {d.continuousSeconds} s</td>
        <td className="num">{numBR(d.pulsesPerLiter, 0)} pulsos/L</td>
      </tr>)}</tbody>
    </table>
  </div>;
}

export function Monitoring({ initial }: { initial: DashboardDTO }) {
  const { data, stale } = useDashboard(initial);
  const { openInterval, openOccurrence } = useShell();
  const [table, setTable] = useState(false);
  // Cenário educativo: não representa economia ou vazamento medido.
  const [assumedFlow, setAssumedFlow] = useState("1");
  const [hoursPerDay, setHoursPerDay] = useState("24");
  const [days, setDays] = useState("30");
  const [tariff, setTariff] = useState("10");
  const exposure = estimateContinuousFlow({
    flowLpm: Number(assumedFlow), hoursPerDay: Number(hoursPerDay),
    days: Number(days), effectiveRateBRLPerM3: Number(tariff),
  });
  const k = data.kpis;
  const measuredNightCost = data.filter.source === "DEVICE" && k.nightLiters !== null && Number.isFinite(Number(tariff)) && Number(tariff) >= 0 && Number(tariff) <= 1000 ? Math.round(k.nightLiters * Number(tariff)) / 1000 : null;
  const withData = data.series.filter(p => p.samples > 0).length;
  const nightShare = k.observedLiters && k.nightLiters !== null ? (k.nightLiters / k.observedLiters) * 100 : null;
  const onBucket = (p: { t: number; end: number }) => openInterval({ start: p.t, end: p.end });

  return <>
    <PageHeader kicker="Telemetria ESP32 · YF-S201" title="Monitoramento hídrico">Volume e vazão do recorte, com o limiar de cada regra e as janelas de evidência das ocorrências.</PageHeader>
    <GlobalFilters data={data} />
    <StaleBanner since={stale} />
    <ProvenanceBanner p={data.provenance} />
    <LiveSensorTiles />
    <FixtureActivityPanel siteId={data.filter.siteId} deviceId={data.filter.deviceId} />
    <div className="kpi-grid">
      <KpiTile label="Volume observado" icon={<Droplets size={15} />} value={k.observedLiters} unit=" L" foot="soma das leituras do recorte">
        <Delta current={k.observedLiters} previous={k.previousLiters} previousSamples={k.previousSamples} samples={data.provenance.samples} label="período anterior" />
      </KpiTile>
      <KpiTile label="Pico de vazão" icon={<Gauge size={15} />} value={k.peakFlowLpm} digits={2} unit=" L/min"
        foot={data.threshold ? `limiar da regra: ${numBR(data.threshold.minFlowLpm, 2)} L/min` : "sensores com regras diferentes"} />
      <KpiTile label="Volume na madrugada" icon={<MoonStar size={15} />} value={k.nightLiters} unit=" L"
        foot={<>0h–5h, horário de Brasília{nightShare !== null ? ` · ${numBR(nightShare, 1)}% do volume` : ""}</>} />
      <KpiTile label="Cobertura de leituras" icon={<Activity size={15} />} value={data.series.length ? (withData / data.series.length) * 100 : null} digits={0} unit="%"
        foot={`${withData} de ${data.series.length} intervalos com leitura · lacuna não vira zero`} />
    </div>

    <Panel id="p-school" title="Escolas e negócios · custo de uma descarga com fluxo contínuo" caption="Cenário hipotético independente das leituras. Não equivale a vazamento confirmado nem a economia realizada.">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))", gap: 12 }}>
        {([
          ["Vazão (L/min)", assumedFlow, setAssumedFlow, "0.01", "0.01", "50"],
          ["Horas por dia", hoursPerDay, setHoursPerDay, "0.5", "0.5", "24"],
          ["Dias", days, setDays, "1", "1", "31"],
          ["Tarifa de exemplo (R$/m³)", tariff, setTariff, "0.01", "0", "1000"],
        ] as const).map(([title, value, change, step, min, max]) =>
          <label key={title} className="field-label">{title}
            <input type="number" inputMode="decimal" value={value} min={min} max={max} step={step}
              onChange={e => change(e.target.value)} aria-label={title} style={{ display: "block", width: "100%", marginTop: 6 }} />
          </label>)}
      </div>
      <div className="kpi-grid" style={{ marginTop: 16 }}>
        <KpiTile label="Volume do cenário" icon={<Droplets size={15} />} value={exposure?.liters ?? null} digits={0} unit=" L"
          foot={exposure ? `${numBR(exposure.cubicMeters, 2)} m³ no período assumido` : "Informe valores válidos"} />
        <KpiTile label="Custo hipotético" icon={<Gauge size={15} />} value={exposure?.estimatedCostBRL ?? null} digits={2} unit=" R$"
          foot="Cálculo linear com tarifa informada · não é fatura nem economia comprovada" />
        <KpiTile label="Valor indicativo do volume noturno" icon={<MoonStar size={15} />} value={measuredNightCost} digits={2} unit=" R$"
          foot="Requer filtro Origem = Sensor · valor do volume medido, não desperdício ou economia" />
      </div>
      <p className="info-note">Exemplo inicial: 1 L/min continuamente por 24 h, durante 30 dias = 43,2 m³. R$ 10/m³ é apenas tarifa ilustrativa; substitua pela tarifa efetiva de água e esgoto da fatura. A cobrança real pode ter faixas e componentes adicionais. Só inspeção confirma defeito. <b>Atenção:</b> 1 L/min pode estar abaixo do limiar padrão de alerta (ex.: 1,5 L/min), dependendo do sensor. Ajustes exigem calibração e teste físico.</p>
      <p className="muted-text small"><b>Vaso entupido:</b> medidor de vazão não detecta obstrução com segurança. Exige inspeção e, para alerta automático de transbordamento, sensor adicional de nível/presença de água.</p>
    </Panel>

    <Panel id="p-sync" title="Volume e vazão no mesmo período" caption="Gráficos separados (grandezas diferentes) e sincronizados. Faixas no gráfico de vazão são janelas de evidência de ocorrências."
      actions={<TableToggle on={table} onChange={setTable} />}>
      {table ? <SeriesTable data={data} /> : <>
        <div className="chart-title"><span><i className="lg-area" />Volume por intervalo (L)</span></div>
        <VolumeChart data={data} height={230} syncId="monitor" brush={false} onBucket={onBucket} onMarker={openOccurrence} />
        <div className="chart-title"><span><i className="lg-line" style={{ background: FLOW }} />Vazão máxima (L/min)</span><span><i className="lg-line" style={{ background: FLOW_AVG }} />Vazão média</span><span><i className="lg-dash" />Limiar da regra</span></div>
        <FlowChart data={data} height={250} syncId="monitor" onBucket={onBucket} />
      </>}
    </Panel>

    <div className="grid-main">
      <Panel id="p-heat-m" title="Consumo médio por hora e dia da semana" caption="Média de litros por hora nos dias com leitura (horário de Brasília).">
        <Heatmap cells={data.heatmap} />
      </Panel>
      <Panel id="p-method" title="Como ler estes números">
        <ul className="method">
          <li><b>Volume observado</b> é a soma de <code>deltaLiters</code> enviados pelo sensor. Não é economia nem desperdício comprovado.</li>
          <li><b>Ocorrência</b> abre quando a vazão fica ≥ limiar por todo o tempo da regra, com no máximo 45 s entre leituras.</li>
          <li><b>Lacunas</b> (sem leitura) aparecem como falha na linha, nunca como zero.</li>
          <li><b>Origem</b>: sensor, simulado e manual são separados pelo filtro e carimbados em toda a tela e no PDF.</li>
        </ul>
      </Panel>
    </div>
    <Panel id="p-devices-m" title="Sensores no recorte"><DeviceTable data={data} /></Panel>
    <Footnote data={data} />
  </>;
}
