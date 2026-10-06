#!/usr/bin/env node
// checklist-certificado — lista de verificación PASA / FALLA / PENDIENTE por certificado.
// Solo lectura y SIN red: lo que necesita la cadena queda PENDIENTE, nunca PASA.
//
// Uso:
//   node scripts/checklist-certificado.mjs <certificado.html> [--formato texto|md|json]
//                                          [--root <carpeta>] [--expect <alias,alias>]
//
// El Contract ID esperado sale de config/doc-expectations.json (sección "externos",
// por nombre de archivo) o de --expect. Códigos de salida: 0 = sin FALLA;
// 1 = al menos un criterio FALLA; 2 = error de uso o de configuración.

import { readFileSync, existsSync } from 'node:fs';
import { basename, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cargarConfig, analizarTexto, extraerIds } from './check-contract-id.mjs';

const RAIZ_POR_DEFECTO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HOSTS_EXPLORADOR = new Set(['lab.stellar.org', 'stellar.expert']);
const RE_HASH_TX = /^[0-9a-f]{64}$/;

export const ESTADO = Object.freeze({ PASA: 'PASA', FALLA: 'FALLA', PENDIENTE: 'PENDIENTE', NO_APLICA: 'NO_APLICA' });

// ---------------------------------------------------------------- extracción

/** Lee del HTML del certificado: ID del crédito, enlaces y si declara retiro. */
export function leerCertificado(html, nombreArchivo = '') {
  const campo = (etiqueta) => {
    const m = html.match(new RegExp(`${etiqueta}\\s*</div>\\s*<div[^>]*>\\s*([^<]*?)\\s*</div>`, 'i'));
    return m ? m[1].trim() : null;
  };
  const idCampo = campo('ID del crédito');
  const idArchivo = nombreArchivo.match(/^certificado-(.+)\.html$/i)?.[1] ?? null;
  const enlaces = [...html.matchAll(/href\s*=\s*"([^"]+)"/gi)].map((m) => m[1]);
  // Declara retiro solo si lo dice de forma explícita (estado/leyenda), no por mencionar "retiro" en general.
  const retirado = /data-estado\s*=\s*"retirad[oa]"|estado\s*:\s*retirad[oa]|ha\s+retirado\s+del\s+mercado|fue\s+retirad[oa]/i.test(html);
  return { idCredito: idCampo || idArchivo, idCampo, enlaces, retirado };
}

/** Interpreta un enlace de explorador. Devuelve null si no es de un explorador conocido. */
export function interpretarEnlace(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return { url, host: null, problemas: ['URL inválida'] };
  }
  if (!HOSTS_EXPLORADOR.has(u.hostname)) return null;
  const segmentos = u.pathname.split('/').filter(Boolean);
  const tipo = segmentos.includes('contract') ? 'contract' : segmentos.includes('tx') ? 'tx' : null;
  const valor = segmentos[segmentos.length - 1] ?? '';
  const problemas = [];
  if (u.protocol !== 'https:') problemas.push('no usa https');
  if (!segmentos.includes('testnet')) problemas.push('no apunta a testnet');
  if (!tipo) problemas.push('no es un enlace de contrato ni de transacción');
  if (tipo === 'tx' && !RE_HASH_TX.test(valor)) problemas.push('hash de transacción inválido (se esperaban 64 hex)');
  return { url, host: u.hostname, tipo, valor, problemas };
}

// ---------------------------------------------------------------- criterios

function criterioContractId(html, regla, cfg) {
  if (!regla) {
    return { estado: ESTADO.FALLA, detalle: 'no hay Contract ID esperado para este documento (ni en doc-expectations.json ni con --expect)' };
  }
  const analisis = analizarTexto(html, regla, cfg);
  if (analisis.diferencias.length) {
    return { estado: ESTADO.FALLA, detalle: analisis.diferencias.map((d) => d.detalle).join('; ') };
  }
  const esperado = (regla.obligatorios ?? regla.permitidos ?? []).join(', ');
  if (regla.confirmado_en_cadena === true) {
    return { estado: ESTADO.PASA, detalle: `coincide con lo esperado (${esperado}) y está confirmado en cadena` };
  }
  return {
    estado: ESTADO.PENDIENTE,
    detalle: `coincide con lo esperado (${esperado}), pero confirmado_en_cadena=false: falta confirmar en cadena que el crédito se emitió en ese contrato`,
  };
}

function criterioEnlace(cert, html) {
  const interpretados = cert.enlaces.map(interpretarEnlace).filter(Boolean);
  if (!interpretados.length) {
    return { estado: ESTADO.FALLA, detalle: 'el certificado no enlaza a lab.stellar.org ni a stellar.expert' };
  }
  const problemas = [];
  // IDs del cuerpo del certificado (sin contar los que están dentro de los propios enlaces).
  const cuerpo = html.replace(/href\s*=\s*"[^"]*"/gi, '');
  const idsContrato = new Set(extraerIds(cuerpo).filter((x) => x.valido).map((x) => x.id));
  for (const e of interpretados) {
    for (const p of e.problemas) problemas.push(`${e.host}: ${p}`);
    if (e.tipo === 'contract' && !idsContrato.has(e.valor)) {
      problemas.push(`${e.host}: el ID del enlace no coincide con ningún Contract ID del certificado`);
    }
  }
  if (!interpretados.some((e) => e.tipo === 'contract')) problemas.push('falta enlace al contrato');
  if (!interpretados.some((e) => e.tipo === 'tx')) problemas.push('falta enlace a la transacción de emisión');
  if (problemas.length) return { estado: ESTADO.FALLA, detalle: problemas.join('; ') };
  return {
    estado: ESTADO.PASA,
    detalle: `${interpretados.length} enlaces con formato, host, red (testnet) e ID correctos; que abran en el explorador NO se probó (sin red)`,
  };
}

