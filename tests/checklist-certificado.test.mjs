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
  contrato = id('v2-vigente'),
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
const ESTADO_FINAL_RETIRADO = '<div class="cf"><div class="cl">Estado final</div><div class="cv">Retirado (ciclo completo)</div></div>';
const estados = (inf) => Object.fromEntries(inf.criterios.map((c) => [c.id, c.estado]));
const evaluar = (html, nombre = 'certificado-CRED001-v2.html', o) => evaluarCertificado(html, nombre, cfg, o);

test('leerCertificado: crédito, enlaces y retiro', () => {
  const c = leerCertificado(certificado(), 'certificado-X.html');
  assert.equal(c.idCredito, 'CRED001');
  assert.equal(c.enlaces.length, 2);
  assert.equal(c.retirado, false);
  assert.equal(leerCertificado(certificado({ extra: '<p>Estado: retirado</p>' })).retirado, true);
});

test('leerCertificado: "Estado final: Retirado" declara retiro; el ID del archivo ignora el sufijo -vN', () => {
  assert.equal(leerCertificado(certificado({ extra: ESTADO_FINAL_RETIRADO })).retirado, true);
  assert.equal(leerCertificado(certificado({ extra: '<div class="cl">Estado final</div><div class="cv">Emitido</div>' })).retirado, false);
  assert.equal(leerCertificado('<p>x</p>', 'certificado-ABC9-v2.html').idCredito, 'ABC9');
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

test('CRED001 con v2: Activo único sigue en ADVERTENCIA (ID duplicado), Contract ID PASA (confirmado en cadena)', () => {
  const html = certificado({ extra: ESTADO_FINAL_RETIRADO });
  const e = estados(evaluar(html));
  assert.deepEqual(e, {
    activo_unico: ESTADO.ADVERTENCIA,
    historial: ESTADO.PENDIENTE,
    retiro: ESTADO.PENDIENTE,
    enlace_verificacion_publica: ESTADO.PASA,
    contract_id_correcto: ESTADO.PASA,
  });
  const detalle = evaluar(html).criterios[0].detalle;
  assert.match(detalle, /duplicado/);
});

test('crédito sin duplicado en el registro → Activo único PENDIENTE; con duplicado → ADVERTENCIA, nunca PASA', () => {
  assert.equal(estados(evaluar(certificado({ credito: 'CRED777' }), 'certificado-CRED777.html', { expect: ['v2-vigente'] })).activo_unico, ESTADO.PENDIENTE);
  for (const nombre of ['certificado-CRED001-v2.html', 'certificado-CRED001.html']) {
    assert.notEqual(estados(evaluar(certificado(), nombre)).activo_unico, ESTADO.PASA);
  }
});

test('contract_id_correcto: PENDIENTE si el externo no está confirmado en cadena', () => {
  const cfgSinConfirmar = structuredClone(cfg);
  cfgSinConfirmar.esperados.externos['certificado-CRED001-v2.html'].confirmado_en_cadena = false;
  const inf = evaluarCertificado(certificado(), 'certificado-CRED001-v2.html', cfgSinConfirmar);
  assert.equal(estados(inf).contract_id_correcto, ESTADO.PENDIENTE);
});

test('Contract ID de otro contrato (v1 en el certificado oficial de CRED001) → FALLA', () => {
  const html = certificado({ contrato: id('v1') });
  assert.equal(estados(evaluar(html)).contract_id_correcto, ESTADO.FALLA);
});

test('pitch con v2-vigente y confirmado_en_cadena=true → PASA', () => {
  const html = certificado({ contrato: id('v2-vigente') });
  assert.equal(estados(evaluar(html, 'pitch-viernes-v2.html')).contract_id_correcto, ESTADO.PASA);
});

test('documento sin regla esperada → FALLA, salvo --expect', () => {
  const html = certificado();
  assert.equal(estados(evaluar(html, 'certificado-OTRO.html')).contract_id_correcto, ESTADO.FALLA);
  assert.equal(estados(evaluar(html, 'certificado-OTRO.html', { expect: ['v2-vigente'] })).contract_id_correcto, ESTADO.PENDIENTE);
});

test('enlace al contrato con ID distinto del certificado → FALLA', () => {
  const html = certificado({ enlaceContrato: `https://lab.stellar.org/r/testnet/contract/${id('v1')}` });
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
  assert.equal(estados(evaluar(html, 'sin-nombre.html', { expect: ['v2-vigente'] })).activo_unico, ESTADO.FALLA);
});

test('nunca marca PASA lo que requiere la cadena', () => {
  const e = estados(evaluar(certificado()));
  for (const k of ['activo_unico', 'historial']) assert.notEqual(e[k], ESTADO.PASA);
});

test('formatear: texto, md y json', () => {
  const inf = evaluar(certificado());
  assert.match(formatear(inf, 'texto'), /ADVERTENCIA\s+activo_unico/);
  assert.match(formatear(inf, 'md'), /\| Activo único \| \*\*ADVERTENCIA\*\*/);
  assert.equal(JSON.parse(formatear(inf, 'json')).criterios.length, 5);
});

test('ejecutar: código 0 sin FALLA, 1 con FALLA, 2 por uso', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gl-cert-'));
  try {
    const bueno = join(dir, 'certificado-CRED001-v2.html');
    const malo = join(dir, 'certificado-CRED001-v2-malo.html');
    writeFileSync(bueno, certificado());
    writeFileSync(malo, certificado({ contrato: id('v1') }));
    assert.equal(ejecutar({ archivo: bueno }).codigo, 0); // ADVERTENCIA y PENDIENTE no fallan
    assert.equal(ejecutar({ archivo: malo, expect: ['v2-vigente'] }).codigo, 1);
    assert.equal(ejecutar({ archivo: join(dir, 'no-existe.html') }).codigo, 2);
    assert.equal(ejecutar({ archivo: bueno, formato: 'xml' }).codigo, 2);
    assert.equal(ejecutar({ archivo: bueno, expect: ['no-existe'] }).codigo, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
