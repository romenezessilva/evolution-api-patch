# Imagem derivada da Evolution API com o patch da issue #2778 aplicado.
#
# O patch confirma (ack) as stanzas <status> que o WhatsApp passou a enviar e
# que o Baileys 7.0.0-rc.9 ignora, o que derruba o stream e faz a instancia
# parar de receber mensagens enquanto continua reportando "open".
#
# Versao fixada de proposito: se o patch nao casar com a versao do Baileys,
# o build FALHA em vez de subir um container silenciosamente quebrado.

FROM evoapicloud/evolution-api:v2.3.7

COPY patch-baileys.js /tmp/patch-baileys.js

RUN node /tmp/patch-baileys.js /evolution/node_modules/baileys \
    && node --check /evolution/node_modules/baileys/lib/Socket/messages-recv.js \
    && echo "[build] patch aplicado e sintaxe validada" \
    && rm /tmp/patch-baileys.js
