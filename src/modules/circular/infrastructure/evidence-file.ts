import { createHash } from "node:crypto";
import { CircularError, MAX_FILE_BYTES, type EvidenceInput } from "../domain/contracts";
/** Assinatura de formato, não antivírus nem validação de autenticidade documental. Sempre baixar como anexo. */
export function decodeEvidence(file: EvidenceInput["file"]) {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(file.base64)) throw new CircularError("Arquivo base64 inválido", 422);
  const bytes = Buffer.from(file.base64, "base64");
  if (!bytes.length || bytes.length > MAX_FILE_BYTES) throw new CircularError("Arquivo deve ter até 2 MiB", 413);
  const valid = file.mime === "application/pdf" ? bytes.subarray(0, 5).toString() === "%PDF-" && bytes.subarray(-2048).includes(Buffer.from("%%EOF"))
    : file.mime === "image/png" ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : bytes.length > 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 && bytes.at(-2) === 255 && bytes.at(-1) === 217;
  if (!valid) throw new CircularError("Formato do documento não corresponde ao conteúdo", 422);
  return { bytes, sha256: createHash("sha256").update(bytes).digest("hex") };
}
