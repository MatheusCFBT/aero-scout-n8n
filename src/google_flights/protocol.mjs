/** Minimal codec for the public Google Flights URL; unknown fields are preserved as raw bytes. */
export function createFlightProtocol() {
  const WIRE_TYPES = { INTEGER: 0, FIXED_64: 1, BYTES: 2, FIXED_32: 5 };
  const VARINT_BASE = 128;
  const VARINT_DATA_MASK = 127;
  const VARINT_CONTINUATION = 128;
  const MAX_VARINT_BYTES = 10;
  // These are encoded protobuf tags (field number * 8 + wire type), not field numbers.
  const TAGS = { FLIGHT_LEG: 26, DATE: 18, ORIGIN: 106, DESTINATION: 114 };

  function fields(bytes) {
    let offset = 0;
    const result = [];

    function readInteger() {
      let value = 0;
      let shift = 0;
      for (let index = 0; index < MAX_VARINT_BYTES; index += 1) {
        if (offset >= bytes.length) {
          throw Error("Parâmetro truncado");
        }
        const byte = bytes[offset++];
        value += (byte & VARINT_DATA_MASK) * 2 ** shift;
        if (!(byte & VARINT_CONTINUATION)) {
          return value;
        }
        shift += 7;
      }
      throw Error("Parâmetro inválido");
    }

    while (offset < bytes.length) {
      const start = offset;
      const key = readInteger();
      const wireType = key % 8;
      let data;

      if (wireType === WIRE_TYPES.BYTES) {
        const length = readInteger();
        if (!Number.isSafeInteger(length) || offset + length > bytes.length) {
          throw Error("Comprimento inválido");
        }
        data = bytes.subarray(offset, offset + length);
        offset += length;
      } else if (wireType === WIRE_TYPES.INTEGER) {
        readInteger();
      } else if (wireType === WIRE_TYPES.FIXED_64) {
        offset += 8;
      } else if (wireType === WIRE_TYPES.FIXED_32) {
        offset += 4;
      } else {
        throw Error("Formato de parâmetro desconhecido");
      }

      if (offset > bytes.length) {
        throw Error("Parâmetro truncado");
      }
      result.push({ key, data, raw: bytes.subarray(start, offset) });
    }
    return result;
  }

  function encodeInteger(value) {
    const bytes = [];
    do {
      const continuation = value >= VARINT_BASE ? VARINT_CONTINUATION : 0;
      bytes.push((value % VARINT_BASE) | continuation);
      value = Math.floor(value / VARINT_BASE);
    } while (value);
    return Buffer.from(bytes);
  }

  function field(tag, data) {
    return Buffer.concat([encodeInteger(tag), encodeInteger(data.length), data]);
  }

  function airportLocation(origin) {
    // The public URL represents an IATA airport as location type 1 and a three-byte code.
    return Buffer.from([8, 1, 18, 3, ...Buffer.from(origin)]);
  }

  function integerField(tag, value) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw Error("Inteiro inválido");
    }
    return Buffer.concat([encodeInteger(tag), encodeInteger(value)]);
  }

  return { fields, field, integerField, airportLocation, tags: TAGS };
}
