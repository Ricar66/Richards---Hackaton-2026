"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { notifyDataChanged } from "./hooks";
import { Activity, CalendarDays, Droplets, ShieldAlert, WifiOff } from "lucide-react";
import type { FixtureActivityItem, FixtureActivityResponse } from "@/modules/monitoring/application/get-fixture-activity";
import { dateBR, numBR } from "@/lib/format";
import { EmptyState, Panel, Seal, Tag } from "./primitives";

type FetchState = "loading" | "ready" | "error";
const STATE_LABEL = {
  FLOW_OBSERVED: { label: "Fluxo registrado", tone: "info" as const },
  NO_FLOW_OBSERVED: { label: "Sem fluxo mensurável em 72h", tone: "neutral" as const },
  INSUFFICIENT_DATA: { label: "Cobertura insuficiente", tone: "neutral" as const },
  NO_SIGNAL: { label: "Sem comunicação confiável", tone: "warn" as const },
};

function Observation({ item, dedicated, expectedUse }: { item: FixtureActivityItem; dedicated: boolean; expectedUse: boolean }) {
  const state = STATE_LABEL[item.state];
  const needsInspection = dedicated && expectedUse && item.state === "NO_FLOW_OBSERVED";
  return <>
    <div className="fixture-result">
      <div>
        <strong>{item.deviceLabel}</strong>
        <span>{item.deviceCode} · {item.siteName}</span>
      </div>
      <Tag tone={needsInspection ? "warn" : state.tone}>{needsInspection ? "Sugerir vistoria presencial" : state.label}</Tag>
    </div>
    <div className="fixture-metrics">
      <div><span>Cobertura de telemetria</span><strong>{numBR(item.coveragePercent, 1)}%</strong><small>72h · registros de sensor físico</small></div>
      <div><span>Último fluxo mensurável</span><strong>{item.lastFlowAt ? dateBR(item.lastFlowAt) : "Não observado"}</strong><small>≥ {numBR(item.thresholdLpm, 1)} L/min · janela de 72h</small></div>
      <div><span>Volume medido na madrugada</span><strong>{item.samples ? `${numBR(item.nightLiters)} L` : "Sem dados"}</strong><small>0h–5h de Brasília · não é perda confirmada</small></div>
      <div><span>Volume medido no fim de semana</span><strong>{item.samples ? `${numBR(item.weekendLiters)} L` : "Sem dados"}</strong><small>Últimas 72h · pode haver uso legítimo</small></div>
    </div>
    {needsInspection ? <p className="fixture-warning" role="status"><ShieldAlert size={17} />
      Há cobertura de dados suficiente e não houve fluxo mensurável nas últimas 72h. Como este sensor foi declarado dedicado e havia uso esperado, verifique no local: ponto desativado, mecanismo com defeito, falta de abastecimento, obstrução ou problema na instalação. <b>Isso não confirma entupimento.</b>
    </p> : <p className="fixture-hint">
      {item.state === "NO_FLOW_OBSERVED" ? "O sistema só observou ausência de fluxo. Se não havia alunos ou usuários no período, isso pode ser normal. Confirme sensor dedicado e ocupação esperada para avaliar necessidade de vistoria." :
       item.state === "NO_SIGNAL" ? "Dispositivo sem comunicação atual. Ausência de pacotes jamais comprova falta de uso: primeiro restabeleça a telemetria." :
       item.state === "INSUFFICIENT_DATA" ? "Há lacunas ou amostragem insuficiente. Não é possível concluir que a descarga não foi utilizada." :
       "Houve fluxo mensurável. Isso pode ser um acionamento normal ou fluxo contínuo; a curva e as ocorrências precisam ser analisadas para diferenciar."}
    </p>}
  </>;
}

/**
 * Não agenda alertas nem diagnostica entupimento: observação apoiada em amostras reais
 * e em duas declarações humanas (ponto dedicado + ocupação esperada).
 */
