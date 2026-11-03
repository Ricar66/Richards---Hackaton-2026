# Gera docs/dados/DICIONARIO_DE_DADOS.xlsx a partir do modelo real (prisma/schema.prisma + migrations aplicadas).
# Uso: python scripts/docs/dicionario_de_dados.py   (requer Python 3 + openpyxl)
# Ao mudar o schema: atualize as listas abaixo e rode de novo. As contagens da aba "Sobre" são fórmulas
# e a célula de conferência compara com o que foi lido do banco (information_schema) na data indicada.
from pathlib import Path
from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

OUT = Path(__file__).resolve().parents[2] / "docs" / "dados" / "DICIONARIO_DE_DADOS.xlsx"
DATA_CONFERENCIA = "03/11/2026"
# Lido do banco richards (information_schema / pg_constraint / pg_indexes) em DATA_CONFERENCIA.
BANCO = {"tabelas": 11, "colunas": 92, "fks": 15, "indices": 20}

NAV, ACCENT, INK, MUTED, BAND, LINE = "0F2128", "137E77", "0F2128", "55656B", "F3F6F5", "D5DFDD"
APP_ID = "cuid() — gerado pela aplicação"

# ---------------------------------------------------------------- tabelas
# (tabela, nome de negócio, grupo, descrição, situação no MVP, observação)
TABELAS = [
    ("Organization", "Organização", "Organização e acesso", "Empresa ou estabelecimento que usa a plataforma (tenant). Todo dado operacional pertence a uma organização.", "Em uso", "A demonstração usa uma organização fixa (richards-demo-org)."),
    ("User", "Usuário", "Organização e acesso", "Pessoa cadastrada na organização, com papel.", "Em uso parcial", "No MVP não há login por usuário: o BI usa HTTP Basic de laboratório. A tabela guarda o operador de demonstração; o autor de cada ação fica gravado como texto (OccurrenceEvent.actor e AuditEvent.metadata.actor)."),
    ("Site", "Unidade", "Organização e acesso", "Unidade física monitorada (loja, cozinha, bancada).", "Em uso", ""),
    ("Device", "Dispositivo", "Água / IoT", "Sensor (ESP32 + YF-S201) com sua credencial e a regra de alerta de fluxo contínuo.", "Em uso", "Conectividade exibida no BI é calculada por lastSeenAt (mais de 120 s sem leitura = sem comunicação)."),
    ("TelemetryReading", "Leitura de telemetria", "Água / IoT", "Leitura de vazão enviada pelo ESP32 ou pelo simulador. Imutável depois de aceita.", "Em uso", "Idempotente por (deviceId, bootId, sequence): reenvio não duplica volume."),
    ("Occurrence", "Ocorrência", "Ocorrências", "Suspeita registrada para verificação humana (ex.: fluxo contínuo fora do padrão). Não é vazamento comprovado.", "Em uso", "No máximo uma UNUSUAL_FLOW ativa (OPEN/ACKNOWLEDGED) por dispositivo, garantido pela aplicação."),
    ("OccurrenceEvent", "Evento da ocorrência", "Ocorrências", "Linha do tempo da ocorrência: uma linha por abertura ou mudança de status, com autor e nota.", "Em uso", "Excluída junto com a ocorrência (CASCADE); a aplicação não oferece exclusão."),
    ("RecipientOrganization", "Instituição receptora", "Doações", "Instituição que recebe lotes de doação.", "Em uso", "Só instituição ativa pode receber reserva."),
    ("DonationBatch", "Lote de doação", "Doações", "Excedente de alimento ofertado, do cadastro à entrega confirmada, com verificação humana documentada.", "Em uso", "Só conta como impacto (kg entregues) quando DELIVERED, pela data de entrega."),
    ("Mission", "Missão", "Expansão", "Encaminhamento de inspeção (ocorrência) ou coleta (lote).", "Reservada", "Tabela criada para a expansão; sem tela nem API no MVP."),
    ("AuditEvent", "Evento de auditoria", "Rastreabilidade", "Trilha de auditoria de toda ação persistente, gravada na mesma transação da mudança.", "Em uso", "Aponta para Occurrence ou DonationBatch por entity + entityId (referência lógica, sem FK)."),
]

