# Evidências da bancada

**Estado: aguardando envio do Victor. Nenhum teste físico aprovado aqui.**

Criar uma pasta por sessão: `AAAA-MM-DD_identificador/`. Manter os arquivos originais privados até retirar credenciais, dados pessoais e telas de acesso. Publicar somente a cópia revisada.

Conteúdo de cada sessão:

| Arquivo/pasta | Conteúdo exigido |
|---|---|
| `registro.md` | Cópia preenchida de `docs/entrega/REGISTRO_TESTE_FISICO.md` |
| `firmware.txt` | Caminho do firmware versionado, SHA do commit, versão Arduino/core/bibliotecas, resultado da compilação |
| `ligacoes.pdf` ou imagem | Pinagem real, alimentação e proteção do GPIO, revisadas pelo montador |
| `fotos/` | Visão geral e conexões legíveis, sem credenciais |
| `calibracao.csv` | Volume de referência, pulsos, fator usado, volume calculado e erro por ensaio |
| `telemetria.csv` | bootId, sequência, horário, dispositivo, origem, canal, valor enviado e registro recebido |
| `integracao.txt` | Passos sensor → API/ponte → banco → BI → ocorrência → resolução → PDF e evidências correspondentes |
| `problemas.csv` | Defeito, reprodução, correção/commit, novo teste e estado |

Modelos CSV nesta pasta têm **somente cabeçalhos**. Não são evidência de execução. Não substituir o firmware MQTT por uma implementação presumida: receber o `.ino` do Victor em `iot/esp32_richards_mqtt/` e conferir o contrato antes de integrar.

Calibração: erro absoluto = volume calculado − volume de referência; erro percentual = 100 × erro absoluto / referência (somente referência > 0). Registrar a resolução do recipiente e a tolerância definida antes do teste. Três volumes e repetições permitem avaliar dispersão; não declarar precisão a partir de um único ensaio.

Para o ZIP, apontar `--evidencias` à sessão revisada. O gerador não certifica hardware nem remove automaticamente informações sensíveis de fotos, vídeos ou PDFs.
