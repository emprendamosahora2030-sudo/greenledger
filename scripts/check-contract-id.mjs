#!/usr/bin/env node
// check-contract-id — compara los Contract ID de cada documento contra el ID
// ESPERADO PARA ESE DOCUMENTO (config/doc-expectations.json), no contra una
// variable global. Solo lectura, sin red, sin dependencias (Node >= 18).
//
// Uso:
//   node scripts/check-contract-id.mjs [--root <carpeta>] [--external-dir <carpeta>]
//                                      [--strict] [--require-external]
//
// Códigos de salida: 0 = sin diferencias nuevas; 1 = diferencias (o conocidas
// con --strict, o externos omitidos con --require-external); 2 = error de
// configuración o de uso.

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, basename, resolve, dirname, extname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validarContractId, validarSemillaSecreta } from './lib/strkey.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ_POR_DEFECTO = resolve(AQUI, '..');

const ARCHIVO_REGISTRO = 'config/contracts.json';
const ARCHIVO_ESPERADOS = 'config/doc-expectations.json';
const EXTENSIONES_BINARIAS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.ico', '.pdf', '.wasm']);
const CARPETAS_IGNORADAS = new Set(['.git', 'node_modules', 'target']);

// Candidatos "con forma de Contract ID" (C + 50..60 base32) para poder avisar de
// IDs mal copiados; luego se valida longitud y checksum.
const RE_CANDIDATO_CONTRATO = /(?<![A-Z2-7])C[A-Z2-7]{50,60}(?![A-Z2-7])/g;
const RE_CANDIDATO_SECRETO = /(?<![A-Z2-7])S[A-Z2-7]{55}(?![A-Z2-7])/g;

// ---------------------------------------------------------------- extracción

export function extraerIds(texto) {
  const hallazgos = [];
  texto.split(/\r?\n/).forEach((linea, i) => {
    for (const m of linea.matchAll(RE_CANDIDATO_CONTRATO)) {
      const v = validarContractId(m[0]);
      hallazgos.push({ id: m[0], linea: i + 1, valido: v.ok, motivo: v.motivo });
    }
  });
  return hallazgos;
}

/** Líneas con una clave secreta de Stellar válida (S...). Nunca devuelve el valor. */
export function buscarSecretos(texto) {
  const lineas = [];
  texto.split(/\r?\n/).forEach((linea, i) => {
    for (const m of linea.matchAll(RE_CANDIDATO_SECRETO)) {
      if (validarSemillaSecreta(m[0]).ok) lineas.push(i + 1);
    }
  });
  return lineas;
}

// ------------------------------------------------------------- configuración

export function cargarConfig(raiz) {
  const leer = (p) => JSON.parse(readFileSync(join(raiz, p), 'utf8'));
  const registro = leer(ARCHIVO_REGISTRO);
  const esperados = leer(ARCHIVO_ESPERADOS);
  const errores = [];
  const porAlias = new Map();
  const porId = new Map();

  for (const c of registro.contratos ?? []) {
    if (porAlias.has(c.alias)) errores.push(`alias repetido: ${c.alias}`);
    if (porId.has(c.id)) errores.push(`ID repetido en alias ${c.alias}`);
    const v = validarContractId(c.id);
    if (!v.ok) errores.push(`ID inválido en alias ${c.alias}: ${v.motivo}`);
    porAlias.set(c.alias, c);
    porId.set(c.id, c);
  }

  const vigentes = (registro.contratos ?? []).filter((c) => c.estado === 'vigente');
  if (vigentes.length !== 1) {
    errores.push(`debe haber exactamente 1 contrato 'vigente' (hay ${vigentes.length})`);
  }

  const reglas = [...Object.entries(esperados.docs ?? {}), ...Object.entries(esperados.externos ?? {})];
  for (const [doc, regla] of reglas) {
    for (const alias of [...(regla.permitidos ?? []), ...(regla.obligatorios ?? [])]) {
      if (!porAlias.has(alias)) errores.push(`${doc}: alias desconocido "${alias}"`);
    }
  }

  return { registro, esperados, porAlias, porId, vigente: vigentes[0], errores };
}

// ----------------------------------------------------------------- análisis

