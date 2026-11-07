"""Regressões do empacotamento: python -m unittest discover -s tests -p test_entrega.py"""
import importlib.util
import io
from pathlib import Path
import tempfile
import unittest
from zipfile import ZipFile

def module(name):
    path = Path(__file__).resolve().parents[1] / "scripts" / "entrega" / (name + ".py")
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m

g = module("gerar_zip")
v = module("verificar_zip")

class EntregaTest(unittest.TestCase):
    def test_sensitive_paths(self):
        for p in [".env", "src/.env.test", "iot/secrets.h", "node_modules/a.js", "a/.git/config", "backup/db.sql", "a.db", "C:/x", "..\\x", "a/../x", "a/.ENV"]:
            with self.subTest(p=p): self.assertFalse(g.allowed_name(p))

    def test_templates_and_official_pitch(self):
        self.assertTrue(g.allowed_name(".env.example"))
        self.assertTrue(g.allowed_name("iot/secrets.h.example"))
        self.assertIsNone(g.route("presentation/slides/01_capa.svg"))
        self.assertIsNotNone(g.route("presentation/imagens/01_capa.webp"))

    def test_secret_detection(self):
        with self.assertRaises(RuntimeError): g.add({}, "log.txt", b"ghp_" + b"a" * 30)

    def test_fake_pdf(self):
        with self.assertRaises(RuntimeError): g.validate_pitch(b"not a PDF", ".pdf")

    def test_historical_deck_rejected(self):
        b = io.BytesIO()
        with ZipFile(b, "w") as z:
            z.writestr("ppt/presentation.xml", "<xml/>")
            for i in range(1, 15): z.writestr(f"ppt/slides/slide{i}.xml", "<xml/>")
        with self.assertRaises(RuntimeError): g.validate_pitch(b.getvalue(), ".pptx")

    def test_extra_file_and_tamper_rejected(self):
        import hashlib
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "test.zip"
            for data, extra in [(b"alterado", False), (b"original", True)]:
                with ZipFile(path, "w") as z:
                    z.writestr(v.PREFIX + "a.txt", data)
                    z.writestr(v.PREFIX + "SHA256SUMS.txt", hashlib.sha256(b"original").hexdigest() + "  a.txt\n")
                    if extra: z.writestr(v.PREFIX + "extra.txt", "x")
                with self.assertRaises(ValueError): v.verify(path)

if __name__ == "__main__": unittest.main()
