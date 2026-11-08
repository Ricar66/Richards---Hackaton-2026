"use client";
import { Printer } from "lucide-react";
export function PrintButton() {
  return <button type="button" className="lbl-print" onClick={() => window.print()}><Printer size={16} aria-hidden="true" /> Imprimir etiqueta</button>;
}
