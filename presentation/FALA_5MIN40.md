# RICHARDS — fala de palco (5min40, incluindo demo)

**Observação:** a minutagem é uma meta de ensaio, não uma duração verificada. Os textos são guias de fala, não precisam ser decorados. Não afirmar integração física antes do teste real do Victor.

## 00:00–00:35 · Abrir com uma pergunta (slides 01–02)

“Antes de mostrar o projeto, quero fazer uma pergunta: **quanto custa perceber tarde demais?** Pode ser água correndo fora do horário, sem que ninguém perceba. Pode ser um lote de alimentos que ainda teria destino, mas perde essa oportunidade porque ninguém foi avisado ou ninguém organizou a entrega. São problemas diferentes, mas têm algo em comum: o tempo entre um sinal e uma ação. E se a tecnologia ajudasse a encurtar esse intervalo?”

## 00:35–01:05 · Importância e escala (slide 03)

“O desperdício não é um problema pequeno. Segundo o PNUMA, o mundo gerou cerca de **1,05 bilhão de toneladas de resíduos alimentares em 2022**, considerando varejo, serviços de alimentação e domicílios, incluindo partes não comestíveis. Esse dado não é da nossa cidade nem do nosso piloto; ele mostra a dimensão global do desafio. Nós resolvemos começar em um cenário que conseguimos medir, investigar e demonstrar.”

## 01:05–01:25 · A história do nome (slide 04)

“O nome **RICHARDS** é uma homenagem à Ellen Swallow Richards. Lá no século XIX, ela foi pioneira nos estudos de qualidade da água e em aplicar ciência aos problemas ligados ao ambiente, à alimentação e à saúde. O que nos inspirou foi justamente essa ideia: ciência não é só descoberta; ciência precisa melhorar decisões do dia a dia.”

## 01:25–01:45 · Solução em uma frase (slide 05)

“RICHARDS é uma plataforma de inteligência operacional. Ela busca transformar **medição em investigação, investigação em ação e ação em evidência**. Não queremos apenas um gráfico para o gestor olhar. Queremos um processo rastreável, do dado à intervenção.”

## 01:45–02:10 · Passar para Victor / IoT (slide 06)

“Agora entra a parte física. O Victor está responsável pela integração da bancada IoT: ESP32, sensor de vazão e envio das leituras. A plataforma recebe esses pacotes por API, registra os dados no banco e usa uma regra configurável para sinalizar fluxo persistente fora do padrão definido. Esse sinal é **suspeita para investigar**, não prova automática de vazamento.”

## 02:10–03:50 · Demonstração, com fala curta (slides 07–09)

**Telão:** Sala ao vivo (`/ao-vivo`, tela cheia com F) desde o início da demonstração.

**Victor:** ativar o circuito seguro. Enquanto a vazão sobe, a plateia vê o **anel da regra** contar os segundos de fluxo contínuo.

Fala-guia: "A regra não dispara com um pico. Cada traço aceso é um segundo que o servidor decidiu, leitura a leitura. Ninguém está animando isso."

**Operador do painel**, quando o anel virar OCORRÊNCIA ABERTA:

1. Filtrar a origem `DEVICE`.
2. Clicar em **Investigar** no aviso.
3. Mostrar o detalhe com a evidência.
4. Assumir a investigação.
5. Resolver com uma nota de intervenção.

Se der tempo, apontar a **viagem do pacote** no rodapé da Sala e ler o número **que está na tela**, que é a medição daquela leitura.

Fala-guia: “Reparem numa coisa: a leitura chegou identificada como dado do dispositivo. O sistema sinalizou um comportamento que merece atenção; agora uma pessoa verifica e registra o que foi feito. Isso cria rastreabilidade — não só um alarme que desaparece.”

Mudar para a jornada alimentar. “Aqui seguimos a mesma lógica de responsabilidade. Um lote é cadastrado, mas ele só fica disponível após a verificação humana. A instituição reserva e confirma o recebimento. Só nesse último passo os quilos entram como entrega confirmada.”

Encerrar demo abrindo PDF. “E esse relatório usa o mesmo recorte do painel e identifica a origem dos dados.”

**Plano B:** se a placa não estiver conectada ou a vazão física falhar, parar a ponte (Ctrl+C no `pnpm mqtt`) e rodar `pnpm bancada --cenario palco --inicio-em 5`, que move vazão, temperatura e balança pelas mesmas regras. A ponte não descarta um sensor só: com ela ligada, a vazão se mistura e a bancada recusa começar. Com a ponte recém-parada, a bancada espera até 6 s e começa. Dizer "SIMULAÇÃO" em voz alta e mostrar o selo **SIMULADO** na Sala. Último recurso: `pnpm simulate`, só para a vazão.

## 03:50–04:25 · Diferencial proposto (slide 10)

“Existe sistema de monitoramento e existe plataforma de doação. Nosso diferencial que queremos validar é conectar **sinal, investigação, ação e comprovação** em uma experiência única. Não estamos dizendo que inventamos todas essas partes. O que estamos propondo é um jeito mais responsável e integrado de operar.”

## 04:25–04:50 · Inovação com responsabilidade (slide 11)

“E onde entra a inteligência artificial? Hoje, o protótipo **não usa um modelo preditivo treinado** para detectar vazamentos. Isso seria um discurso bonito, mas sem base. Nosso caminho para IA é primeiro coletar dados confiáveis, registrar eventos confirmados e medir erros; depois, comparar um modelo de detecção de anomalias com a regra simples. Essa evolução pode ser feita com evidência, não com promessa.”

## 04:50–05:15 · Impacto e viabilidade (slides 12–13)

“O sucesso pode ser medido em três frentes: tempo de reação e ocorrências na operação; volume de água monitorado no ambiente; e quilos de alimentos **efetivamente entregues**. O próximo passo é um piloto com um estabelecimento e uma instituição receptora, para calibrar o hardware, medir falsos alertas, custos e benefício real. Só depois faria sentido afirmar economia ou calcular retorno financeiro.”

## 05:15–05:40 · Fechamento (slide 14)

“Para nós, inovar não é colocar IA em tudo. É perceber um problema antes, fazer a informação chegar a quem pode agir e conseguir comprovar o que aconteceu. É isso que RICHARDS quer construir. **Perceber antes. Agir melhor. Comprovar resultados.** Obrigado!”

---

## Notas de ensaio

- Não gastar 2 minutos explicando stack; mostrar stack no slide 06 e deixar a plataforma provar utilidade.
- O efeito mais forte acontece **quando o dado físico aparece no BI e alguém resolve a ocorrência**.
- Se o tempo apertar, cortar explicações do slide 03 ou 13; nunca cortar a transparência sobre simulação ou validação humana.
- Ensaie com projeção 1920 × 1080, Wi-Fi do evento e câmera/vídeo de contingência.
- Dados de referência: PNUMA (relatório de 2024, estimativas de 2022); vida de Ellen Richards: MIT Libraries e Science History Institute. Links completos em `ROTEIRO_PALCO.md`.