// Pruebas offline de checklist-certificado (sin red). Ejecutar: node --test "tests/*.test.mjs"
// Los Contract IDs salen de config/contracts.json; no hay literales de ID ni de claves.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cargarConfig } from '../scripts/check-contract-id.mjs';
import { leerCertificado, interpretarEnlace, evaluarCertificado, formatear, ejecutar, ESTADO } from '../scripts/checklist-certificado.mjs';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const registro = JSON.parse(readFileSync(join(RAIZ, 'config/contracts.json'), 'utf8'));
const id = (alias) => registro.contratos.find((c) => c.alias === alias).id;
const cfg = cargarConfig(RAIZ);
const HASH = 'ab'.repeat(32);

function certificado({
  credito = 'CRED001',
  contrato = id('v1'),
  enlaceContrato = `https://lab.stellar.org/r/testnet/contract/${contrato}`,
  enlaceTx = `https://stellar.expert/explorer/testnet/tx/${HASH}`,
  extra = '',
} = {}) {
  return `<div class="cert-grid">
<div class="cf"><div class="cl">ID del crédito</div><div class="cv">${credito}</div></div>
<div class="cf"><div class="cl">Contract ID</div><div class="cv">${contrato}</div></div></div>
<div class="cert-links">
${enlaceContrato ? `<a href="${enlaceContrato}">contrato</a>` : ''}
${enlaceTx ? `<a href="${enlaceTx}">tx</a>` : ''}</div>${extra}`;
}
const estados = (inf) => Object.fromEntries(inf.criterios.map((c) => [c.id, c.estado]));
const evaluar = (html, nombre = 'certificado-CRED001.html', o) => evaluarCertificado(html, nombre, cfg, o);

test('leerCertificado: crédito, enlaces y retiro', () => {
  const c = leerCertificado(certificado(), 'certificado-X.html');
  assert.equal(c.idCredito, 'CRED001');
  assert.equal(c.enlaces.length, 2);
  assert.equal(c.retirado, false);
  assert.equal(leerCertificado(certificado({ extra: '<p>Estado: retirado</p>' })).retirado, true);
});

test('leerCertificado: sin campo, toma el ID del nombre de archivo', () => {
  assert.equal(leerCertificado('<p>x</p>', 'certificado-ABC9.html').idCredito, 'ABC9');
});

test('interpretarEnlace: contrato y tx válidos; hosts ajenos se ignoran', () => {
  const c = interpretarEnlace(`https://lab.stellar.org/r/testnet/contract/${id('v1')}`);
  assert.deepEqual([c.tipo, c.valor, c.problemas], ['contract', id('v1'), []]);
  const t = interpretarEnlace(`https://stellar.expert/explorer/testnet/tx/${HASH}`);
  assert.deepEqual([t.tipo, t.problemas], ['tx', []]);
  assert.equal(interpretarEnlace('https://ejemplo.com/x'), null);
});

test('interpretarEnlace: detecta http, mainnet y hash inválido', () => {
  assert.ok(interpretarEnlace(`http://lab.stellar.org/r/testnet/contract/${id('v1')}`).problemas.includes('no usa https'));
  assert.ok(interpretarEnlace(`https://stellar.expert/explorer/public/contract/${id('v1')}`).problemas.includes('no apunta a testnet'));
  assert.ok(interpretarEnlace('https://stellar.expert/explorer/testnet/tx/zz').problemas.some((p) => p.includes('hash')));
});

test('CRED001 con v1: Contract ID PENDIENTE (confirmado_en_cadena=false), enlaces PASA', () => {
  const e = estados(evaluar(certificado()));
  assert.deepEqual(e, {
    activo_unico: ESTADO.PENDIENTE,
    historial: ESTADO.PENDIENTE,
    retiro: ESTADO.NO_APLICA,
    enlace_verificacion_publica: ESTADO.PASA,
    contract_id_correcto: ESTADO.PENDIENTE,
  });
});

