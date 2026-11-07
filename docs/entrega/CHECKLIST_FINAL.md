# Checklist final da entrega — RICHARDS Senac 2026

## Software e Git
- [ ] `develop` recebeu código e testes do Victor.
- [ ] Typecheck, lint, build e testes foram executados no commit candidato (anotar resultado).
- [ ] Somente o commit aprovado foi promovido à `main`.
- [ ] A versão publicada e a versão que vai no ZIP são explicitamente identificadas.
- [ ] O ZIP foi produzido com `scripts/entrega/gerar_zip.py --final` a partir da `main` limpa.
- [ ] `VERSAO_DA_ENTREGA.txt` e `SHA256SUMS.txt` estão presentes.
- [ ] Nenhum `.env`, `secrets.h`, dump de banco ou pasta `.git` está no ZIP.

## Apresentação
- [ ] A sequência **oficial de 10 imagens** foi revisada. As 14 peças SVG antigas não foram confundidas com o pitch atual.
- [ ] PDF e PPTX finais foram revisados, completos e incluídos.
- [ ] O pitch foi ensaiado por 4 integrantes com cronômetro, incluindo a demonstração.
- [ ] Fala e slides não afirmam IA preditiva implementada, litros economizados ou integração física sem evidência.
- [ ] Telão, cabo HDMI/adaptador, fonte de energia, navegador e 3D/2D de reserva foram ensaiados.

## IoT e prova
- [ ] Victor enviou firmware **sem credenciais** e informações de pinagem/ligação.
- [ ] Testes reais estão registrados em `REGISTRO_TESTE_FISICO.md`.
- [ ] Dispositivo/canal/origem e limiar estão corretos.
- [ ] O fluxo sensor → ocorrência → investigação → resolução foi demonstrado.
- [ ] A jornada de alimentos foi conferida com instituição real cadastrada, quando aplicável.
- [ ] Os dados da simulação, se usados como contingência, aparecem identificados.
- [ ] Fotos/vídeos usados como evidência correspondem aos testes efetivos.

## Empacotamento
- [ ] Extrair o ZIP num diretório novo, sem depender do repositório de desenvolvimento.
- [ ] Conferir integridade pelo ZIP CRC e pelo SHA256 registrado.
- [ ] Abrir `00_COMECE_AQUI.md` e os materiais da banca.
- [ ] Verificar que `02_CODIGO/RICHARDS_PLATFORM` contém `package.json`, Docker, Prisma, código e testes.
- [ ] Fazer instalação de teste em máquina separada ou registrar limitações.
- [ ] Confirmar o regulamento do evento sobre entregas e histórico anterior.