# ---------------------------------------------------------------- dicionário
# (tabela, coluna, tipo PostgreSQL, obrigatório, padrão, chave, referência, descrição, tipo Prisma, valores, validação na aplicação, exemplo)
S, N = "Sim", "Não"
COLUNAS = [
    ("Organization", "id", "text", S, APP_ID, "PK", "", "Identificador único da organização.", "String", "", "", "richards-demo-org"),
    ("Organization", "name", "text", S, "", "", "", "Nome exibido no BI e no relatório PDF.", "String", "", "", "Mercado Aurora · Unidade Centro"),
    ("Organization", "sector", "text", S, "", "", "", "Setor de atuação.", "String", "", "", "Varejo alimentar"),
    ("Organization", "city", "text", S, "", "", "", "Cidade.", "String", "", "", "Ribeirão Preto"),
    ("Organization", "isDemo", "boolean", S, "false", "", "", "Marca a organização como cenário de demonstração. Gravada pelo seed; o modo demonstração da aplicação é ligado pela variável DEMO_MODE, não por esta coluna.", "Boolean", "true / false", "", "true"),
    ("Organization", "createdAt", "timestamp(3)", S, "CURRENT_TIMESTAMP", "", "", "Data e hora de criação.", "DateTime", "", "", "2026-10-27 14:00:00.000"),

    ("User", "id", "text", S, APP_ID, "PK", "", "Identificador único do usuário.", "String", "", "", "cmw0yspno000d24g3a08a2twn"),
    ("User", "organizationId", "text", S, "", "FK", "Organization.id", "Organização a que o usuário pertence.", "String", "", "", "richards-demo-org"),
    ("User", "name", "text", S, "", "", "", "Nome da pessoa.", "String", "", "", "Operador Demo"),
    ("User", "email", "text", S, "", "UK", "", "E-mail; único em toda a base.", "String", "", "", "operador@richards.local"),
    ("User", "role", "Role", S, "'OPERATOR'", "", "", "Papel da pessoa na organização.", "Role (enum)", "OWNER, OPERATOR, ANALYST, RECIPIENT", "Sem login por usuário no MVP (ver aba Tabelas).", "OWNER"),
    ("User", "createdAt", "timestamp(3)", S, "CURRENT_TIMESTAMP", "", "", "Data e hora do cadastro.", "DateTime", "", "", "2026-10-27 14:00:00.000"),

    ("Site", "id", "text", S, APP_ID, "PK", "", "Identificador único da unidade.", "String", "", "", "richards-demo-site"),
    ("Site", "organizationId", "text", S, "", "FK", "Organization.id", "Organização dona da unidade.", "String", "", "", "richards-demo-org"),
    ("Site", "name", "text", S, "", "", "", "Nome da unidade.", "String", "", "", "Unidade Centro"),
    ("Site", "description", "text", N, "", "", "", "Descrição livre da unidade.", "String?", "", "", "Bancada demonstrativa"),

    ("Device", "id", "text", S, APP_ID, "PK", "", "Identificador interno do dispositivo.", "String", "", "", "richards-flow-01"),
    ("Device", "organizationId", "text", S, "", "FK", "Organization.id", "Organização dona do dispositivo.", "String", "", "", "richards-demo-org"),
    ("Device", "siteId", "text", S, "", "FK", "Site.id", "Unidade onde o dispositivo está instalado.", "String", "", "", "richards-demo-site"),
    ("Device", "code", "text", S, "", "UK", "", "Código enviado pelo firmware em cada leitura (campo deviceCode); identifica o sensor na API.", "String", "", "3 a 80 caracteres no pacote de telemetria.", "RICHARDS-FLOW-001"),
    ("Device", "label", "text", S, "", "", "", "Nome legível exibido no BI.", "String", "", "", "Sensor de vazão · Linha 01"),
    ("Device", "kind", "DeviceKind", S, "", "", "", "Tipo do sensor.", "DeviceKind (enum)", "FLOW, SCALE, TEMPERATURE", "Só FLOW em uso no MVP.", "FLOW"),
    ("Device", "state", "DeviceState", S, "'OFFLINE'", "", "", "Estado gravado. Só MAINTENANCE (decisão humana) é considerado; com ou sem comunicação no BI é calculado por lastSeenAt.", "DeviceState (enum)", "ONLINE, OFFLINE, MAINTENANCE", "A ingestão de leituras nunca sobrescreve este campo.", "OFFLINE"),
    ("Device", "apiKeyHash", "text", S, "", "", "", "Hash SHA-256 (64 caracteres hexadecimais) da chave do dispositivo. A chave em si não é gravada; a comparação é em tempo constante e o hash nunca sai na API.", "String", "", "Chave enviada no cabeçalho x-device-key.", "(64 caracteres hexadecimais — não divulgado)"),
    ("Device", "lastSeenAt", "timestamp(3)", N, "", "", "", "Hora do servidor da última leitura aceita. Nulo = nunca comunicou.", "DateTime?", "", "Mais de 120 s sem leitura = sem comunicação.", "2026-11-03 12:09:41.512"),
    ("Device", "calibrationPulsesPerLiter", "double precision", S, "450", "", "", "Pulsos do sensor por litro (referência de calibração do YF-S201), exibido no BI.", "Float", "", "", "450"),
    ("Device", "minFlowLpm", "double precision", S, "1.5", "", "", "Limiar da regra de alerta: vazão (L/min) a partir da qual o fluxo conta como contínuo.", "Float", "", "", "1.5"),
    ("Device", "continuousSeconds", "integer", S, "30", "", "", "Tempo (s) de fluxo contínuo acima do limiar para abrir ocorrência suspeita.", "Int", "", "", "30"),

    ("TelemetryReading", "id", "text", S, APP_ID, "PK", "", "Identificador único da leitura.", "String", "", "", "cmw0yspno000d24g3a08a2twn"),
    ("TelemetryReading", "deviceId", "text", S, "", "FK, UK composta", "Device.id", "Dispositivo que enviou a leitura.", "String", "", "Único em conjunto com bootId e sequence.", "richards-flow-01"),
    ("TelemetryReading", "bootId", "text", S, "", "UK composta", "", "Identificador da sessão de boot do firmware; muda quando o ESP32 reinicia.", "String", "", "4 a 80 caracteres.", "seed-2026"),
    ("TelemetryReading", "sequence", "integer", S, "", "UK composta", "", "Contador da leitura dentro do boot. deviceId + bootId + sequence é único: reenvio da mesma leitura não soma volume duas vezes.", "Int", "", "Inteiro ≥ 0.", "42"),
    ("TelemetryReading", "source", "DataSource", S, "", "", "", "Origem da leitura: DEVICE (sensor físico) ou SIMULATED (simulador ou seed).", "DataSource (enum)", "DEVICE, SIMULATED", "SIMULATED só é aceito com DEMO_MODE ligado.", "SIMULATED"),
    ("TelemetryReading", "flowLpm", "numeric(12,3)", S, "", "", "", "Vazão instantânea em litros por minuto no momento da captura. É taxa: nunca somar para obter volume.", "Decimal(12,3)", "", "0 a 1000.", "2.500"),
    ("TelemetryReading", "deltaLiters", "numeric(12,3)", S, "", "", "", "Litros observados desde a leitura anterior. A soma é o volume observado, que não é volume economizado.", "Decimal(12,3)", "", "0 a 10000.", "0.625"),
    ("TelemetryReading", "capturedAt", "timestamp(3)", S, "", "", "", "Hora da captura no relógio do dispositivo (enviada em ISO 8601 com fuso).", "DateTime", "", "Recusada se diferir mais de 5 min da hora do servidor.", "2026-11-03 12:09:30.000"),
    ("TelemetryReading", "receivedAt", "timestamp(3)", S, "CURRENT_TIMESTAMP", "", "", "Hora em que o servidor gravou a leitura.", "DateTime", "", "", "2026-11-03 12:09:31.204"),

    ("Occurrence", "id", "text", S, APP_ID, "PK", "", "Identificador único da ocorrência.", "String", "", "", "richards-oc-01"),
    ("Occurrence", "organizationId", "text", S, "", "FK", "Organization.id", "Organização da ocorrência.", "String", "", "", "richards-demo-org"),
    ("Occurrence", "siteId", "text", S, "", "FK", "Site.id", "Unidade onde a suspeita ocorreu.", "String", "", "", "richards-demo-site"),
    ("Occurrence", "deviceId", "text", N, "", "FK", "Device.id", "Dispositivo que originou a suspeita; nulo em ocorrência sem sensor.", "String?", "", "", "richards-flow-01"),
    ("Occurrence", "kind", "OccurrenceKind", S, "", "", "", "Tipo da suspeita.", "OccurrenceKind (enum)", "UNUSUAL_FLOW, DEVICE_OFFLINE, TEMPERATURE_EXCURSION, MANUAL", "Só UNUSUAL_FLOW é aberta automaticamente.", "UNUSUAL_FLOW"),
    ("Occurrence", "severity", "OccurrenceSeverity", S, "'MEDIUM'", "", "", "Gravidade. A abertura automática por fluxo contínuo usa HIGH.", "OccurrenceSeverity (enum)", "LOW, MEDIUM, HIGH, CRITICAL", "", "HIGH"),
    ("Occurrence", "status", "OccurrenceStatus", S, "'OPEN'", "", "", "Situação da investigação.", "OccurrenceStatus (enum)", "OPEN, ACKNOWLEDGED, RESOLVED, DISMISSED", "OPEN → ACKNOWLEDGED, RESOLVED ou DISMISSED; ACKNOWLEDGED → RESOLVED ou DISMISSED. No máximo uma UNUSUAL_FLOW ativa por dispositivo.", "OPEN"),
    ("Occurrence", "source", "DataSource", S, "", "", "", "Origem dos dados que geraram a ocorrência; SIMULATED é carimbado no BI e no PDF.", "DataSource (enum)", "DEVICE, SIMULATED", "", "DEVICE"),
    ("Occurrence", "title", "text", S, "", "", "", "Título curto.", "String", "", "", "Fluxo contínuo fora do padrão"),
    ("Occurrence", "description", "text", S, "", "", "", "Descrição com a regra que disparou.", "String", "", "", "Vazão igual ou superior a 1.5 L/min por 45 segundos. Requer verificação."),
    ("Occurrence", "suspectedLiters", "numeric(12,3)", N, "", "", "", "Volume estimado durante a janela suspeita. Estimativa para investigação, não perda comprovada.", "Decimal(12,3)?", "", "", "12.400"),
    ("Occurrence", "verificationNote", "text", N, "", "", "", "O que foi verificado e a ação tomada.", "String?", "", "Obrigatória para RESOLVED e DISMISSED (5 a 500 caracteres).", "Fluxo de demonstração encerrado."),
    ("Occurrence", "openedAt", "timestamp(3)", S, "CURRENT_TIMESTAMP", "", "", "Abertura da ocorrência.", "DateTime", "", "", "2026-11-03 08:50:03.000"),
    ("Occurrence", "acknowledgedAt", "timestamp(3)", N, "", "", "", "Quando alguém assumiu a investigação (ACKNOWLEDGED).", "DateTime?", "", "", "2026-11-03 09:18:03.000"),
    ("Occurrence", "resolvedAt", "timestamp(3)", N, "", "", "", "Quando foi encerrada (RESOLVED ou DISMISSED). Base do tempo médio até resolução.", "DateTime?", "", "", "2026-11-01 09:09:03.000"),

    ("OccurrenceEvent", "id", "text", S, APP_ID, "PK", "", "Identificador único do evento.", "String", "", "", "cmw0yspno000d24g3a08a2twn"),
    ("OccurrenceEvent", "occurrenceId", "text", S, "", "FK", "Occurrence.id", "Ocorrência a que o evento pertence.", "String", "", "", "richards-oc-01"),
    ("OccurrenceEvent", "action", "text", S, "", "", "", "Ação registrada na linha do tempo.", "String", "CREATED, ACKNOWLEDGED, RESOLVED, DISMISSED", "", "ACKNOWLEDGED"),
    ("OccurrenceEvent", "note", "text", N, "", "", "", "Nota informada na ação.", "String?", "", "Até 500 caracteres.", "Gerada automaticamente a partir de leituras do sensor"),
    ("OccurrenceEvent", "at", "timestamp(3)", S, "CURRENT_TIMESTAMP", "", "", "Data e hora do evento.", "DateTime", "", "", "2026-11-03 09:18:03.000"),
    ("OccurrenceEvent", "actor", "text", N, "", "", "", "Quem executou a ação.", "String?", "operador:<usuário>, dispositivo:<código>, simulador:<usuário>", "Definido pelo servidor; valor enviado pelo navegador é descartado.", "dispositivo:RICHARDS-FLOW-001"),

    ("RecipientOrganization", "id", "text", S, APP_ID, "PK", "", "Identificador único da instituição.", "String", "", "", "richards-demo-receptor"),
    ("RecipientOrganization", "name", "text", S, "", "", "", "Nome da instituição.", "String", "", "", "Instituição Parceira · Demonstração"),
    ("RecipientOrganization", "city", "text", S, "", "", "", "Cidade da instituição.", "String", "", "", "Ribeirão Preto"),
    ("RecipientOrganization", "active", "boolean", S, "true", "", "", "Só instituição ativa aparece para reserva e pode receber lote.", "Boolean", "true / false", "", "true"),

    ("DonationBatch", "id", "text", S, APP_ID, "PK", "", "Identificador único do lote.", "String", "", "", "richards-don-01"),
    ("DonationBatch", "organizationId", "text", S, "", "FK", "Organization.id", "Organização que oferta o excedente.", "String", "", "", "richards-demo-org"),
    ("DonationBatch", "recipientId", "text", N, "", "FK", "RecipientOrganization.id", "Instituição escolhida na reserva.", "String?", "", "Obrigatória para RESERVED e DELIVERED; a instituição tem de estar ativa.", "richards-demo-receptor"),
    ("DonationBatch", "description", "text", S, "", "", "", "O que é o lote.", "String", "", "4 a 180 caracteres.", "Frutas selecionadas · caixa mista"),
    ("DonationBatch", "weightKg", "numeric(12,3)", S, "", "", "", "Peso do lote em quilos.", "Decimal(12,3)", "", "Maior que 0 e até 100000.", "8.500"),
    ("DonationBatch", "status", "DonationStatus", S, "'PENDING_REVIEW'", "", "", "Etapa do lote.", "DonationStatus (enum)", "PENDING_REVIEW, AVAILABLE, RESERVED, DELIVERED, CANCELLED", "PENDING_REVIEW → AVAILABLE ou CANCELLED; AVAILABLE → RESERVED ou CANCELLED; RESERVED → DELIVERED ou CANCELLED. DELIVERED e CANCELLED são finais.", "DELIVERED"),
    ("DonationBatch", "source", "DataSource", S, "'MANUAL'", "", "", "Origem do registro: MANUAL (cadastro na interface) ou SIMULATED (seed).", "DataSource (enum)", "MANUAL, SIMULATED", "", "MANUAL"),
    ("DonationBatch", "safetyVerifiedBy", "text", N, "", "", "", "Nome de quem fez a verificação humana e sanitária.", "String?", "", "Obrigatório para AVAILABLE (3 a 120 caracteres); a interface também exige o checklist de 3 declarações.", "Responsável do cenário"),
    ("DonationBatch", "safetyVerifiedAt", "timestamp(3)", N, "", "", "", "Quando a verificação foi registrada (gravado ao passar para AVAILABLE).", "DateTime?", "", "", "2026-10-31 14:00:00.000"),
    ("DonationBatch", "receivedAt", "timestamp(3)", N, "", "", "", "Quando a entrega foi confirmada (DELIVERED). O KPI de kg entregues conta por esta data, não pela de cadastro.", "DateTime?", "", "", "2026-11-01 14:00:00.000"),
    ("DonationBatch", "createdAt", "timestamp(3)", S, "CURRENT_TIMESTAMP", "", "", "Cadastro do lote.", "DateTime", "", "", "2026-10-31 14:00:00.000"),
    ("DonationBatch", "receivedBy", "text", N, "", "", "", "Nome de quem recebeu o lote na instituição.", "String?", "", "Obrigatório para DELIVERED (3 a 120 caracteres).", "Recebedor do cenário"),
    ("DonationBatch", "cancelReason", "text", N, "", "", "", "Motivo do cancelamento.", "String?", "", "Obrigatório para CANCELLED (5 a 300 caracteres).", "Produto fora da temperatura adequada"),

    ("Mission", "id", "text", S, APP_ID, "PK", "", "Identificador único da missão.", "String", "", "", "sem dados no MVP"),
    ("Mission", "organizationId", "text", S, "", "FK", "Organization.id", "Organização da missão.", "String", "", "", "sem dados no MVP"),
    ("Mission", "occurrenceId", "text", N, "", "FK", "Occurrence.id", "Ocorrência que originou a missão (inspeção).", "String?", "", "", "sem dados no MVP"),
    ("Mission", "donationBatchId", "text", N, "", "FK", "DonationBatch.id", "Lote que originou a missão (coleta).", "String?", "", "", "sem dados no MVP"),
    ("Mission", "kind", "MissionKind", S, "", "", "", "Tipo da missão.", "MissionKind (enum)", "INSPECTION, PICKUP", "", "sem dados no MVP"),
    ("Mission", "status", "MissionStatus", S, "'OPEN'", "", "", "Situação da missão.", "MissionStatus (enum)", "OPEN, ASSIGNED, DONE, CANCELLED", "", "sem dados no MVP"),
    ("Mission", "title", "text", S, "", "", "", "Título da missão.", "String", "", "", "sem dados no MVP"),
    ("Mission", "assignedTo", "text", N, "", "", "", "Responsável (texto livre).", "String?", "", "", "sem dados no MVP"),
    ("Mission", "createdAt", "timestamp(3)", S, "CURRENT_TIMESTAMP", "", "", "Criação da missão.", "DateTime", "", "", "sem dados no MVP"),
    ("Mission", "completedAt", "timestamp(3)", N, "", "", "", "Conclusão da missão.", "DateTime?", "", "", "sem dados no MVP"),

    ("AuditEvent", "id", "text", S, APP_ID, "PK", "", "Identificador único do evento de auditoria.", "String", "", "", "cmw0yspno000d24g3a08a2twn"),
    ("AuditEvent", "organizationId", "text", S, "", "FK", "Organization.id", "Organização do registro auditado.", "String", "", "", "richards-demo-org"),
    ("AuditEvent", "entity", "text", S, "", "", "", "Tipo do registro auditado.", "String", "Occurrence, DonationBatch", "", "DonationBatch"),
    ("AuditEvent", "entityId", "text", S, "", "", "", "Id do registro auditado. Referência lógica sem FK, porque aponta para tabelas diferentes conforme entity.", "String", "", "", "richards-don-01"),
    ("AuditEvent", "action", "text", S, "", "", "", "Ação auditada.", "String", "Ocorrência: CREATED, ACKNOWLEDGED, RESOLVED, DISMISSED. Lote: CREATED, AVAILABLE, RESERVED, DELIVERED, CANCELLED.", "", "DELIVERED"),
    ("AuditEvent", "metadata", "jsonb", N, "", "", "", "Detalhes da ação. Sempre traz actor; conforme a ação: from (status anterior), note, verifiedBy, recipientId, recipientName, receivedBy, reason, weightKg. Na abertura automática de ocorrência, a evidência: windowStart, windowEnd, observedSeconds, suspectVolumeLiters, rule, trigger.", "Json?", "", "Gravado na mesma transação da mudança auditada.", '{"actor":"operador:operador","from":"RESERVED","receivedBy":"Recebedor do cenário"}'),
    ("AuditEvent", "at", "timestamp(3)", S, "CURRENT_TIMESTAMP", "", "", "Data e hora da ação.", "DateTime", "", "", "2026-11-03 09:18:03.000"),
]

