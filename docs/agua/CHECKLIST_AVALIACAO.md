# Checklist de revisão do protótipo hídrico

Controle interno da entrega. Conferir separadamente a rubrica oficial da organização; os itens abaixo não substituem critérios oficiais do evento.

| Item | Evidência/estado atual |
|---|---|
| Código executável e instalação | README e build/typecheck/lint executados em ambiente controlado |
| Regra, persistência e investigação | 132 testes unitários e 87 de integração passaram nesta reconstrução |
| Mapeamento espacial | Três modelos, vínculo único por unidade, versão e auditoria; sem sensor, sem leitura |
| Origem e ausência de dados | DEVICE/SIMULATED separados; amostra antiga não anima; cenários não são resultados físicos |
| APIs e proteção | Fumaça HTTP: autenticação, CSRF, limites, conflito e rotas descontinuadas 410 |
| Relatório | PDF usa o mesmo recorte do BI; volume registrado não é economia comprovada |
| Integridade do pacote | Gerador e verificador com caminhos seguros, CRC e manifesto SHA256 |
| Documentação IoT | Contrato e modelo de registro físico; modelos CSV possuem somente cabeçalhos |
| Validação PostgreSQL 16 | PENDENTE — suíte local executou PostgreSQL 18.6 isolado |
| Navegador/celular/projetor | PENDENTE — Chromium encerrou antes de iniciar o ensaio; não há aceite visual desta cópia |
| Firmware e calibração física | PENDENTE — receber/revisar evidências do Victor |
| Carga de público | PENDENTE — não presumir capacidade pelo código |
| Apresentação atual | Roteiro hídrico alvo 5min40/4 integrantes; novo deck, PDF/PPTX e ensaio humano pendentes |
| Aprovação de implantação | PENDENTE — main/VPS não foram alteradas por este trabalho |

O pacote atual é PRÉVIA para revisão. A apresentação visual anterior está arquivada e não deve representar o produto atual. Histórico do banco foi preservado; campos e eventos legados não constituem funcionalidades operacionais atuais. Instalação e código estão em 02_CODIGO/RICHARDS_PLATFORM; contrato/checklist IoT em 03_IOT_E_TESTES.