export function FixtureActivityPanel({ siteId, deviceId }: { siteId: string | null; deviceId: string | null }) {
  const [state, setState] = useState<FetchState>("loading");
  const [items, setItems] = useState<FixtureActivityItem[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [dedicated, setDedicated] = useState(false);
  const [expectedUse, setExpectedUse] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [inspectionError, setInspectionError] = useState("");
  const [inspectionId, setInspectionId] = useState("");
  // Filtro novo zera a seleção DURANTE a renderização (padrão do React para "ajustar estado quando a prop muda"),
  // não dentro do efeito: setState síncrono no efeito provoca renderização em cascata (react-hooks/set-state-in-effect).
  const filterKey = `${siteId ?? ""}|${deviceId ?? ""}`;
  const [shownFilter, setShownFilter] = useState(filterKey);
  if (shownFilter !== filterKey) {
    setShownFilter(filterKey); setSelectedId(""); setDedicated(false); setExpectedUse(false);
    setInspectionError(""); setInspectionId(""); setState("loading");
  }
  useEffect(() => {
    let active = true;
    const ctrl = new AbortController();
    const params = new URLSearchParams();
    if (siteId) params.set("siteId", siteId);
    if (deviceId) params.set("deviceId", deviceId);
    const query = params.toString();
    async function refresh() {
      if (!active) return;
      try {
        const response = await fetch(`/api/monitoring/fixture-activity${query ? `?${query}` : ""}`, { cache: "no-store", signal: ctrl.signal });
        if (!response.ok) throw new Error(String(response.status));
        const result = await response.json() as FixtureActivityResponse;
        if (active) { setItems(result.items); setState("ready"); }
      } catch {
        if (active && !ctrl.signal.aborted) { setState("error"); setItems([]); }
      }
    }
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 60_000);
    return () => { active = false; ctrl.abort(); window.clearInterval(timer); };
  }, [siteId, deviceId]);

  const chosen = items.find(item => item.deviceId === selectedId) ?? null;
  const canRequest = Boolean(chosen && dedicated && expectedUse && chosen.state === "NO_FLOW_OBSERVED");
  async function requestInspection() {
    if (!chosen || !canRequest || requesting) return;
    setRequesting(true); setInspectionError(""); setInspectionId("");
    try {
      const response = await fetch("/api/monitoring/fixture-inspections", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: chosen.deviceId, dedicated: true, expectedUse: true }),
      });
      const result = await response.json() as { id?: string; error?: string };
      if (!response.ok || !result.id) throw new Error(result.error || "Falha ao registrar vistoria");
      setInspectionId(result.id); notifyDataChanged();
    } catch (e) { setInspectionError(e instanceof Error ? e.message : "Não foi possível registrar a inspeção"); }
    finally { setRequesting(false); }
  }
  return <Panel id="p-fixture-activity" className="fixture-panel"
    eyebrow="Escolas, instituições e pequenos negócios"
    title="Descargas e pontos hidráulicos · 72 horas de observação"
    caption="Fluxo contínuo pode representar desperdício. Sem fluxo por dias pode indicar falta de uso ou necessidade de inspeção, mas não comprova entupimento.">
    <div className="fixture-intro">
      <span><Droplets size={17} /> Fluxo contínuo → investigar possível desperdício</span>
      <span><CalendarDays size={17} /> Sem fluxo registrado → avaliar uso esperado</span>
      <span><WifiOff size={17} /> Sem comunicação → não concluir ausência de uso</span>
    </div>
    {state === "loading" && <p className="muted-text" role="status">Consultando as leituras físicas das últimas 72 horas…</p>}
    {state === "error" && <p className="form-error" role="alert">Não foi possível consultar a telemetria de atividade. A análise está indisponível; não presuma ausência de uso.</p>}
    {state === "ready" && !items.length && <EmptyState title="Nenhum sensor de vazão neste recorte">A análise exige um medidor de vazão cadastrado. Não é possível observar uso de descargas sem um sensor instalado no ponto correto.</EmptyState>}
    {state === "ready" && items.length > 0 && <>
      <div className="fixture-controls">
        <label className="fixture-select">Ponto a verificar
          <select value={selectedId} onChange={e => { setSelectedId(e.target.value); setDedicated(false); setExpectedUse(false); setInspectionError(""); setInspectionId(""); }}>
            <option value="">Selecione um sensor de vazão</option>
            {items.map(item => <option key={item.deviceId} value={item.deviceId}>{item.deviceLabel} · {item.siteName}</option>)}
          </select>
        </label>
        <div className="fixture-conditions">
          <label><input type="checkbox" checked={dedicated} onChange={e => setDedicated(e.target.checked)} disabled={!chosen} />
            O sensor é dedicado e calibrado para esta descarga ou este ponto</label>
          <label><input type="checkbox" checked={expectedUse} onChange={e => setExpectedUse(e.target.checked)} disabled={!chosen} />
            Havia uso esperado nas últimas 72 horas (não eram férias ou fechamento)</label>
        </div>
      </div>
      {chosen ? <>
        <Observation item={chosen} dedicated={dedicated} expectedUse={expectedUse} />
        {canRequest && <div className="fixture-actions">
          <button type="button" className="btn primary" disabled={requesting || Boolean(inspectionId)}
            onClick={() => void requestInspection()}>
            <ShieldAlert size={15} /> {requesting ? "Registrando…" : inspectionId ? "Vistoria registrada" : "Registrar pedido de vistoria"}
          </button>
          {inspectionId && <Link href="/ocorrencias" className="link">Ver ocorrência aberta</Link>}
        </div>}
        {inspectionError && <p className="form-error" role="alert">{inspectionError}</p>}
      </> :
        <p className="fixture-hint">Selecione o sensor para examinar cobertura, último fluxo e consumo fora de horários usuais. A conclusão exige confirmar fisicamente o ponto monitorado.</p>}
    </>}
    <div className="fixture-method"><Activity size={15} />
      Os indicadores usam exclusivamente leituras <Seal source="DEVICE" />, nunca dados simulados, independentemente do filtro do gráfico. São observações, não notificações automáticas. O limiar de 0,2 L/min é provisório: leituras abaixo da sensibilidade/calibração do sensor podem não ser detectadas.
    </div>
  </Panel>;
}
