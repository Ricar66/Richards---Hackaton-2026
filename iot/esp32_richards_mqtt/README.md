# Firmware MQTT da bancada (ESP32-S3 + HX711 + DHT22)

Este é o firmware do Victor que publica no broker MQTT. A ponte `pnpm mqtt` grava as leituras pelos mesmos casos de uso do HTTP. O firmware HTTP antigo continua em `iot/esp32_richards/`.

> **Falta o código.** O PR #5 trouxe só o exemplo de segredos. O `.ino` do ESP32-S3 com HX711, DHT22 e MQTT para a VPS **ainda não está no repositório**: o arquivo do fork é idêntico ao firmware HTTP antigo. Ele funciona na prática (a VPS recebeu 880 leituras e um alerta real de temperatura em 07/11), mas precisa ser versionado aqui.

## Como enviar

1. Copiar o `.ino` da Arduino IDE para esta pasta: `iot/esp32_richards_mqtt/esp32_richards_mqtt.ino`. O nome da pasta e o do `.ino` precisam ser iguais, regra da Arduino IDE.
2. **Não** enviar o `secrets.h`. Ele está no `.gitignore`; só o `secrets.h.example` vai para o git.
3. Abrir o PR para a branch **`develop`**, não para o `main`.

## O que a plataforma espera (contrato completo em `docs/CONTRATO_IOT.md`, "Canal MQTT")

- **Tópico:** `richards/comercio/telemetria/hortifruti_01`, o único aceito pela ACL do broker da VPS.
- **Usuário:** `hortifruti_01`, igual ao `dispositivo_id`. A senha vem no privado.
- **JSON:** `{"dispositivo_id":"hortifruti_01","VAZAO":2.4,"TEMP":26.1,"UMIDADE":60,"PESO":0.0}`. Os sensores são opcionais, mas pelo menos um precisa vir.
- **Publicação:** QoS 0 ou 1, **sem `retain`**. A ponte ignora mensagem retida, porque é leitura velha.
- **Origem:** a vazão do potenciômetro entra carimbada **SIMULADO**. Temperatura (DHT22) e peso (HX711) entram como dado real.
- **Balança:** o lote nasce com 1,5 kg estáveis por 6 s, sem salto maior que 0,15 kg ou 5%. Coloque o objeto de uma vez e espere.
- **Idempotência:** opcional. Mandar `bootId` e `sequence` juntos evita contar duas vezes uma reentrega.
