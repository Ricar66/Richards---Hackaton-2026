"use client";
import { useState } from "react";
import { digitCells } from "./stage-logic";

/**
 * Número que troca por dígito: só a posição que mudou anima (o caractere anterior sai, o novo entra, 220 ms).
 * Nunca há valor intermediário: só o anterior saindo e o medido entrando. O anterior é desenhado em `::before`
 * com texto alternativo vazio (`content: attr(data-prev) / ""`): fica fora do innerText e do leitor de tela, que
 * sempre leem o valor atual. Com "reduzir movimento", o CSS da Sala desliga a animação (troca seca).
 */
export function Digits({ text }: { text: string }) {
  const [cur, setCur] = useState(text);
  const [prev, setPrev] = useState<string | null>(null);
  const [gen, setGen] = useState(0);
  // Estado derivado do valor anterior (padrão do React para "informação do render anterior"), sem ler ref no render.
  if (text !== cur) { setPrev(cur); setCur(text); setGen(g => g + 1); }
  const cells = digitCells(prev, cur);
  return <span className="digits">
    {cells.map((c, i) => c.changed
      ? <span key={`${gen}:${i}`} className="dg on" data-prev={c.prev ?? ""}><span className="dg-in">{c.ch}</span></span>
      : <span key={`=${cells.length}:${i}`} className="dg">{c.ch}</span>)}
  </span>;
}
