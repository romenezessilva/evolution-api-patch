#!/usr/bin/env node
/**
 * Patch do Baileys para a issue evolution-api#2778.
 *
 * Problema: desde ~set/2026 o WhatsApp envia stanzas <status> de nivel superior
 * que o Baileys 7.0.0-rc.9 nao confirma (ack). ~50 min depois o servidor derruba
 * o stream. A instancia fica "open", continua ENVIANDO, e para de RECEBER:
 * nada gravado na tabela Message, nenhum webhook disparado.
 *
 * Correcao: registrar um handler para 'CB:status' que apenas confirma a stanza.
 * A Evolution ignora Status (readStatus: false), entao nada e perdido.
 *
 * O script e idempotente: rodar duas vezes nao duplica o patch.
 * Falha com exit != 0 se a versao do Baileys nao for a esperada.
 */

const fs = require('fs');
const path = require('path');

const BAILEYS_DIR = process.argv[2] || '/evolution/node_modules/baileys';
const EXPECTED_VERSION = process.env.BAILEYS_EXPECTED_VERSION || '7.0.0-rc.9';
const TARGET = path.join(BAILEYS_DIR, 'lib', 'Socket', 'messages-recv.js');

const PATCH = [
    "    // [patch evolution-api#2778] confirma stanzas <status> de nivel superior;",
    "    // sem isso o WhatsApp derruba o stream e a instancia para de receber.",
    "    ws.on('CB:status', (node) => {",
    "        sendMessageAck(node).catch(error => onUnexpectedError(error, 'acking status stanza'));",
    "    });",
    "",
].join('\n');

function fail(msg) {
    console.error('[patch-baileys] ERRO: ' + msg);
    process.exit(1);
}

// 1. versao
const pkgPath = path.join(BAILEYS_DIR, 'package.json');
if (!fs.existsSync(pkgPath)) {
    fail('package.json do Baileys nao encontrado em ' + BAILEYS_DIR);
}
const version = JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version;
if (version !== EXPECTED_VERSION) {
    fail(
        'versao do Baileys e ' + version + ', esperada ' + EXPECTED_VERSION + '.\n' +
        '  O patch so foi validado nessa versao. Reveja a issue #2778 antes de forcar:\n' +
        '  https://github.com/evolution-foundation/evolution-api/issues/2778'
    );
}
console.log('[patch-baileys] Baileys ' + version + ' confirmado.');

// 2. arquivo alvo
if (!fs.existsSync(TARGET)) fail('arquivo nao encontrado: ' + TARGET);
let src = fs.readFileSync(TARGET, 'utf8');

// 3. idempotencia
if (src.includes("'CB:status'") || src.includes('"CB:status"')) {
    console.log('[patch-baileys] handler CB:status ja existe. Nada a fazer.');
    process.exit(0);
}

// 4. ancora: registramos o handler imediatamente ANTES do handler CB:notification.
//    A ordem de registro entre eventos distintos e irrelevante, e assim nao
//    precisamos adivinhar onde o corpo do CB:notification termina.
const anchorMatch = src.match(/^([ \t]*)ws\.on\((['"])CB:notification\2/m);
if (!anchorMatch) {
    fail(
        'ancora ws.on("CB:notification") nao encontrada em ' + TARGET + '.\n' +
        '  O arquivo mudou. NAO aplique o patch as cegas: confira a issue #2778.'
    );
}

const indent = anchorMatch[1];
const patchIndented = PATCH.split('\n')
    .map(line => (line ? indent + line.replace(/^ {4}/, '') : line))
    .join('\n');

src = src.slice(0, anchorMatch.index) + patchIndented + '\n' + src.slice(anchorMatch.index);

// 5. backup + escrita
fs.writeFileSync(TARGET + '.orig', fs.readFileSync(TARGET));
fs.writeFileSync(TARGET, src);
console.log('[patch-baileys] patch aplicado em ' + TARGET);
console.log('[patch-baileys] backup salvo em ' + TARGET + '.orig');
