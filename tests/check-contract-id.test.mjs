// Pruebas offline de check-contract-id (sin red). Ejecutar: node --test tests/
// No hay Contract IDs ni claves como literales: los IDs salen de config/contracts.json
// y las claves de prueba se generan en memoria.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { VERSION, codificarStrKey, validarStrKey, validarContractId, validarSemillaSecreta } from '../scripts/lib/strkey.mjs';
import { extraerIds, buscarSecretos, cargarConfig, analizarTexto, ejecutar } from '../scripts/check-contract-id.mjs';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const registro = JSON.parse(readFileSync(join(RAIZ, 'config/contracts.json'), 'utf8'));
const id = (alias) => registro.contratos.find((c) => c.alias === alias).id;
const cfg = cargarConfig(RAIZ);

const payload = (n) => Uint8Array.from({ length: 32 }, (_, i) => (i * 7 + n) & 0xff);
const claveSecretaFalsa = () => codificarStrKey(VERSION.SEMILLA_SECRETA, payload(3));
const contratoFalso = () => codificarStrKey(VERSION.CONTRATO, payload(9));

/** Cambia un carácter del ID (conserva longitud y alfabeto) para romper el checksum. */
const conTypo = (s) => s.slice(0, 20) + (s[20] === 'A' ? 'B' : 'A') + s.slice(21);