export function evaluarCertificado(html, nombreArchivo, cfg, { expect = null } = {}) {
  const cert = leerCertificado(html, nombreArchivo);
  const regla = expect ? { permitidos: expect, obligatorios: expect, confirmado_en_cadena: false } : cfg.esperados.externos?.[basename(nombreArchivo)];

  const criterios = [
    {
      id: 'activo_unico',
      nombre: 'Activo único',
      ...(cert.idCredito
        ? { estado: ESTADO.PENDIENTE, detalle: `crédito ${cert.idCredito}: falta verificar_credito en cadena (que exista una sola vez en el contrato)` }
        : { estado: ESTADO.FALLA, detalle: 'el certificado no identifica el crédito' }),
    },
    {
      id: 'historial',
      nombre: 'Historial',
      estado: ESTADO.PENDIENTE,
      detalle: 'falta historial_credito en cadena (emisión y transferencias)',
    },
    {
      id: 'retiro',
      nombre: 'Retiro',
      ...(cert.retirado
        ? { estado: ESTADO.PENDIENTE, detalle: 'el certificado declara el crédito retirado: falta confirmar el retiro en cadena' }
        : { estado: ESTADO.NO_APLICA, detalle: 'el certificado no declara retiro' }),
    },
    { id: 'enlace_verificacion_publica', nombre: 'Enlace de verificación pública', ...criterioEnlace(cert, html) },
    { id: 'contract_id_correcto', nombre: 'Contract ID correcto', ...criterioContractId(html, regla, cfg) },
  ];
  const cuenta = Object.fromEntries(Object.values(ESTADO).map((e) => [e, criterios.filter((c) => c.estado === e).length]));
  return { certificado: basename(nombreArchivo), credito: cert.idCredito, criterios, resumen: cuenta };
}

// ------------------------------------------------------------------- salida

export function formatear(informe, formato = 'texto') {
  if (formato === 'json') return JSON.stringify(informe, null, 2);
  const r = informe.resumen;
  const pie = `Resumen: ${r.PASA} PASA, ${r.FALLA} FALLA, ${r.PENDIENTE} PENDIENTE, ${r.NO_APLICA} NO_APLICA`;
  if (formato === 'md') {
    const filas = informe.criterios.map((c) => `| ${c.nombre} | **${c.estado}** | ${c.detalle} |`);
    return [`### Certificado ${informe.certificado} (crédito ${informe.credito ?? 'sin identificar'})`, '', '| Criterio | Estado | Detalle |', '|---|---|---|', ...filas, '', pie].join('\n');
  }
  const ancho = Math.max(...informe.criterios.map((c) => c.id.length));
  return [
    `Certificado ${informe.certificado} — crédito ${informe.credito ?? 'sin identificar'}`,
    ...informe.criterios.map((c) => `  ${c.estado.padEnd(9)}  ${c.id.padEnd(ancho)}  ${c.detalle}`),
    pie,
  ].join('\n');
}

export function ejecutar({ archivo, raiz = RAIZ_POR_DEFECTO, formato = 'texto', expect = null }) {
  if (!archivo || !existsSync(archivo)) return { codigo: 2, salida: `ERROR: no se encontró el certificado: ${archivo ?? '(sin ruta)'}` };
  if (!['texto', 'md', 'json'].includes(formato)) return { codigo: 2, salida: `ERROR: formato desconocido: ${formato}` };
  let cfg;
  try {
    cfg = cargarConfig(raiz);
  } catch (e) {
    return { codigo: 2, salida: `ERROR de configuración: ${e.message}` };
  }
  if (cfg.errores.length) return { codigo: 2, salida: `ERROR de configuración: ${cfg.errores.join('; ')}` };
  if (expect) {
    const desconocidos = expect.filter((a) => !cfg.porAlias.has(a));
    if (desconocidos.length) return { codigo: 2, salida: `ERROR: alias desconocido en --expect: ${desconocidos.join(', ')}` };
  }
  const informe = evaluarCertificado(readFileSync(archivo, 'utf8'), archivo, cfg, { expect });
  return { codigo: informe.resumen.FALLA > 0 ? 1 : 0, salida: formatear(informe, formato), informe };
}

function main(argv) {
  const op = { archivo: null, raiz: RAIZ_POR_DEFECTO, formato: 'texto', expect: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--formato') op.formato = argv[++i] ?? '';
    else if (a === '--root') op.raiz = resolve(argv[++i] ?? '');
    else if (a === '--expect') op.expect = (argv[++i] ?? '').split(',').filter(Boolean);
    else if (a === '--help' || a === '-h') {
      console.log('Uso: node scripts/checklist-certificado.mjs <certificado.html> [--formato texto|md|json] [--root <carpeta>] [--expect <alias,alias>]');
      return 0;
    } else if (a.startsWith('--')) {
      console.error(`Opción desconocida: ${a}`);
      return 2;
    } else op.archivo = a;
  }
  const { codigo, salida } = ejecutar(op);
  (codigo === 2 ? console.error : console.log)(salida);
  return codigo;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
