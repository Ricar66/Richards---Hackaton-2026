# Broker MQTT da bancada (VPS e notebook). Ideia e primeira versão: PR #4 do Victor.
# Diferenças: sem acesso anônimo, senha e ACL geradas na partida a partir de variáveis (nada de segredo no git),
# versão fixa (a mesma do teste com broker real, pnpm test:mqtt-broker).
# Teste local do broker: docker build -t richards-mqtt mosquitto && ver docs/DEPLOY_VPS_TETRIA.md, "Broker MQTT".
# 2.1.2 travado por digest (o Docker Hub não publica a tag 2.1.2; a tag 2 anda sozinha).
FROM eclipse-mosquitto:2@sha256:860aeb5d63ce509508f6dcfb2bc8a1c1dd2bc60555b562b45ce90e52d8dabb0f
COPY mosquitto.conf /mosquitto/config/mosquitto.conf
COPY entrypoint.sh /richards-entrypoint.sh
RUN chmod 0755 /richards-entrypoint.sh
ENTRYPOINT ["/richards-entrypoint.sh"]
