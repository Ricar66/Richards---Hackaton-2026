# Firmware MQTT — exclusivamente vazão

Contrato em docs/CONTRATO_IOT.md: publicar dispositivo_id, VAZAO e, preferencialmente, bootId/sequence. Ponte exige vazão e ignora campos extras antigos. Firmware MQTT completo atualizado precisa ser enviado/revisado com Victor; compilação e ensaio físico desta alteração não foram executados.

Identidade deve corresponder ao tópico/ACL e ao apelido na ponte. Não versionar credenciais nem exibi-las em fotos. Potenciômetro é SIMULATED; DEVICE não comprova calibração. Firmware HTTP existente permanece em iot/esp32_richards/.
