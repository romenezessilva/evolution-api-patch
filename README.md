# Patch Evolution API — issue #2778 (instância "open" que para de receber)

## O problema

Desde ~setembro/2026 o WhatsApp envia stanzas `<status>` de nível superior que o
Baileys `7.0.0-rc.9` (usado pela Evolution `v2.3.7`) **nunca confirma**. Cerca de
50 minutos depois o servidor derruba o stream. A instância:

- continua reportando `connectionStatus: "open"`;
- continua **enviando** mensagens normalmente;
- **para de receber**: nada é gravado na tabela `Message`, nenhum webhook dispara.

Reiniciar a instância **não resolve**. Reiniciar o container **não resolve**.
Refazer o QR resolve por algumas horas, até recorrer.

Referência: https://github.com/evolution-foundation/evolution-api/issues/2778

## A correção

Registrar um handler que apenas confirma a stanza:

```js
ws.on('CB:status', (node) => {
    sendMessageAck(node).catch(error => onUnexpectedError(error, 'acking status stanza'));
});
```

A Evolution ignora Status (`readStatus: false`), então nada é perdido.

---

## Rota A — NÃO FUNCIONA NESTE SERVIDOR

> **Atenção:** este serviço roda em **Docker Swarm** (o container aparece como
> `evolutionapi_evolution-api.1.<hash>`). Em Swarm, **Restart destrói a task e
> cria outra a partir da imagem** — qualquer alteração no filesystem do container
> é perdida. E o patch só passa a valer depois de reiniciar o processo.
> Ou seja: o passo que ativa o patch é o mesmo que o apaga. Testado em 12/11/2026:
> `patch aplicado` + `OK`, Restart, e o arquivo voltou ao original.
>
> **Use a Rota B.** O texto abaixo fica só como registro.

Aplica o patch dentro do container que já está rodando.

1. Easypanel → projeto `evolutionapi` → serviço `evolution-api` → **Terminal/Console**.
2. Cole:

```sh
cat > /tmp/patch.js <<'EOF'
const fs = require('fs');
const f = '/evolution/node_modules/baileys/lib/Socket/messages-recv.js';
let s = fs.readFileSync(f, 'utf8');
if (s.includes('CB:status')) { console.log('ja aplicado'); process.exit(0); }
const m = s.match(/^([ \t]*)ws\.on\((['"])CB:notification\2/m);
if (!m) { console.error('ancora nao encontrada - NAO force'); process.exit(1); }
const p = m[1] + "ws.on('CB:status', (node) => { sendMessageAck(node).catch(error => onUnexpectedError(error, 'acking status stanza')); });\n";
fs.writeFileSync(f + '.orig', s);
fs.writeFileSync(f, s.slice(0, m.index) + p + s.slice(m.index));
console.log('patch aplicado');
EOF
node /tmp/patch.js && node --check /evolution/node_modules/baileys/lib/Socket/messages-recv.js && echo OK
```

3. Se imprimir `patch aplicado` e `OK`, **reinicie o serviço** no Easypanel
   (Restart). Sem o restart o processo continua com o código antigo em memória.
4. Mande uma mensagem de teste e confirme que ela chega.

Para desfazer: `cp <arquivo>.orig <arquivo>` e reiniciar.

---

## Rota B — resolver de vez (imagem derivada)

Sobrevive a deploys. Os arquivos desta pasta (`Dockerfile` + `patch-baileys.js`)
são o que o build precisa.

1. Suba esta pasta para um repositório Git (pode ser privado).
2. Easypanel → serviço `evolution-api` → **Source**: troque de imagem Docker para
   o repositório, apontando para a pasta `evolution-patch`.
3. **Mantenha intactos** os Environment Variables e os Volumes/Mounts atuais —
   é neles que estão as credenciais e as sessões das 4 instâncias. Trocar a
   origem da imagem não deve tocar nisso; confira antes de dar Deploy.
4. Deploy. Se o Baileys não for exatamente `7.0.0-rc.9`, **o build falha de
   propósito** — melhor falhar que subir um container que parece bom e não recebe.

### Quando remover o patch

Quando sair uma versão oficial com a correção (o PR #2785 da Evolution estava
*blocked*, e pediram uma release `2.3.8`). Aí basta voltar o Source para a imagem
oficial na versão nova.

---

## Avisos

- Isto é patch de terceiro em `node_modules`, validado por usuários na thread da
  issue, **não pelos mantenedores**. O risco é baixo — só adiciona um ack para
  stanzas que a Evolution já descarta — mas é modificação não-oficial.
- Reiniciar o serviço derruba as **4 instâncias** do servidor (Tapecaria_Correia,
  Demo Learn, Desafio_Saan, Financeiro). Elas reconectam sozinhas, sem QR, mas
  ficam alguns segundos fora do ar. Evite no meio de um atendimento.
- O patch **não** exige reparear nenhuma instância.
