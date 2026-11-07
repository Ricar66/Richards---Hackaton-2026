#!/usr/bin/env python3
"""Gera a entrega do RICHARDS a partir de um commit Git, sem segredos ou .git.

Previa:
  python scripts/entrega/gerar_zip.py
Entrega final (rode a partir da main validada):
  python scripts/entrega/gerar_zip.py --final --pdf caminho/da/apresentacao.pdf --pptx caminho/da/apresentacao.pptx --evidencias caminho/para/evidencias

Somente arquivos COMMITADOS entram no codigo. Python 3.10+, sem dependencias extras.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import re
import stat
import subprocess
import sys
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED, BadZipFile

ROOT_FILES = {
    "README.md", "AGENTS.md", "MEMORIA.md", "ENTREGA_SENAC_2026.md", ".env.example", ".dockerignore", "Dockerfile", "docker-compose.yml",
    "compose.iot-lab.yml", "compose.assistant.yml", "package.json", "pnpm-lock.yaml", "next.config.ts",
    "next-env.d.ts", "prisma.config.ts", "tsconfig.json", "postcss.config.mjs",
    "eslint.config.mjs",
}
CODE_DIRS = ("src/", "prisma/", "iot/", "mosquitto/", "public/", "scripts/", "tests/")
TECH_DOCS = {
    "docs/ARQUITETURA.md", "docs/CONTRATO_IOT.md", "docs/DADOS_REAIS.md",
    "docs/ROTEIRO_DEMO.md",
}
BANK_DOCS = {
    "docs/ARQUITETURA.md": "ARQUITETURA_ATUAL.md",
    "docs/agua/ESCOPO.md": "ESCOPO_HIDRICO.md",
    "docs/agua/CHECKLIST_AVALIACAO.md": "CHECKLIST_AVALIACAO.md",
}
PITCH_DOCS = {
    "presentation/FALA_5MIN40.md", "presentation/ROTEIRO_PALCO.md",
    "presentation/PLANO_FINAL.md", "presentation/README.md",
}
BLOCKED_PARTS = {".git", ".next", "node_modules", "__pycache__", ".venv", "venv", "dist", "backup", "backups", ".e2e", "coverage", "export", "exports", "archive", "historico"}
BLOCKED_NAMES = {".env", ".env.local", ".env.production", ".env.vps.local", "secrets.h", "credentials.json", "credenciais.env", "id_rsa", "id_ed25519"}
BLOCKED_SUFFIX = {".pem", ".pfx", ".p12", ".key", ".db", ".sqlite", ".sqlite3", ".dump", ".bak", ".log", ".ndjson", ".pcap"}
EVIDENCE_SUFFIX = {".png", ".jpg", ".jpeg", ".webp", ".pdf", ".mp4", ".txt", ".csv"}
SECRET = re.compile(rb"(?:-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{25,}|sk-[A-Za-z0-9]{30,})", re.I)
MAX_FILE = 80 * 1024 * 1024
PREFIX = "RICHARDS_ENTREGA_SENAC_2026/"

def git(*args: str) -> bytes:
    result = subprocess.run(["git", *args], cwd=Path(__file__).resolve().parents[2], capture_output=True)
    if result.returncode:
        raise RuntimeError("Git: " + result.stderr.decode("utf-8", "replace").strip())
    return result.stdout

def allowed_name(path: str) -> bool:
    p = PurePosixPath(path)
    if "\\" in path or ":" in path or p.is_absolute() or not p.parts or ".." in p.parts or any(x.lower() in BLOCKED_PARTS for x in p.parts):
        return False
    if p.name.lower() in BLOCKED_NAMES or p.suffix.lower() in BLOCKED_SUFFIX:
        return False
    if p.name.lower().startswith(".env") and p.name != ".env.example":
        return False
    if p.name.lower().startswith("secrets.") and p.name != "secrets.h.example":
        return False
    return True

def route(path: str) -> str | None:
    if not allowed_name(path):
        return None
    if path in ROOT_FILES or path.startswith(CODE_DIRS) or path in TECH_DOCS or path.startswith("docs/agua/"):
        return "02_CODIGO/RICHARDS_PLATFORM/" + path
    if path.startswith("presentation/imagens/") and path.endswith((".webp", ".png", ".jpg", ".jpeg")):
        return "01_APRESENTACAO/imagens/" + PurePosixPath(path).name
    if path == "presentation/imagens/README.md":
        return "01_APRESENTACAO/imagens/README.md"
    if path in PITCH_DOCS:
        return "01_APRESENTACAO/" + PurePosixPath(path).name
    if path == "presentation/CHECKLIST_VICTOR_IOT.md":
        return "03_IOT_E_TESTES/CHECKLIST_VICTOR_IOT.md"
    if path == "docs/agua/HANDOFF_CLAUDE.md":
        return "04_MATERIAL_DA_BANCA/" + PurePosixPath(path).name
    return None

def add(files: dict[str, bytes], path: str, data: bytes) -> None:
    if not allowed_name(path):
        raise RuntimeError("Caminho inseguro: " + path)
    if len(data) > MAX_FILE:
        raise RuntimeError("Arquivo maior que 80 MB: " + path)
    if SECRET.search(data):
        raise RuntimeError("Possivel segredo detectado: " + path)
    if path in files:
        raise RuntimeError("Caminho duplicado: " + path)
    files[path] = data

def validate_pitch(data: bytes, suffix: str) -> None:
    """Confere o formato real, não apenas a extensão do arquivo fornecido."""
    if suffix == ".pdf":
        if not data.startswith(b"%PDF-") or b"%%EOF" not in data[-2048:]:
            raise RuntimeError("PDF inválido ou incompleto.")
        return
    with ZipFile(io.BytesIO(data)) as deck:
        if deck.testzip() or "ppt/presentation.xml" not in deck.namelist():
            raise RuntimeError("PPTX inválido ou incompleto.")
        slides = [n for n in deck.namelist() if re.fullmatch(r"ppt/slides/slide\d+\.xml", n)]
        if len(slides) != 10:
            raise RuntimeError("O PPTX oficial precisa conter as 10 imagens, não os 14 SVGs históricos.")
        for info in deck.infolist():
            if info.file_size > MAX_FILE or SECRET.search(deck.read(info)):
                raise RuntimeError("Conteúdo inválido ou possível segredo no PPTX.")

def generate(args: argparse.Namespace) -> Path:
    root = Path(__file__).resolve().parents[2]
    if not (root / "package.json").is_file():
        raise RuntimeError("Execute no clone completo do RICHARDS.")
    branch = git("branch", "--show-current").decode().strip()
    sha = git("rev-parse", "HEAD").decode().strip()
    if args.final and not (root / "presentation/agua/APROVADA.md").is_file():
        raise RuntimeError("O pivô hídrico exige nova apresentação produzida, revisada e aprovada. O deck antigo é histórico.")
    if args.final and branch != "main":
        raise RuntimeError("Entrega FINAL apenas na branch main validada. Atual: " + branch)
    dirty = git("status", "--porcelain", "--untracked-files=no").decode().strip()
    if args.final and dirty:
        raise RuntimeError("Entrega FINAL exige arvore sem alteracoes rastreadas nao commitadas.")
    if args.final and (not args.pdf or not args.pptx):
        raise RuntimeError("Entrega FINAL exige --pdf e --pptx da apresentacao aprovada.")
    if args.final and not args.evidencias:
        raise RuntimeError("Entrega FINAL exige --evidencias com registros reais e limitações explícitas.")

    files: dict[str, bytes] = {}
    archive = git("archive", "--format=zip", sha)
    with ZipFile(io.BytesIO(archive)) as source:
        for info in source.infolist():
            if info.is_dir() or stat.S_IFMT(info.external_attr >> 16) == stat.S_IFLNK:
                continue
            dest = route(info.filename)
            if dest:
                data = source.read(info)
                if info.filename == "presentation/README.md":
                    data = data.replace(b"[render_slides.py](render_slides.py)", b"render_slides.py (historico, fora do pacote)")
                    data = data.replace("[peças vetoriais SVG](slides/)".encode(), "peças vetoriais SVG (histórico, fora do pacote)".encode())
                add(files, dest, data)
            if info.filename in BANK_DOCS:
                add(files, "04_MATERIAL_DA_BANCA/" + BANK_DOCS[info.filename], source.read(info))
            if info.filename == "presentation/CHECKLIST_VICTOR_IOT.md":
                add(files, "01_APRESENTACAO/CHECKLIST_VICTOR_IOT.md", source.read(info))
            iot_copies = {
                "docs/CONTRATO_IOT.md": "03_IOT_E_TESTES/CONTRATO_IOT.md",
                "docs/agua/REGISTRO_TESTE_FISICO.md": "03_IOT_E_TESTES/REGISTRO_TESTE_FISICO.md",
                "iot/evidencias/README.md": "03_IOT_E_TESTES/GUIA_DE_EVIDENCIAS.md",
            }
            if info.filename in iot_copies:
                add(files, iot_copies[info.filename], source.read(info))
            # Preserva os caminhos relativos usados pelo README e pelos roteiros.
            # Somente documentação versionada; arquivos operacionais da VPS ficam fora.
            if allowed_name(info.filename) and (
                info.filename in TECH_DOCS or info.filename.startswith("docs/agua/")
                or info.filename.startswith("docs/assistente/") or info.filename in PITCH_DOCS
                or info.filename == "presentation/CHECKLIST_VICTOR_IOT.md"
            ):
                copy = "02_CODIGO/RICHARDS_PLATFORM/" + info.filename
                if copy not in files:
                    add(files, copy, source.read(info))

    pitch_kind = "FINAL" if args.final else "PARA_REVISAO"
    for opt, filename in ((args.pdf, f"RICHARDS_PITCH_{pitch_kind}.pdf"), (args.pptx, f"RICHARDS_PITCH_{pitch_kind}.pptx")):
        if opt:
            p = Path(opt).expanduser().resolve()
            if not p.is_file() or p.suffix.lower() != Path(filename).suffix:
                raise RuntimeError("Apresentacao invalida ou ausente: " + str(p))
            data = p.read_bytes()
            validate_pitch(data, p.suffix.lower())
            add(files, "01_APRESENTACAO/" + filename, data)

    if args.evidencias:
        folder = Path(args.evidencias).expanduser().resolve()
        if not folder.is_dir():
            raise RuntimeError("Pasta de evidencias nao encontrada: " + str(folder))
        for p in sorted(folder.rglob("*")):
            if not p.is_file() or p.is_symlink() or any(parent.is_symlink() for parent in p.parents if parent != folder):
                continue
            rel = p.relative_to(folder).as_posix()
            if not allowed_name(rel) or p.suffix.lower() not in EVIDENCE_SUFFIX:
                continue
            add(files, "05_EVIDENCIAS/" + rel, p.read_bytes())

    if args.final and not any(p.startswith("05_EVIDENCIAS/") for p in files):
        raise RuntimeError("Pasta de evidências vazia ou sem arquivos permitidos.")

    if "02_CODIGO/RICHARDS_PLATFORM/package.json" not in files:
        raise RuntimeError("package.json nao encontrado no commit.")
    mode = "FINAL" if args.final else "PREVIA"
    now = datetime.now(timezone.utc).isoformat()
    intro = (
        "# RICHARDS Intelligence - Entrega Senac 2026\n\n"
        "Versao: " + sha[:12] + " | Branch: " + branch + " | Modo: " + mode + "\n\n"
        "01_APRESENTACAO: roteiro hídrico atual; novo deck visual/PDF/PPTX pendente de produção e aprovação.\n\n"
        "02_CODIGO: abra RICHARDS_PLATFORM/README.md para Docker, API e testes.\n\n"
        "03_IOT_E_TESTES: contrato da bancada e checklist do Victor.\n\n"
        "04_MATERIAL_DA_BANCA: resumo, roteiro, riscos e controle do 3D.\n\n"
        "05_EVIDENCIAS: apenas os arquivos de testes fornecidos pela equipe.\n\n"
        "NUNCA considere dados simulados como resultados reais, nem volume monitorado como economizado.\n"
        "Os testes fisicos do ESP32 e do projetor so estao validados se houver evidencias reais.\n"
    )
    add(files, "00_COMECE_AQUI.md", intro.encode("utf-8"))
    add(files, "VERSAO_DA_ENTREGA.txt", (
        "RICHARDS Intelligence\nSHA=" + sha + "\nBRANCH=" + branch +
        "\nMODO=" + mode + "\nUTC=" + now + "\n" +
        "FONTE=git archive do commit + materiais explicitamente fornecidos\n"
    ).encode("utf-8"))
    add(files, "LIMITACOES.json", json.dumps({
        "modo": mode, "commit": sha, "branch": branch,
        "aprovacao_hardware": "NÃO INFERIDA: consultar registro de teste físico",
        "aprovacao_projetor": "NÃO INFERIDA: consultar registro do projetor",
        "segredos": "Triagem automática não substitui revisão humana das evidências",
    }, ensure_ascii=False, indent=2).encode("utf-8"))
    hashes = [hashlib.sha256(v).hexdigest() + "  " + k for k, v in sorted(files.items())]
    add(files, "SHA256SUMS.txt", ("\n".join(hashes) + "\n").encode("utf-8"))

    out = Path(args.saida).expanduser().resolve() if args.saida else root / "dist"
    out.mkdir(parents=True, exist_ok=True)
    target = out / ("RICHARDS_" + mode + "_" + sha[:12] + ".zip")
    temporary = target.with_suffix(".tmp")
    try:
        with ZipFile(temporary, "w") as z:
            for name, data in sorted(files.items()):
                zi = ZipInfo(PREFIX + name, date_time=(2026, 11, 6, 12, 0, 0))
                zi.compress_type = ZIP_DEFLATED
                zi.external_attr = 0o644 << 16
                z.writestr(zi, data, compress_type=ZIP_DEFLATED, compresslevel=7)
        with ZipFile(temporary) as z:
            corrupt = z.testzip()
            if corrupt:
                raise RuntimeError("Falha CRC: " + corrupt)
        temporary.replace(target)
    finally:
        temporary.unlink(missing_ok=True)
    print("PACOTE:", target)
    print("COMMIT:", sha, "BRANCH:", branch, "MODO:", mode, "ARQUIVOS:", len(files))
    print("SHA256 ZIP:", hashlib.sha256(target.read_bytes()).hexdigest())
    target.with_suffix(".zip.sha256").write_text(hashlib.sha256(target.read_bytes()).hexdigest() + "  " + target.name + "\n", encoding="utf-8")
    if dirty:
        print("AVISO: alteracoes locais nao commitadas nao entraram no ZIP.")
    if not args.final:
        print("PREVIA: revisar anexos e evidencias; gerar --final somente apos aprovacao da main.")
    return target

def main() -> None:
    p = argparse.ArgumentParser(description="Empacota o RICHARDS para avaliacao sem Git e sem segredos.")
    p.add_argument("--final", action="store_true", help="exige main limpa, PDF e PPTX")
    p.add_argument("--pdf", help="arquivo PDF aprovado (caminho local)")
    p.add_argument("--pptx", help="arquivo PPTX aprovado (caminho local)")
    p.add_argument("--evidencias", help="pasta opcional com fotos, videos e resultados REAIS")
    p.add_argument("--saida", help="diretorio de saida, padrao dist/")
    try:
        generate(p.parse_args())
    except (RuntimeError, OSError, ValueError, BadZipFile) as error:
        print("ERRO:", error, file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