# ---------------------------------------------------------------- relacionamentos
# (constraint, tabela filha, coluna FK, tabela pai, coluna referenciada, cardinalidade, obrigatoriedade, ON DELETE, ON UPDATE, leitura)
OBR, OPC = "Obrigatória (NOT NULL)", "Opcional (aceita nulo)"
RELACIONAMENTOS = [
    ("User_organizationId_fkey", "User", "organizationId", "Organization", "id", "1 : 0..N", OBR, "RESTRICT", "CASCADE", "Uma organização possui de 0 a N usuários; cada usuário pertence a exatamente uma organização."),
    ("Site_organizationId_fkey", "Site", "organizationId", "Organization", "id", "1 : 0..N", OBR, "RESTRICT", "CASCADE", "Uma organização mantém de 0 a N unidades."),
    ("Device_organizationId_fkey", "Device", "organizationId", "Organization", "id", "1 : 0..N", OBR, "RESTRICT", "CASCADE", "Uma organização cadastra de 0 a N dispositivos."),
    ("Device_siteId_fkey", "Device", "siteId", "Site", "id", "1 : 0..N", OBR, "RESTRICT", "CASCADE", "Uma unidade abriga de 0 a N dispositivos; cada dispositivo fica em exatamente uma unidade."),
    ("TelemetryReading_deviceId_fkey", "TelemetryReading", "deviceId", "Device", "id", "1 : 0..N", OBR, "RESTRICT", "CASCADE", "Um dispositivo envia de 0 a N leituras; dispositivo com leituras não pode ser excluído."),
    ("Occurrence_organizationId_fkey", "Occurrence", "organizationId", "Organization", "id", "1 : 0..N", OBR, "RESTRICT", "CASCADE", "Uma organização acompanha de 0 a N ocorrências."),
    ("Occurrence_siteId_fkey", "Occurrence", "siteId", "Site", "id", "1 : 0..N", OBR, "RESTRICT", "CASCADE", "Uma unidade registra de 0 a N ocorrências."),
    ("Occurrence_deviceId_fkey", "Occurrence", "deviceId", "Device", "id", "0..1 : 0..N", OPC, "SET NULL", "CASCADE", "Um dispositivo origina de 0 a N ocorrências; uma ocorrência pode não ter dispositivo."),
    ("OccurrenceEvent_occurrenceId_fkey", "OccurrenceEvent", "occurrenceId", "Occurrence", "id", "1 : 0..N", OBR, "CASCADE", "CASCADE", "Uma ocorrência tem de 0 a N eventos na linha do tempo; o evento não existe sem a ocorrência."),
    ("DonationBatch_organizationId_fkey", "DonationBatch", "organizationId", "Organization", "id", "1 : 0..N", OBR, "RESTRICT", "CASCADE", "Uma organização oferta de 0 a N lotes."),
    ("DonationBatch_recipientId_fkey", "DonationBatch", "recipientId", "RecipientOrganization", "id", "0..1 : 0..N", OPC, "SET NULL", "CASCADE", "Uma instituição recebe de 0 a N lotes; o lote só tem instituição a partir da reserva."),
    ("Mission_organizationId_fkey", "Mission", "organizationId", "Organization", "id", "1 : 0..N", OBR, "RESTRICT", "CASCADE", "Uma organização planeja de 0 a N missões (expansão)."),
    ("Mission_occurrenceId_fkey", "Mission", "occurrenceId", "Occurrence", "id", "0..1 : 0..N", OPC, "SET NULL", "CASCADE", "Uma ocorrência pode gerar de 0 a N missões de inspeção (expansão)."),
    ("Mission_donationBatchId_fkey", "Mission", "donationBatchId", "DonationBatch", "id", "0..1 : 0..N", OPC, "SET NULL", "CASCADE", "Um lote pode gerar de 0 a N missões de coleta (expansão)."),
    ("AuditEvent_organizationId_fkey", "AuditEvent", "organizationId", "Organization", "id", "1 : 0..N", OBR, "RESTRICT", "CASCADE", "Uma organização registra de 0 a N eventos de auditoria."),
]
REFERENCIA_LOGICA = ("(referência lógica, sem FK)", "AuditEvent", "entity + entityId", "Occurrence ou DonationBatch", "id", "1 : 0..N", OBR, "—", "—",
                     "Cada evento de auditoria aponta para uma ocorrência ou um lote; não há FK porque o destino muda conforme entity.")

