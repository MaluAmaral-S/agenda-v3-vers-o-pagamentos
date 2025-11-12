#!/usr/bin/env node

const { spawnSync } = require('child_process');

const port = process.env.PORT || 3000;
const defaultUrl = `http://localhost:${port}/api/webhooks/mercadopago`;
const url = process.env.TEST_WEBHOOK_URL || defaultUrl;

const payload = JSON.stringify({ ping: 'pong' });
const ts = Math.floor(Date.now() / 1000);
const fakeSignature = 'invalidsignature';

const args = [
  '-s',
  '-o',
  '/dev/null',
  '-w',
  '%{http_code}',
  '-X',
  'POST',
  url,
  '-H',
  'Content-Type: application/json',
  '-H',
  `x-signature: ts=${ts},v1=${fakeSignature}`,
  '-d',
  payload,
];

const result = spawnSync('curl', args, { encoding: 'utf8' });

if (result.error) {
  console.error('Erro ao executar curl:', result.error.message);
  process.exit(1);
}

const status = (result.stdout || '').trim();
if (status === '401') {
  console.log(`✅ Webhook respondeu 401 para assinatura inválida (${url})`);
  process.exit(0);
}

console.error(`❌ Esperado 401, mas o webhook respondeu ${status || '[resposta vazia]'}`);
process.exit(1);
