# Entrega RICHARDS — Hackathon Senac 2026

**Comece aqui antes de gerar o ZIP.** O GitHub é o repositório de trabalho; **a banca receberá uma pasta ZIP**, sem histórico Git, credenciais, banco local ou dependências instaladas.

## Fluxo com apenas duas branches
- `develop`: integrações dos dois desenvolvedores e da equipe IoT. Validar aqui.
- `main`: versão estável, usada na VPS e para a entrega final. Só atualizar depois dos testes e aprovação da equipe.
- Não fazer force push nem implantar automaticamente. Um commit de organização em `develop` **não altera** a versão de produção.

## Qual apresentação é a oficial?
- A apresentação **atual** está em `presentation/imagens/`: **10 imagens Full HD**.
- A sequência `presentation/slides/` contém **14 SVGs históricos** e não é a apresentação oficial.
- Conferir o roteiro `presentation/FALA_5MIN40.md`: algumas falas devem ser ajustadas ao teste físico de amanhã.
- O ZIP final exige PDF e PPTX **aprovados**, passados por argumentos; nunca atribui resultados reais a imagens conceituais.

## Gerar o pacote
Com Python 3.10+ e Git no clone:

```bash
python scripts/entrega/gerar_zip.py
```

Esse comando gera uma **prévia** em `dist/` usando apenas o commit local. Para a entrega definitiva, depois da validação de `main` e do pitch:

```bash
python scripts/entrega/gerar_zip.py --final --pdf CAMINHO_PITCH.pdf --pptx CAMINHO_PITCH.pptx --evidencias CAMINHO_EVIDENCIAS
```

É possível usar `--saida` para escolher o diretório. O script não faz deploy, não modifica banco, não muda branches e não cria commits.

Para verificar e extrair a prévia em uma pasta **nova**:

```bash
python scripts/entrega/verificar_zip.py dist/RICHARDS_PREVIA_SEU_SHA.zip --extrair ../conferencia-entrega
python -m unittest discover -s tests -p test_entrega.py
```

O verificador exige cobertura exata do manifesto, confere CRC e SHA256 antes e depois da extração, e recusa caminhos inseguros. O gerador cria também o arquivo externo `.zip.sha256`. O template `.env.example` está incluído para a instalação; nenhum ambiente preenchido deve entrar.

O modo final exige evidências não vazias e verifica o formato PDF e a estrutura PPTX de 10 slides. Isso **não aprova** automaticamente o conteúdo, o hardware ou o projetor. A revisão humana das imagens, documentos e resultados continua obrigatória.

## O que conferir antes de entregar
1. Seguir `docs/entrega/CHECKLIST_FINAL.md`.
2. Victor preencher `docs/entrega/REGISTRO_TESTE_FISICO.md` com testes físicos reais, ou marcar NÃO EXECUTADO.
3. Ensaiar `docs/entrega/3D_E_PROJETOR.md` no projetor; 3D só se estiver estável.
4. Extrair o ZIP em uma pasta vazia; conferir `00_COMECE_AQUI.md`, versão, SHA256 e arquivos de apresentação.
5. Tentar iniciar em outro computador **sem reutilizar** o `.env` da equipe. Testar Docker e fluxo de demo num ambiente descartável.

**Segurança:** a VPS permanece com riscos de HTTP Basic/MQTT sem TLS no estado atual. Não publicar senhas, não incluir dumps e não confundir uma validação automatizada com ensaio do hardware real.
