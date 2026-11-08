import { randomBytes } from "node:crypto";
/** 128 bits do gerador criptográfico do sistema, em hexadecimal (formato de `PASSPORT_TOKEN_RE`). Impossível de adivinhar. */
export const newPassportToken = () => randomBytes(16).toString("hex");
