import "server-only";
import QRCode from "qrcode";

/** Inline SVG QR code (transparent background). Generated server-side from our own URL. */
export const qrSvg = (text: string) =>
  QRCode.toString(text, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#0d1b3e", light: "#00000000" } });