/** Compara los IDs de un texto contra la regla de su documento. */
export function analizarTexto(texto, regla, cfg) {
  const permitidos = new Set(regla.permitidos ?? []);
  const ignoradas = regla.lineas_ignoradas ?? {};
  const vistos = new Set();
  const porClave = new Map();

  const registrar = (tipo, clave, linea, detalle) => {
    const previa = porClave.get(clave);
    if (previa) previa.lineas.push(linea);
    else porClave.set(clave, { tipo, clave, lineas: linea ? [linea] : [], detalle });
  };

  for (const h of extraerIds(texto)) {
    if (String(h.linea) in ignoradas) continue;
    if (!h.valido) {
      registrar('malformado', `malformado:${h.id.slice(0, 8)}`, h.linea, `ID malformado (${h.motivo})`);
      continue;
    }
    const contrato = cfg.porId.get(h.id);
    if (!contrato) {
      registrar(
        'desconocido',
        `desconocido:${h.id.slice(0, 8)}`,
        h.linea,
        `ID válido pero no registrado en ${ARCHIVO_REGISTRO} (${h.id.slice(0, 8)}…)`,
      );
      continue;
    }
    vistos.add(contrato.alias);
    if (!permitidos.has(contrato.alias)) {
      const esperado = [...permitidos].join(', ') || 'ninguno';
      registrar('inesperado', `inesperado:${contrato.alias}`, h.linea, `ID inesperado ${contrato.alias} (esperado: ${esperado})`);
    }
  }

  for (const alias of regla.obligatorios ?? []) {
    if (!vistos.has(alias)) registrar('faltante', `faltante:${alias}`, 0, `falta el ID obligatorio ${alias}`);
  }

  return { vistos: [...vistos], diferencias: [...porClave.values()] };
}