/** Copia mínima del repo (config + docs dados) en una carpeta temporal. */
function repoTemporal(archivos) {
  const dir = mkdtempSync(join(tmpdir(), 'gl-check-'));
  mkdirSync(join(dir, 'config'));
  cpSync(join(RAIZ, 'config'), join(dir, 'config'), { recursive: true });
  for (const [rel, contenido] of Object.entries(archivos)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), contenido);
  }
  return dir;
}
/** known_issue de documento (de prueba): ProductBlueprint.md cita la primera instancia en vez del vigente. */
const KNOWN_ISSUE_DOC = {
  doc: 'ProductBlueprint.md',
  claves: ['inesperado:v2-primera-instancia', 'faltante:v2-vigente'],
  motivo: 'prueba',
  estado: 'reportado (prueba)',
};
function conRepo(archivos, fn, { knownIssuesExtra = [] } = {}) {
  const dir = repoTemporal(archivos);
  if (knownIssuesExtra.length) {
    const ruta = join(dir, 'config/doc-expectations.json');
    const esperados = JSON.parse(readFileSync(ruta, 'utf8'));
    esperados.known_issues.push(...knownIssuesExtra);
    writeFileSync(ruta, JSON.stringify(esperados));
  }
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
/** Un repo temporal donde todos los documentos registrados existen y están limpios. */
function documentosLimpios() {
  const docs = {};
  for (const [rel, regla] of Object.entries(cfg.esperados.docs)) {
    docs[rel] = (regla.obligatorios ?? []).map((a) => `ID ${id(a)}`).join('\n') + '\n';
  }
  docs['.env.example'] = `CURRENT_CONTRACT_ID=${id('v2-vigente')}\n`;
  return docs;
}

test('strkey: los 5 IDs del registro tienen checksum válido', () => {
  for (const c of registro.contratos) assert.equal(validarContractId(c.id).ok, true, c.alias);
});

test('strkey: un typo rompe el checksum; una clave S no es un contrato', () => {
  assert.equal(validarContractId(conTypo(id('v2-vigente'))).ok, false);
  assert.equal(validarContractId(claveSecretaFalsa()).ok, false);
  assert.equal(validarSemillaSecreta(claveSecretaFalsa()).ok, true);
  assert.equal(validarContractId(contratoFalso()).ok, true);
  assert.equal(validarContractId('CABC').ok, false);
});

test('configuración: 5 contratos, 1 vigente, sin errores, v1 documenta su interfaz distinta', () => {
  assert.deepEqual(cfg.errores, []);
  assert.equal(cfg.porAlias.size, 5);
  assert.equal(cfg.vigente.alias, 'v2-vigente');
  const v1 = cfg.porAlias.get('v1');
  assert.deepEqual(v1.funciones_ausentes, ['total_emitido', 'total_retirado']);
  assert.match(v1.interfaz, /distinta/);
});

test('configuración: los externos registrados son solo los aprobados', () => {
  assert.deepEqual(Object.keys(cfg.esperados.externos).sort(), ['certificado-CRED001.html', 'pitch-viernes-v2.html']);
});

test('extraerIds: encuentra IDs, línea y validez', () => {
  const t = `a\nuso ${id('v1')} y ${conTypo(id('v2-vigente'))}\n`;
  const r = extraerIds(t);
  assert.equal(r.length, 2);
  assert.equal(r[0].linea, 2);
  assert.equal(r[0].valido, true);
  assert.equal(r[1].valido, false);
});

test('extraerIds: no confunde texto normal con IDs', () => {
  assert.equal(extraerIds('CONTRATO CCRM3 soroban stellar').length, 0);
});

test('analizarTexto: ID permitido y obligatorio presente → sin diferencias', () => {
  const r = analizarTexto(`x ${id('v2-vigente')}`, { permitidos: ['v2-vigente'], obligatorios: ['v2-vigente'] }, cfg);
  assert.deepEqual(r.diferencias, []);
  assert.deepEqual(r.vistos, ['v2-vigente']);
});

test('analizarTexto: ID de otro alias → inesperado (esperado por documento)', () => {
  const r = analizarTexto(`x ${id('v1')}`, { permitidos: ['v2-vigente'], obligatorios: [] }, cfg);
  assert.deepEqual(r.diferencias.map((d) => d.clave), ['inesperado:v1']);
});

test('analizarTexto: obligatorio ausente → faltante', () => {
  const r = analizarTexto('sin ids', { permitidos: ['v1'], obligatorios: ['v1'] }, cfg);
  assert.deepEqual(r.diferencias.map((d) => d.clave), ['faltante:v1']);
});

test('analizarTexto: ID con typo → malformado; ID válido no registrado → desconocido', () => {
  const r = analizarTexto(`${conTypo(id('v1'))}\n${contratoFalso()}`, { permitidos: [] }, cfg);
  const tipos = r.diferencias.map((d) => d.tipo).sort();
  assert.deepEqual(tipos, ['desconocido', 'malformado']);
});

test('analizarTexto: lineas_ignoradas omite ejemplos', () => {
  const regla = { permitidos: [], lineas_ignoradas: { 2: 'ejemplo' } };
  const r = analizarTexto(`ok\n${id('v1')}\n`, regla, cfg);
  assert.deepEqual(r.diferencias, []);
});

test('buscarSecretos: detecta clave S válida sin devolver el valor', () => {
  const s = claveSecretaFalsa();
  const r = buscarSecretos(`a\nclave=${s}\n`);
  assert.deepEqual(r, [2]);
  assert.equal(JSON.stringify(r).includes(s), false);
});

test('buscarSecretos: texto sin claves → vacío', () => {
  assert.deepEqual(buscarSecretos(`solo ${id('v1')}`), []);
});

test('ejecutar: repo limpio → código 0', () => {
  conRepo(documentosLimpios(), (dir) => {
    const r = ejecutar({ raiz: dir });
    assert.equal(r.codigo, 0, r.lineas.join('\n'));
    assert.equal(r.resumen.diferencias, 0);
  });
});

test('ejecutar: known_issue → código 0 por defecto y 1 con --strict', () => {
  const docs = documentosLimpios();
  docs['ProductBlueprint.md'] = `contrato ${id('v2-primera-instancia')}\n`;
  conRepo(docs, (dir) => {
    const normal = ejecutar({ raiz: dir });
    assert.equal(normal.codigo, 0, normal.lineas.join('\n'));
    assert.equal(normal.resumen.conocidos, 3); // 2 de ProductBlueprint + CRED001 duplicado
    assert.ok(normal.lineas.some((l) => l.startsWith('  CONOCIDO   ProductBlueprint.md')));
    const estricto = ejecutar({ raiz: dir, strict: true });
    assert.equal(estricto.codigo, 1);
  }, { knownIssuesExtra: [KNOWN_ISSUE_DOC] });
});

test('ejecutar: ID equivocado en un documento → código 1', () => {
  const docs = documentosLimpios();
  docs['README.md'] += `\n${conTypo(id('v2-vigente'))}\n`;
  conRepo(docs, (dir) => {
    const r = ejecutar({ raiz: dir });
    assert.equal(r.codigo, 1);
    assert.ok(r.lineas.some((l) => l.includes('malformado')));
  });
});

test('ejecutar: .env.example con otro ID → código 1', () => {
  const docs = documentosLimpios();
  docs['.env.example'] = `CURRENT_CONTRACT_ID=${id('v1')}\n`;
  conRepo(docs, (dir) => {
    const r = ejecutar({ raiz: dir });
    assert.equal(r.codigo, 1);
  });
});

test('ejecutar: clave secreta en cualquier archivo → código 1 y no se imprime', () => {
  const docs = documentosLimpios();
  const s = claveSecretaFalsa();
  docs['notas.txt'] = `x\n${s}\n`;
  conRepo(docs, (dir) => {
    const r = ejecutar({ raiz: dir });
    assert.equal(r.codigo, 1);
    assert.equal(r.resumen.secretos, 1);
    assert.equal(r.lineas.join('\n').includes(s), false);
    assert.ok(r.lineas.some((l) => l.includes('notas.txt:2')));
  });
});

test('ejecutar: archivo no registrado con IDs → código 1', () => {
  const docs = documentosLimpios();
  docs['otro.md'] = id('v1');
  conRepo(docs, (dir) => assert.equal(ejecutar({ raiz: dir }).codigo, 1));
});

test('ejecutar: externos omitidos → 0 por defecto; 1 con --require-external', () => {
  conRepo(documentosLimpios(), (dir) => {
    const r = ejecutar({ raiz: dir });
    assert.equal(r.codigo, 0);
    assert.equal(r.resumen.omitidos, 2);
    assert.equal(ejecutar({ raiz: dir, requireExternal: true }).codigo, 1);
  });
});

test('ejecutar: externos — CRED001 con v1 pasa y queda marcado como confirmado en cadena', () => {
  const ext = mkdtempSync(join(tmpdir(), 'gl-ext-'));
  try {
    writeFileSync(join(ext, 'certificado-CRED001.html'), `<p>${id('v1')}</p>`);
    writeFileSync(join(ext, 'pitch-viernes-v2.html'), `<p>${id('v2-vigente')}</p>`);
    conRepo(documentosLimpios(), (dir) => {
      const r = ejecutar({ raiz: dir, externalDir: ext, requireExternal: true });
      assert.equal(r.codigo, 0, r.lineas.join('\n'));
      const cred = r.lineas.find((l) => l.includes('certificado-CRED001.html'));
      assert.match(cred, /confirmado_en_cadena=true/);
    });
  } finally {
    rmSync(ext, { recursive: true, force: true });
  }
});

test('ejecutar: externos — certificado con el ID de otro alias → código 1', () => {
  const ext = mkdtempSync(join(tmpdir(), 'gl-ext-'));
  try {
    writeFileSync(join(ext, 'certificado-CRED001.html'), `<p>${id('v2-vigente')}</p>`);
    conRepo(documentosLimpios(), (dir) => {
      assert.equal(ejecutar({ raiz: dir, externalDir: ext }).codigo, 1);
    });
  } finally {
    rmSync(ext, { recursive: true, force: true });
  }
});

test('ejecutar: configuración rota → código 2', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gl-bad-'));
  try {
    assert.equal(ejecutar({ raiz: dir }).codigo, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('known_issue obsoleto produce AVISO sin fallar', () => {
  conRepo(documentosLimpios(), (dir) => {
    const r = ejecutar({ raiz: dir });
    assert.ok(r.lineas.some((l) => l.includes('AVISO') && l.includes('obsoleto')));
    assert.equal(r.codigo, 0);
  }, { knownIssuesExtra: [KNOWN_ISSUE_DOC] });
});

test('config real: ya no hay known_issue de ProductBlueprint.md; solo queda el de CRED001', () => {
  assert.deepEqual(cfg.esperados.known_issues.map((k) => k.id), ['CRED001-duplicado']);
});

test('registro: propietario de CRED001 en v2 está completo (56 caracteres, checksum válido) y sin nota de abreviado', () => {
  const v2 = cfg.porAlias.get('v2-vigente').creditos_observados.find((c) => c.id === 'CRED001');
  assert.match(v2.propietario, /^G[A-Z2-7]{55}$/);
  assert.equal(validarStrKey(v2.propietario, 6 << 3).ok, true);
  assert.equal(/abreviad/i.test(JSON.stringify(v2)), false);
});

test('known_issue de datos: CRED001 duplicado se reporta como CONOCIDO (0 normal, 1 con --strict)', () => {
  conRepo(documentosLimpios(), (dir) => {
    const r = ejecutar({ raiz: dir });
    assert.ok(r.lineas.some((l) => l.startsWith('  CONOCIDO   CRED001 en') && l.includes('decisión pendiente del CEO')));
    assert.equal(r.codigo, 0);
    assert.equal(ejecutar({ raiz: dir, strict: true }).codigo, 1);
  });
});

test('registro: CRED001 confirmado en v1 con tx como evidencia; existe también en v2 retirado', () => {
  const v1 = cfg.porAlias.get('v1').creditos_observados.find((c) => c.id === 'CRED001');
  assert.equal(v1.confirmado_en_cadena, true);
  assert.match(v1.evidencia.tx, /^[0-9a-f]{64}$/);
  assert.equal(v1.toneladas, 100);
  const v2 = cfg.porAlias.get('v2-vigente').creditos_observados.find((c) => c.id === 'CRED001');
  assert.equal(v2.estado, 'retirado');
  assert.deepEqual(cfg.creditos.get('CRED001').sort(), ['v1', 'v2-vigente']);
});

test('registro: historial de CRED001 en v2 — 3 eventos coherentes con la cadena reportada', () => {
  const v2 = cfg.porAlias.get('v2-vigente').creditos_observados.find((c) => c.id === 'CRED001');
  const ev = v2.historial.eventos;
  assert.deepEqual(ev.map((e) => e.tipo), ['emision', 'transferencia', 'retiro']);
  // ledgers consecutivos y fechas crecientes
  assert.deepEqual(ev.map((e) => e.ledger), [4865387, 4865388, 4865389]);
  const t = ev.map((e) => Date.parse(e.fecha_utc) / 1000);
  assert.deepEqual(t.map((x, i) => (i ? x - t[i - 1] : 0)), [0, 5, 5]);
  // la emisión coincide con emitido_en y el retiro ocurre 10 s después
  assert.equal(t[0], v2.emitido_en);
  assert.equal(t[2] - t[0], 10);
  // hashes y direcciones válidos
  for (const e of ev) assert.match(e.tx, /^[0-9a-f]{64}$/);
  for (const g of [ev[0].propietario, ev[1].a]) assert.equal(validarStrKey(g, 6 << 3).ok, true);
  // el destino de la transferencia es el propietario actual; retiro con beneficiario
  assert.equal(ev[1].a, v2.propietario);
  assert.equal(ev[2].funcion, 'retirar_credito');
  assert.equal(ev[2].beneficiario, v2.beneficiario);
  // tx distintas entre sí
  assert.equal(new Set(ev.map((e) => e.tx)).size, 3);
});

test('registro: solo el retiro está verificado en Stellar Expert; emisión y transferencia quedan por confirmar', () => {
  const ev = cfg.porAlias.get('v2-vigente').creditos_observados.find((c) => c.id === 'CRED001').historial.eventos;
  assert.deepEqual(ev.map((e) => e.tx_confirmada_en_stellar_expert), [false, false, true]);
  assert.match(ev[0].estado_evidencia, /por confirmar en Stellar Expert/);
  assert.match(ev[1].estado_evidencia, /por confirmar en Stellar Expert/);
  assert.match(ev[2].estado_evidencia, /verificada en Stellar Expert/);
});
