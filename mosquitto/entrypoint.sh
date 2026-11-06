#!/bin/sh
# Gera o arquivo de senhas e a ACL a partir das variáveis do contêiner e sobe o Mosquitto.
#  - a ponte (MQTT_BRIDGE_USER) só LÊ o tópico da bancada;
#  - o dispositivo (MQTT_DEVICE_USER, igual ao dispositivo_id do firmware) só ESCREVE no tópico compartilhado e no
#    próprio (<tópico>/<dispositivo_id>). Ninguém mais conecta (allow_anonymous false).
set -eu
: "${MQTT_TOPIC:=richards/comercio/telemetria}"
: "${MQTT_BRIDGE_USER:?defina MQTT_BRIDGE_USER}"
: "${MQTT_BRIDGE_PASSWORD:?defina MQTT_BRIDGE_PASSWORD}"
: "${MQTT_DEVICE_USER:?defina MQTT_DEVICE_USER}"
: "${MQTT_DEVICE_PASSWORD:?defina MQTT_DEVICE_PASSWORD}"
umask 077
mkdir -p /mosquitto/data
rm -f /mosquitto/data/passwd /mosquitto/data/acl
mosquitto_passwd -b -c /mosquitto/data/passwd "$MQTT_BRIDGE_USER" "$MQTT_BRIDGE_PASSWORD"
mosquitto_passwd -b /mosquitto/data/passwd "$MQTT_DEVICE_USER" "$MQTT_DEVICE_PASSWORD"
cat > /mosquitto/data/acl <<EOF
user $MQTT_BRIDGE_USER
topic read $MQTT_TOPIC
topic read $MQTT_TOPIC/+

user $MQTT_DEVICE_USER
topic write $MQTT_TOPIC
topic write $MQTT_TOPIC/$MQTT_DEVICE_USER
EOF
chown -R mosquitto:mosquitto /mosquitto/data
chmod 0700 /mosquitto/data/passwd /mosquitto/data/acl
echo "[mosquitto] usuários: ponte=$MQTT_BRIDGE_USER (lê), dispositivo=$MQTT_DEVICE_USER (escreve em $MQTT_TOPIC e $MQTT_TOPIC/$MQTT_DEVICE_USER); anônimo recusado"
exec /usr/sbin/mosquitto -c /mosquitto/config/mosquitto.conf