function listarArchivos(raiz) {
  try {
    const salida = execFileSync('git', ['-C', raiz, 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const lista = salida.split('\0').filter(Boolean);
    if (lista.length) return lista;
  } catch {
    // sin git: se recorre la carpeta
  }
  const resultado = [];
  const recorrer = (dir, prefijo) => {
    for (const nombre of readdirSync(dir)) {
      if (CARPETAS_IGNORADAS.has(nombre)) continue;
      const ruta = join(dir, nombre);
      const rel = prefijo ? `${prefijo}/${nombre}` : nombre;
      if (statSync(ruta).isDirectory()) recorrer(ruta, rel);
      else resultado.push(rel);
    }
  };
  recorrer(raiz, '');
  return resultado;
}

// ---------------------------------------------------------------- ejecución

function etiquetaLineas(lineas) {
  return lineas.length ? `:${lineas.slice(0, 3).join(',')}${lineas.length > 3 ? ',…' : ''}` : '';
}

export function ejecutar({ raiz = RAIZ_POR_DEFECTO, externalDir = null, strict = false, requireExternal = false } = {}) {
  const salida = [];
  let cfg;
  try {
    cfg = cargarConfig(raiz);
  } catch (e) {
    return { codigo: 2, lineas: [`ERROR de configuración: ${e.message}`] };
  }
  if (cfg.errores.length) {
    return { codigo: 2, lineas: ['ERROR de configuración:', ...cfg.errores.map((x) => `  - ${x}`)] };
  }

  const conocidas = new Map();
  for (const k of cfg.esperados.known_issues ?? []) {
    for (const clave of k.claves) conocidas.set(`${k.doc}|${clave}`, k);
  }
  const conocidasUsadas = new Set();

  const resumen = { ok: 0, conocidos: 0, diferencias: 0, omitidos: 0, secretos: 0 };
  salida.push(`check-contract-id — red: ${cfg.registro.red} — contratos registrados: ${cfg.porAlias.size} (vigente: ${cfg.vigente.alias})`);

  const reportar = (doc, analisis, nota = '') => {
    const nuevas = [];
    const conocidasDoc = [];
    for (const d of analisis.diferencias) {
      const k = conocidas.get(`${doc}|${d.clave}`);
      if (k) {
        conocidasUsadas.add(`${doc}|${d.clave}`);
        conocidasDoc.push({ d, k });
      } else nuevas.push(d);
    }
    if (!nuevas.length && !conocidasDoc.length) {
      resumen.ok++;
      salida.push(`  OK         ${doc}  [${analisis.vistos.join(', ') || 'sin IDs'}]${nota}`);
      return;
    }
    for (const d of nuevas) {
      resumen.diferencias++;
      salida.push(`  DIFERENCIA ${doc}${etiquetaLineas(d.lineas)}  ${d.detalle}`);
    }
    for (const { d, k } of conocidasDoc) {
      resumen.conocidos++;
      salida.push(`  CONOCIDO   ${doc}${etiquetaLineas(d.lineas)}  ${d.detalle} — ${k.estado}`);
    }
  };

  // --- Documentos del repositorio
  salida.push('[REPOSITORIO]');
  const reglasDocs = cfg.esperados.docs ?? {};
  for (const rel of listarArchivos(raiz).sort()) {
    if (rel === ARCHIVO_REGISTRO) continue; // es el registro mismo
    if (EXTENSIONES_BINARIAS.has(extname(rel).toLowerCase())) continue;
    const ruta = join(raiz, rel);
    if (!existsSync(ruta) || !statSync(ruta).isFile()) continue;
    const texto = readFileSync(ruta, 'utf8');

    for (const linea of buscarSecretos(texto)) {
      resumen.secretos++;
      resumen.diferencias++;
      salida.push(`  SECRETO    ${rel}:${linea}  posible clave secreta de Stellar (S…); el valor NO se imprime`);
    }

    const regla = reglasDocs[rel];
    if (!regla) {
      const ids = extraerIds(texto);
      if (ids.length) {
        resumen.diferencias++;
        salida.push(`  DIFERENCIA ${rel}${etiquetaLineas(ids.map((x) => x.linea))}  contiene Contract IDs pero no está registrado en ${ARCHIVO_ESPERADOS}`);
      }
      continue;
    }
    const analisis = analizarTexto(texto, regla, cfg);
    const ign = Object.keys(regla.lineas_ignoradas ?? {});
    reportar(rel, analisis, ign.length ? `  (línea ${ign.join(',')} ignorada: ejemplo)` : '');

    if (rel === '.env.example') {
      const m = texto.match(/^CURRENT_CONTRACT_ID=(\S*)$/m);
      if (!m || m[1] !== cfg.vigente.id) {
        resumen.diferencias++;
        salida.push(`  DIFERENCIA ${rel}  CURRENT_CONTRACT_ID no coincide con el alias vigente (${cfg.vigente.alias})`);
      }
    }
  }

  for (const rel of Object.keys(reglasDocs)) {
    if (!existsSync(join(raiz, rel))) {
      resumen.diferencias++;
      salida.push(`  DIFERENCIA ${rel}  documento registrado en ${ARCHIVO_ESPERADOS} pero no existe`);
    }
  }

  // --- Documentos externos (pitch, certificados): fuera del repositorio
  salida.push('[EXTERNOS]');
  for (const [nombre, regla] of Object.entries(cfg.esperados.externos ?? {})) {
    const conf = regla.confirmado_en_cadena === true ? 'confirmado_en_cadena=true' : 'confirmado_en_cadena=false (PENDIENTE de verificar en cadena)';
    const ruta = externalDir ? join(externalDir, basename(nombre)) : null;
    if (!ruta || !existsSync(ruta)) {
      resumen.omitidos++;
      const motivo = externalDir ? 'no se encontró en --external-dir' : 'sin --external-dir';
      salida.push(`  OMITIDO    ${nombre}  (${motivo}) esperado: ${(regla.obligatorios ?? regla.permitidos).join(', ')}; ${conf}`);
      continue;
    }
    const analisis = analizarTexto(readFileSync(ruta, 'utf8'), regla, cfg);
    reportar(nombre, analisis, `  ${conf}`);
  }

  for (const [clave, k] of conocidas) {
    if (!conocidasUsadas.has(clave)) {
      salida.push(`  AVISO      known_issue obsoleto (ya no se produce): ${clave} — se puede retirar de ${ARCHIVO_ESPERADOS}`);
    }
  }

  salida.push(
    `Resumen: ${resumen.ok} OK, ${resumen.conocidos} conocidos, ${resumen.diferencias} diferencias, ${resumen.omitidos} omitidos, ${resumen.secretos} secretos`,
  );

  let codigo = 0;
  if (resumen.diferencias > 0) codigo = 1;
  if (strict && resumen.conocidos > 0) codigo = 1;
  if (requireExternal && resumen.omitidos > 0) codigo = 1;
  salida.push(`Salida: ${codigo}${strict ? ' (--strict)' : ''}${requireExternal ? ' (--require-external)' : ''}`);
  return { codigo, lineas: salida, resumen };
}

// ---------------------------------------------------------------------- CLI

function main(argv) {
  const opciones = { raiz: RAIZ_POR_DEFECTO, externalDir: null, strict: false, requireExternal: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--root') opciones.raiz = resolve(argv[++i] ?? '');
    else if (a === '--external-dir') opciones.externalDir = resolve(argv[++i] ?? '');
    else if (a === '--strict') opciones.strict = true;
    else if (a === '--require-external') opciones.requireExternal = true;
    else if (a === '--help' || a === '-h') {
      console.log('Uso: node scripts/check-contract-id.mjs [--root <carpeta>] [--external-dir <carpeta>] [--strict] [--require-external]');
      return 0;
    } else {
      console.error(`Opción desconocida: ${a}`);
      return 2;
    }
  }
  const { codigo, lineas } = ejecutar(opciones);
  console.log(lineas.join('\n'));
  return codigo;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