test('Contract ID de otro contrato → FALLA', () => {
  const html = certificado({ contrato: id('v2-vigente') });
  assert.equal(estados(evaluar(html)).contract_id_correcto, ESTADO.FALLA);
});

test('pitch con v2-vigente y confirmado_en_cadena=true → PASA', () => {
  const html = certificado({ contrato: id('v2-vigente') });
  assert.equal(estados(evaluar(html, 'pitch-viernes-v2.html')).contract_id_correcto, ESTADO.PASA);
});

test('documento sin regla esperada → FALLA, salvo --expect', () => {
  const html = certificado();
  assert.equal(estados(evaluar(html, 'certificado-OTRO.html')).contract_id_correcto, ESTADO.FALLA);
  assert.equal(estados(evaluar(html, 'certificado-OTRO.html', { expect: ['v1'] })).contract_id_correcto, ESTADO.PENDIENTE);
});

test('enlace al contrato con ID distinto del certificado → FALLA', () => {
  const html = certificado({ enlaceContrato: `https://lab.stellar.org/r/testnet/contract/${id('v2-vigente')}` });
  const inf = evaluar(html);
  assert.equal(estados(inf).enlace_verificacion_publica, ESTADO.FALLA);
  assert.match(inf.criterios.find((c) => c.id === 'enlace_verificacion_publica').detalle, /no coincide/);
});

test('sin enlaces, sin tx, o enlace a mainnet → FALLA', () => {
  assert.equal(estados(evaluar(certificado({ enlaceContrato: '', enlaceTx: '' }))).enlace_verificacion_publica, ESTADO.FALLA);
  assert.equal(estados(evaluar(certificado({ enlaceTx: '' }))).enlace_verificacion_publica, ESTADO.FALLA);
  const mainnet = certificado({ enlaceTx: `https://stellar.expert/explorer/public/tx/${HASH}` });
  assert.equal(estados(evaluar(mainnet)).enlace_verificacion_publica, ESTADO.FALLA);
});

test('retiro declarado → PENDIENTE; no declarado → NO_APLICA', () => {
  assert.equal(estados(evaluar(certificado({ extra: '<p>El crédito ha retirado del mercado 100 t</p>' }))).retiro, ESTADO.PENDIENTE);
  assert.equal(estados(evaluar(certificado())).retiro, ESTADO.NO_APLICA);
});

test('sin ID de crédito → activo único FALLA', () => {
  const html = certificado().replace(/ID del crédito/, 'Otro campo');
  assert.equal(estados(evaluar(html, 'sin-nombre.html', { expect: ['v1'] })).activo_unico, ESTADO.FALLA);
});

test('nunca marca PASA lo que requiere la cadena', () => {
  const e = estados(evaluar(certificado()));
  for (const k of ['activo_unico', 'historial']) assert.notEqual(e[k], ESTADO.PASA);
});

test('formatear: texto, md y json', () => {
  const inf = evaluar(certificado());
  assert.match(formatear(inf, 'texto'), /PENDIENTE\s+contract_id_correcto/);
  assert.match(formatear(inf, 'md'), /\| Contract ID correcto \| \*\*PENDIENTE\*\*/);
  assert.equal(JSON.parse(formatear(inf, 'json')).criterios.length, 5);
});

test('ejecutar: código 0 sin FALLA, 1 con FALLA, 2 por uso', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gl-cert-'));
  try {
    const bueno = join(dir, 'certificado-CRED001.html');
    const malo = join(dir, 'certificado-CRED001-malo.html');
    writeFileSync(bueno, certificado());
    writeFileSync(malo, certificado({ contrato: id('v2-vigente') }));
    assert.equal(ejecutar({ archivo: bueno }).codigo, 0);
    assert.equal(ejecutar({ archivo: malo, expect: ['v1'] }).codigo, 1);
    assert.equal(ejecutar({ archivo: join(dir, 'no-existe.html') }).codigo, 2);
    assert.equal(ejecutar({ archivo: bueno, formato: 'xml' }).codigo, 2);
    assert.equal(ejecutar({ archivo: bueno, expect: ['no-existe'] }).codigo, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
