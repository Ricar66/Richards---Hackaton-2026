import type { Metadata } from "next";
import { PlateiaLive } from "@/components/plateia/plateia-live";
import "./plateia.css";
export const metadata: Metadata = {
  title: "Plateia ao vivo · RICHARDS Intelligence",
  description: "Veja a telemetria do experimento IoT do RICHARDS no celular em tempo real.",
  robots: { index: false, follow: false },
};
export default function Page() { return <PlateiaLive />; }
