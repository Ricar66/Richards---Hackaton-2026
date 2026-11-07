#!/usr/bin/env python3
"""Verifica CRC, caminhos e TODOS os hashes antes de extrair em pasta nova."""
import argparse
import hashlib
from pathlib import Path, PurePosixPath
import re
import stat
from zipfile import ZipFile

PREFIX = "RICHARDS_ENTREGA_SENAC_2026/"

def verify(path: Path, destination: Path | None = None) -> int:
    with ZipFile(path) as z:
        names = z.namelist()
        if len(names) != len(set(names)):
            raise ValueError("Entradas duplicadas")
        for i in z.infolist():
            p = PurePosixPath(i.filename)
            if not i.filename.startswith(PREFIX) or p.is_absolute() or ".." in p.parts or "\\" in i.filename or ":" in i.filename:
                raise ValueError("Caminho inseguro")
            if stat.S_IFMT(i.external_attr >> 16) == stat.S_IFLNK:
                raise ValueError("Link simbólico não permitido")
        if z.testzip():
            raise ValueError("CRC inválido")
        manifest = PREFIX + "SHA256SUMS.txt"
        expected = {}
        for line in z.read(manifest).decode("utf-8").splitlines():
            if not re.fullmatch(r"[0-9a-f]{64}  .+", line):
                raise ValueError("Manifesto inválido")
            digest, name = line.split("  ", 1)
            if PREFIX + name in expected:
                raise ValueError("Hash duplicado")
            expected[PREFIX + name] = digest
        if set(expected) != set(names) - {manifest}:
            raise ValueError("Manifesto não cobre exatamente o conteúdo")
        for name, digest in expected.items():
            if hashlib.sha256(z.read(name)).hexdigest() != digest:
                raise ValueError("SHA256 divergente: " + name)
        if destination:
            destination.mkdir(parents=True, exist_ok=False)
            z.extractall(destination)
            for name, digest in expected.items():
                if hashlib.sha256((destination / name).read_bytes()).hexdigest() != digest:
                    raise ValueError("Extração divergente: " + name)
        return len(expected)

if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("zip", type=Path)
    p.add_argument("--extrair", type=Path, help="Diretório novo, que ainda não existe")
    args = p.parse_args()
    print(f"PASSOU: CRC e {verify(args.zip, args.extrair)} hashes SHA256")