# ---------------------------------------------------------------- domínios (enums)
# (enum, valor, significado, usado em, situação)
DOMINIOS = [
    ("Role", "OWNER", "Responsável pela organização.", "User.role", "Gravado pelo seed"),
    ("Role", "OPERATOR", "Operador do dia a dia (padrão).", "User.role", "Reservado: sem login por usuário no MVP"),
    ("Role", "ANALYST", "Analista com acesso de leitura.", "User.role", "Reservado: sem login por usuário no MVP"),
    ("Role", "RECIPIENT", "Pessoa de instituição receptora.", "User.role", "Reservado: sem login por usuário no MVP"),
    ("DeviceKind", "FLOW", "Sensor de vazão (YF-S201 no ESP32).", "Device.kind", "Em uso"),
    ("DeviceKind", "SCALE", "Balança.", "Device.kind", "Reservado"),
    ("DeviceKind", "TEMPERATURE", "Sensor de temperatura.", "Device.kind", "Reservado"),
    ("DeviceState", "ONLINE", "Gravável, mas a conectividade exibida é calculada por lastSeenAt.", "Device.state", "Não usado para exibição"),
    ("DeviceState", "OFFLINE", "Valor padrão; conectividade exibida é calculada por lastSeenAt.", "Device.state", "Padrão"),
    ("DeviceState", "MAINTENANCE", "Em manutenção por decisão humana; prevalece sobre o cálculo.", "Device.state", "Respeitado pelo cálculo"),
    ("DataSource", "DEVICE", "Veio do sensor físico (ESP32).", "TelemetryReading.source, Occurrence.source", "Em uso"),
    ("DataSource", "SIMULATED", "Gerado pelo simulador ou pelo seed; carimbado como simulado no BI e no PDF.", "TelemetryReading.source, Occurrence.source, DonationBatch.source", "Em uso"),
    ("DataSource", "MANUAL", "Cadastrado por pessoa na interface.", "DonationBatch.source", "Em uso"),
    ("OccurrenceStatus", "OPEN", "Aberta, aguardando alguém assumir.", "Occurrence.status", "Em uso"),
    ("OccurrenceStatus", "ACKNOWLEDGED", "Em análise: alguém assumiu a investigação.", "Occurrence.status", "Em uso"),
    ("OccurrenceStatus", "RESOLVED", "Encerrada com nota da verificação e da ação tomada.", "Occurrence.status", "Em uso"),
    ("OccurrenceStatus", "DISMISSED", "Descartada (ex.: uso legítimo), com nota.", "Occurrence.status", "Em uso"),
    ("OccurrenceSeverity", "LOW", "Baixa.", "Occurrence.severity", "Em uso"),
    ("OccurrenceSeverity", "MEDIUM", "Média (padrão).", "Occurrence.severity", "Em uso"),
    ("OccurrenceSeverity", "HIGH", "Alta; usada na abertura automática por fluxo contínuo.", "Occurrence.severity", "Em uso"),
    ("OccurrenceSeverity", "CRITICAL", "Crítica.", "Occurrence.severity", "Reservado"),
    ("OccurrenceKind", "UNUSUAL_FLOW", "Fluxo contínuo acima do limiar pelo tempo configurado.", "Occurrence.kind", "Em uso (abertura automática)"),
    ("OccurrenceKind", "DEVICE_OFFLINE", "Perda de comunicação do sensor.", "Occurrence.kind", "Só no cenário do seed"),
    ("OccurrenceKind", "TEMPERATURE_EXCURSION", "Temperatura fora da faixa.", "Occurrence.kind", "Reservado"),
    ("OccurrenceKind", "MANUAL", "Aberta manualmente por pessoa.", "Occurrence.kind", "Reservado"),
    ("DonationStatus", "PENDING_REVIEW", "Cadastrado, aguardando verificação humana (padrão).", "DonationBatch.status", "Em uso"),
    ("DonationStatus", "AVAILABLE", "Verificado (nome + checklist), disponível para destino.", "DonationBatch.status", "Em uso"),
    ("DonationStatus", "RESERVED", "Reservado para instituição ativa.", "DonationBatch.status", "Em uso"),
    ("DonationStatus", "DELIVERED", "Entrega confirmada com nome de quem recebeu; conta como impacto.", "DonationBatch.status", "Em uso"),
    ("DonationStatus", "CANCELLED", "Cancelado com motivo.", "DonationBatch.status", "Em uso"),
    ("MissionKind", "INSPECTION", "Inspeção de ocorrência.", "Mission.kind", "Reservado"),
    ("MissionKind", "PICKUP", "Coleta de lote de doação.", "Mission.kind", "Reservado"),
    ("MissionStatus", "OPEN", "Aberta (padrão).", "Mission.status", "Reservado"),
    ("MissionStatus", "ASSIGNED", "Atribuída a um responsável.", "Mission.status", "Reservado"),
    ("MissionStatus", "DONE", "Concluída.", "Mission.status", "Reservado"),
    ("MissionStatus", "CANCELLED", "Cancelada.", "Mission.status", "Reservado"),
]

