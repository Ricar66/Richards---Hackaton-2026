import { renderSVG } from "uqr";
/**
 * QR do passaporte em SVG, gerado no servidor (a biblioteca não vai para o navegador). Correção M (~15%): aguenta
 * etiqueta amassada sem engordar o código. Escuro sobre branco: leitores de celular falham com QR invertido.
 */
export const passportQrSvg = (url: string) => renderSVG(url, { ecc: "M", border: 2, pixelSize: 8, whiteColor: "#ffffff", blackColor: "#071217" });
