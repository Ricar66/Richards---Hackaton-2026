import { Suspense } from "react";
import { BiShell } from "@/components/bi/shell";
import { LiveStreamProvider } from "@/components/bi/live-stream";
/** Shell persistente (navegação, sinal ao vivo, gavetas de investigação) entre as telas do BI. O stream fica por fora: não reconecta ao trocar de tela. */
export default function BiLayout({ children }: { children: React.ReactNode }) {
  return <LiveStreamProvider><Suspense><BiShell>{children}</BiShell></Suspense></LiveStreamProvider>;
}