# ---------------------------------------------------------------- índices
# (tabela, nome, tipo, colunas, finalidade)
INDICES = [(t, f"{t}_pkey", "Chave primária", "id", "Identifica o registro.") for t, *_ in TABELAS] + [
    ("User", "User_email_key", "Único", "email", "Impede e-mail repetido."),
    ("Device", "Device_code_key", "Único", "code", "Localiza o dispositivo pelo código enviado em cada leitura."),
    ("Device", "Device_organizationId_kind_idx", "Índice", "organizationId, kind", "Lista dispositivos da organização por tipo."),
    ("TelemetryReading", "TelemetryReading_deviceId_bootId_sequence_key", "Único", "deviceId, bootId, sequence", "Idempotência: a mesma leitura reenviada é ignorada (INSERT ... ON CONFLICT DO NOTHING)."),
    ("TelemetryReading", "TelemetryReading_deviceId_capturedAt_idx", "Índice", "deviceId, capturedAt DESC", "Série temporal do BI, última leitura e janela da regra de alerta."),
    ("Occurrence", "Occurrence_organizationId_status_openedAt_idx", "Índice", "organizationId, status, openedAt DESC", "Fila de ocorrências ativas e contagens por status."),
    ("DonationBatch", "DonationBatch_organizationId_status_createdAt_idx", "Índice", "organizationId, status, createdAt DESC", "Quadro de lotes por etapa."),
    ("Mission", "Mission_organizationId_status_createdAt_idx", "Índice", "organizationId, status, createdAt DESC", "Reservado para a fila de missões (expansão)."),
    ("AuditEvent", "AuditEvent_organizationId_at_idx", "Índice", "organizationId, at DESC", "Trilha de auditoria recente por organização."),
]

