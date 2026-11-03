import { Suspense } from "react";
import { BiShell } from "@/components/bi/shell";
/** Shell persistente (navegação, sinal ao vivo, gavetas de investigação) entre as telas do BI. */
export default function BiLayout({ children }: { children: React.ReactNode }) {
  return <Suspense><BiShell>{children}</BiShell></Suspense>;
}
