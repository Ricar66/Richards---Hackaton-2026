/** Fallback SVG, sem motor de animação: a coluna troca apenas com a fração recebida. */
export function ThermalGlyph({ fraction, fresh, simulated, tone = "ok" }: { fraction: number; fresh: boolean; simulated: boolean; tone?: "ok" | "warn" | "danger" }) {
  const level = fresh && Number.isFinite(fraction) ? Math.max(0, Math.min(1, fraction)) : 0;
  const color = fresh ? { ok: "#3fd0a7", warn: "#f2a94a", danger: "#ec6b64" }[tone] : "#41545d";
  return <svg viewBox="0 0 160 240" className="thermal-glyph" aria-hidden="true">
    <defs><linearGradient id="stg-thermal-metal"><stop stopColor="#b2c7cd" /><stop offset=".22" stopColor="#405e69" /><stop offset=".55" stopColor="#162a35" /><stop offset="1" stopColor="#86a7b3" /></linearGradient></defs>
    <ellipse cx="82" cy="222" rx="56" ry="12" fill="#0005" />
    <path d="M38 25 122 13 135 200 52 219Z" fill="#182c36" stroke="#526e7a" strokeWidth="2" />
    <rect x="32" y="15" width="92" height="194" rx="15" fill="url(#stg-thermal-metal)" stroke={simulated ? "#b6a3e2" : "#7d9aa5"} strokeWidth="2" />
    <rect x="78" y="36" width="18" height="138" rx="9" fill="#0b1e27" />
    <rect x="82" y={169 - level * 125} width="10" height={level * 125} rx="5" fill={color} />
    <circle cx="87" cy="177" r="14" fill={color} stroke="#b2c7cd" strokeWidth="3" />
    {Array.from({ length: 9 }, (_, i) => <path key={i} d={`M60 ${48 + i * 14}h10`} stroke="#9cb8c2" strokeWidth="2" />)}
    <rect x="42" y="141" width="25" height="41" rx="3" fill="#377da5" />
    {[0, 1, 2, 3].map(i => <path key={i} d={`M47 ${150 + i * 7}h15`} stroke="#142e3f" strokeWidth="3" />)}
  </svg>;
}