# ---------------------------------------------------------------- regras
# (regra, onde é garantida, tabelas e colunas, como)
REGRAS = [
    ("Leitura reenviada não soma volume duas vezes.", "Banco + aplicação", "TelemetryReading (deviceId, bootId, sequence)", "Índice único composto; a gravação usa INSERT ... ON CONFLICT DO NOTHING e responde 'duplicada' sem erro."),
    ("Leitura aceita não é alterada.", "Aplicação", "TelemetryReading", "Não existe rota de edição ou exclusão de leituras."),
    ("Volume = soma de deltaLiters; vazão nunca é somada.", "Aplicação", "TelemetryReading.deltaLiters, flowLpm", "Consultas do BI e do PDF somam deltaLiters; flowLpm só aparece como taxa (média e pico)."),
    ("Litros observados ≠ litros economizados; suspeita ≠ vazamento comprovado.", "Aplicação", "TelemetryReading.deltaLiters, Occurrence.suspectedLiters", "Rótulos do BI e do PDF; suspectedLiters é estimativa da janela suspeita."),
    ("No máximo uma ocorrência UNUSUAL_FLOW ativa (OPEN/ACKNOWLEDGED) por dispositivo.", "Aplicação", "Occurrence (deviceId, kind, status)", "pg_advisory_xact_lock por dispositivo + verificação e criação na mesma transação; não há constraint no banco."),
    ("Alerta usa só leituras da mesma origem.", "Aplicação", "TelemetryReading.source", "Leituras SIMULATED nunca sustentam alerta de DEVICE, nem o contrário."),
    ("Leitura com relógio fora de ±5 min é recusada.", "Aplicação", "TelemetryReading.capturedAt", "Sem hora confiável não há leitura confiável."),
    ("Chave do dispositivo nunca é gravada nem devolvida.", "Aplicação", "Device.apiKeyHash", "Só o hash SHA-256 é gravado; comparação em tempo constante; GETs não expõem o hash."),
    ("Encerrar ocorrência exige nota.", "Aplicação", "Occurrence.verificationNote", "RESOLVED e DISMISSED exigem nota de 5 a 500 caracteres."),
    ("Mudanças de status não se sobrescrevem.", "Aplicação", "Occurrence.status, DonationBatch.status", "Guarda otimista: atualiza só se o status ainda é o lido; senão responde conflito."),
    ("Lote só fica disponível com verificação humana documentada.", "Aplicação", "DonationBatch.safetyVerifiedBy, safetyVerifiedAt", "AVAILABLE exige nome de quem verificou; a interface exige também o checklist."),
    ("Reserva só para instituição ativa.", "Banco + aplicação", "DonationBatch.recipientId, RecipientOrganization.active", "FK garante que a instituição existe; a aplicação recusa instituição inativa."),
    ("Entrega só com recebedor.", "Aplicação", "DonationBatch.receivedBy, receivedAt", "DELIVERED exige nome de quem recebeu; receivedAt é gravado na hora."),
    ("Cancelamento exige motivo.", "Aplicação", "DonationBatch.cancelReason", "CANCELLED exige motivo de 5 a 300 caracteres."),
    ("Kg entregues contam pela data de entrega.", "Aplicação", "DonationBatch.receivedAt", "O KPI soma weightKg de lotes DELIVERED com receivedAt no período."),
    ("Toda ação persistente é auditada na mesma transação.", "Aplicação", "AuditEvent, OccurrenceEvent", "A mudança, o evento da linha do tempo e a auditoria são gravados juntos ou nenhum é gravado."),
    ("Dado simulado é sempre identificado.", "Banco + aplicação", "TelemetryReading.source, Occurrence.source, DonationBatch.source", "A coluna source guarda a origem; BI, API e PDF carimbam SIMULATED."),
    ("Registros com dependentes não são apagados por acidente.", "Banco", "FKs RESTRICT", "Organização, unidade e dispositivo com filhos não podem ser excluídos; a aplicação não oferece exclusão."),
    ("Datas gravadas em UTC e exibidas no horário de Brasília.", "Aplicação", "Colunas timestamp(3)", "timestamp sem fuso preenchido em UTC; o BI e o PDF convertem para America/Sao_Paulo."),
]

