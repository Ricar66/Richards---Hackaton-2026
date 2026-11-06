"use client";
import { Component, type ReactNode } from "react";

/**
 * Error boundary do 3D: erro de render da cena ou falha ao baixar o pedaço do three (ChunkLoadError) somem daqui e o
 * slot mostra o SVG, que já estava montado por baixo. Classe própria (o React ainda não tem boundary em hook).
 */
export class TwinBoundary extends Component<{ onFail(): void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFail(); }
  render() { return this.state.failed ? null : this.props.children; }
}
