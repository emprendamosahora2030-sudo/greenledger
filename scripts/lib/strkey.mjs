// Validación offline de StrKey de Stellar (sin dependencias, sin red).
// Un StrKey es: base32( byte_de_tipo | payload de 32 bytes | CRC16-XModem (little-endian) ).
// Sirve para detectar IDs mal copiados (typos) y claves secretas pegadas por error.

const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export const VERSION = Object.freeze({
  CONTRATO: 2 << 3, // empieza con "C"
  SEMILLA_SECRETA: 18 << 3, // empieza con "S"
});

export function base32Decodificar(texto) {
  let bits = 0;
  let valor = 0;
  const salida = [];
  for (const ch of texto) {
    const idx = ALFABETO.indexOf(ch);
    if (idx === -1) return null;
    valor = (valor << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      salida.push((valor >> bits) & 0xff);
      valor &= (1 << bits) - 1;
    }
  }
  return Uint8Array.from(salida);
}

export function base32Codificar(bytes) {
  let bits = 0;
  let valor = 0;
  let salida = '';
  for (const b of bytes) {
    valor = (valor << 8) | b;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      salida += ALFABETO[(valor >> bits) & 31];
      valor &= (1 << bits) - 1;
    }
  }
  if (bits > 0) salida += ALFABETO[(valor << (5 - bits)) & 31];
  return salida;
}

export function crc16Xmodem(bytes) {
  let crc = 0;
  for (const b of bytes) {
    crc ^= b << 8;
    for (let i = 0; i < 8; i++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc;
}

/** Arma un StrKey a partir de un tipo y 32 bytes de payload (útil para pruebas). */
export function codificarStrKey(version, payload32) {
  if (payload32.length !== 32) throw new Error('El payload debe tener 32 bytes');
  const cuerpo = Uint8Array.from([version, ...payload32]);
  const crc = crc16Xmodem(cuerpo);
  return base32Codificar(Uint8Array.from([...cuerpo, crc & 0xff, crc >> 8]));
}

export function validarStrKey(texto, versionEsperada) {
  if (typeof texto !== 'string') return { ok: false, motivo: 'no es texto' };
  if (texto.length !== 56) {
    return { ok: false, motivo: `longitud ${texto.length} (se esperaban 56)` };
  }
  const crudo = base32Decodificar(texto);
  if (!crudo || crudo.length !== 35) return { ok: false, motivo: 'no es base32 válido' };
  if (crudo[0] !== versionEsperada) return { ok: false, motivo: 'tipo de StrKey incorrecto' };
  const calculado = crc16Xmodem(crudo.subarray(0, 33));
  const guardado = crudo[33] | (crudo[34] << 8);
  if (calculado !== guardado) {
    return { ok: false, motivo: 'checksum inválido (posible error de tipeo)' };
  }
  return { ok: true };
}

export const validarContractId = (texto) => validarStrKey(texto, VERSION.CONTRATO);
export const validarSemillaSecreta = (texto) => validarStrKey(texto, VERSION.SEMILLA_SECRETA);