# ---------------------------------------------------------------- estilo
F = "Arial"
thin = Side(style="thin", color=LINE)
BORDER = Border(left=thin, right=thin, top=thin, bottom=thin)
HEAD_FONT = Font(name=F, size=10, bold=True, color="FFFFFF")
HEAD_FILL = PatternFill("solid", fgColor=NAV)
BAND_FILL = PatternFill("solid", fgColor=BAND)
BODY = Font(name=F, size=10, color=INK)
WRAP = Alignment(wrap_text=True, vertical="top")


def sheet(wb, title, headers, rows, widths, band_key=None, first=False):
    ws = wb.active if first else wb.create_sheet()
    ws.title = title
    ws.append(headers)
    for c in ws[1]:
        c.font, c.fill, c.alignment, c.border = HEAD_FONT, HEAD_FILL, Alignment(wrap_text=True, vertical="center"), BORDER
    ws.row_dimensions[1].height = 30
    band, last = False, object()
    for r in rows:
        ws.append(list(r))
        row = ws.max_row
        if band_key is not None and r[band_key] != last:
            band, last = not band, r[band_key]
        for c in ws[row]:
            c.font, c.alignment, c.border = BODY, WRAP, BORDER
            if band and band_key is not None:
                c.fill = BAND_FILL
    for i, w in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(i)].width = w
    ws.freeze_panes = "C2" if title == "Dicionário" else "B2"
    ws.auto_filter.ref = f"A1:{get_column_letter(len(headers))}{ws.max_row}"
    ws.page_setup.orientation = "landscape"
    ws.page_setup.fitToWidth, ws.page_setup.fitToHeight = 1, 0
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.print_title_rows = "1:1"
    return ws


def build():
    wb = Workbook()
    sobre = wb.active
    sobre.title = "Sobre"

    sheet(wb, "Tabelas", ["Tabela", "Nome de negócio", "Grupo", "Descrição", "Chave primária", "Nº de colunas", "Obrigatórias", "Chaves estrangeiras", "Situação no MVP", "Observações"],
          [(t, n, g, d, "id", None, None, None, s, o) for t, n, g, d, s, o in TABELAS], [22, 22, 20, 52, 10, 10, 11, 12, 15, 60])
    ws = wb["Tabelas"]
    for r in range(2, ws.max_row + 1):
        ws[f"F{r}"] = f"=COUNTIF('Dicionário'!$A:$A,A{r})"
        ws[f"G{r}"] = f"=COUNTIFS('Dicionário'!$A:$A,A{r},'Dicionário'!$F:$F,\"Sim\")"
        ws[f"H{r}"] = f"=COUNTIFS('Dicionário'!$A:$A,A{r},'Dicionário'!$I:$I,\"FK*\")"
        for col in "FGH":
            ws[f"{col}{r}"].alignment = Alignment(horizontal="center", vertical="top")
        ws[f"A{r}"].font = Font(name=F, size=10, bold=True, color=INK)

    ordem = {}
    rows = []
    for t, c, pg, obr, pad, chave, ref, desc, prisma, val, regra, ex in COLUNAS:
        ordem[t] = ordem.get(t, 0) + 1
        rows.append((t, c, ordem[t], desc, pg, obr, pad, prisma, chave, ref, val, regra, ex))
    ws = sheet(wb, "Dicionário", ["Tabela", "Coluna", "Nº", "Descrição", "Tipo PostgreSQL", "Obrigatório", "Padrão", "Tipo Prisma", "Chave", "Referência (FK)", "Valores permitidos", "Regra / validação na aplicação", "Exemplo"],
               rows, [20, 24, 5, 58, 17, 11, 22, 20, 15, 24, 34, 44, 34], band_key=0)
    for r in range(2, ws.max_row + 1):
        ws[f"B{r}"].font = Font(name=F, size=10, bold=True, color=INK)
        ws[f"C{r}"].alignment = Alignment(horizontal="center", vertical="top")
        ws[f"F{r}"].alignment = Alignment(horizontal="center", vertical="top")
        if ws[f"I{r}"].value:
            ws[f"I{r}"].font = Font(name=F, size=10, bold=True, color=ACCENT)

    sheet(wb, "Relacionamentos", ["Constraint", "Tabela filha", "Coluna FK", "Tabela pai", "Coluna referenciada", "Cardinalidade (pai : filha)", "Obrigatoriedade na filha", "ON DELETE", "ON UPDATE", "Leitura de negócio"],
          RELACIONAMENTOS + [REFERENCIA_LOGICA], [36, 20, 18, 22, 12, 14, 22, 11, 11, 70])
    sheet(wb, "Domínios", ["Tipo enumerado", "Valor", "Significado", "Usado em", "Situação no MVP"], DOMINIOS, [20, 24, 62, 44, 34], band_key=0)
    sheet(wb, "Índices", ["Tabela", "Nome", "Tipo", "Colunas", "Finalidade"], INDICES, [20, 50, 15, 36, 70])
    sheet(wb, "Regras", ["Regra", "Onde é garantida", "Tabelas e colunas", "Como"], REGRAS, [52, 18, 44, 80])

    # ---------------- capa / resumo
    s = sobre
    s.column_dimensions["A"].width, s.column_dimensions["B"].width, s.column_dimensions["C"].width = 34, 16, 70
    s["A1"] = "RICHARDS Intelligence — Dicionário de Dados"
    s["A1"].font = Font(name=F, size=18, bold=True, color=NAV)
    s["A2"] = f"Banco PostgreSQL 16 · schema public · ORM Prisma 7 · conferido no banco em {DATA_CONFERENCIA}"
    s["A2"].font = Font(name=F, size=10, color=MUTED)
    s["A3"] = "Fonte da verdade: prisma/schema.prisma e as migrations em prisma/migrations (20261103120000_init, 20261103130000_occurrence_event_actor, 20261103140000_donation_receipt)."
    s["A3"].font = Font(name=F, size=10, color=MUTED)

    s["A5"], s["B5"], s["C5"] = "Resumo", "Total", "Como é contado"
    for c in s[5]:
        c.font, c.fill, c.border = HEAD_FONT, HEAD_FILL, BORDER
    n_dom = len(DOMINIOS) + 1
    resumo = [
        ("Tabelas", "=COUNTA(Tabelas!A:A)-1", "Linhas da aba Tabelas."),
        ("Colunas", "=COUNTA('Dicionário'!B:B)-1", "Linhas da aba Dicionário."),
        ("Colunas obrigatórias (NOT NULL)", "=COUNTIF('Dicionário'!F:F,\"Sim\")", "Obrigatório = Sim."),
        ("Colunas opcionais (aceitam nulo)", "=COUNTIF('Dicionário'!F:F,\"Não\")", "Obrigatório = Não."),
        ("Chaves estrangeiras", "=COUNTIF(Relacionamentos!A:A,\"*_fkey\")", "Constraints FOREIGN KEY (sem a referência lógica de AuditEvent)."),
        ("Tipos enumerados", f"=SUMPRODUCT(1/COUNTIF('Domínios'!A2:A{n_dom},'Domínios'!A2:A{n_dom}))", "Enums distintos na aba Domínios."),
        ("Valores de enum", "=COUNTA('Domínios'!B:B)-1", "Linhas da aba Domínios."),
        ("Índices (inclui chaves primárias)", "=COUNTA('Índices'!B:B)-1", "Linhas da aba Índices."),
    ]
    for i, (a, b, c) in enumerate(resumo, start=6):
        s[f"A{i}"], s[f"B{i}"], s[f"C{i}"] = a, b, c
        for col in "ABC":
            s[f"{col}{i}"].font, s[f"{col}{i}"].border = BODY, BORDER
        s[f"B{i}"].alignment = Alignment(horizontal="center")
    r = 6 + len(resumo)
    s[f"A{r}"] = "Conferência com o banco"
    s[f"B{r}"] = (f"=IF(AND(B6={BANCO['tabelas']},B7={BANCO['colunas']},B10={BANCO['fks']},B13={BANCO['indices']}),\"OK\",\"DIVERGENTE\")")
    s[f"C{r}"] = (f"Leitura do information_schema, pg_constraint e pg_indexes em {DATA_CONFERENCIA}: "
                  f"{BANCO['tabelas']} tabelas, {BANCO['colunas']} colunas, {BANCO['fks']} chaves estrangeiras, {BANCO['indices']} índices.")
    for col in "ABC":
        s[f"{col}{r}"].font, s[f"{col}{r}"].border = Font(name=F, size=10, bold=True, color=INK), BORDER
        s[f"{col}{r}"].alignment = Alignment(wrap_text=True, vertical="top", horizontal="center" if col == "B" else None)
    s.row_dimensions[r].height = 30

    r += 2
    s[f"A{r}"] = "Como ler a aba Dicionário"
    s[f"A{r}"].font = Font(name=F, size=12, bold=True, color=NAV)
    legenda = [
        ("Tabela / Coluna", "Nomes físicos no PostgreSQL (iguais ao Prisma)."),
        ("Tipo PostgreSQL", "text, boolean, integer, double precision, numeric(12,3) = 12 dígitos com 3 decimais, timestamp(3) = data e hora com milissegundos sem fuso (gravada em UTC), jsonb, ou o nome de um tipo enumerado (ver aba Domínios)."),
        ("Obrigatório", "Sim = NOT NULL. Não = aceita nulo."),
        ("Padrão", "Valor gravado pelo banco quando a aplicação não informa. 'cuid() — gerado pela aplicação' = id criado pelo Prisma antes do INSERT."),
        ("Chave", "PK = chave primária · FK = chave estrangeira · UK = único · UK composta = único em conjunto com outras colunas."),
        ("Regra / validação na aplicação", "Validações feitas pela API (Zod e regras de domínio) antes de gravar; não são constraints do banco."),
        ("Exemplo", "Valor ilustrativo no formato real. Dados da demonstração são SIMULADOS; nenhum segredo aparece aqui."),
    ]
    for i, (a, b) in enumerate(legenda, start=r + 1):
        s[f"A{i}"], s[f"C{i}"] = a, b
        s[f"A{i}"].font = Font(name=F, size=10, bold=True, color=INK)
        s[f"C{i}"].font = BODY
        s[f"C{i}"].alignment = Alignment(wrap_text=True, vertical="top")
        s[f"A{i}"].alignment = Alignment(vertical="top")
    r = r + len(legenda) + 2
    s[f"A{r}"] = "Diagramas"
    s[f"A{r}"].font = Font(name=F, size=12, bold=True, color=NAV)
    s[f"A{r + 1}"] = "MER (conceitual) e DER (lógico): docs/dados/MER_DER.pdf, MER.png, DER.png e as fontes editáveis mer.mmd e der.mmd."
    s[f"A{r + 1}"].font = BODY
    s.sheet_view.showGridLines = False
    s.page_setup.orientation = "landscape"
    s.page_setup.fitToWidth, s.page_setup.fitToHeight = 1, 0
    s.sheet_properties.pageSetUpPr.fitToPage = True
    wb.active = 0

    OUT.parent.mkdir(parents=True, exist_ok=True)
    wb.calculation.fullCalcOnLoad = True
    wb.save(OUT)
    print(f"{OUT} · {len(TABELAS)} tabelas · {len(COLUNAS)} colunas · {len(RELACIONAMENTOS)} FKs · {len(DOMINIOS)} valores de enum · {len(INDICES)} índices")


if __name__ == "__main__":
    build()
