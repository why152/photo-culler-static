const HEADER_BYTES = 128 * 1024;
const MAX_SEGMENTS = 256;

function ascii(bytes, offset, length) {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function exifOrientation(bytes) {
  let offset = ascii(bytes, 0, 6) === "Exif\0\0" ? 6 : 0;
  const view = new DataView(bytes.buffer, bytes.byteOffset + offset, bytes.length - offset);
  const little = view.getUint16(0) === 0x4949;
  if (!little && view.getUint16(0) !== 0x4d4d) return 1;
  if (view.getUint16(2, little) !== 42) return 1;
  const ifd = view.getUint32(4, little);
  const count = view.getUint16(ifd, little);
  for (let index = 0; index < count; index++) {
    const entry = ifd + 2 + index * 12;
    if (view.getUint16(entry, little) === 0x0112 &&
        view.getUint16(entry + 2, little) === 3 && view.getUint32(entry + 4, little) === 1) {
      const orientation = view.getUint16(entry + 8, little);
      return orientation >= 1 && orientation <= 8 ? orientation : 1;
    }
  }
  return 1;
}

// Read dimensions and orientation from bounded metadata slices, never decode
// pixels just to discover their size. Unknown/malformed metadata falls back to
// one ordinary decode, whose bitmap is then fitted by the analysis canvas.
export async function imageDimensions(file) {
  try {
    const header = new Uint8Array(await file.slice(0, HEADER_BYTES).arrayBuffer());
    let windowStart = -1;
    let metadataWindow = null;
    const read = async (offset, length) => {
      if (offset < 0 || offset + length > file.size) throw new Error("Truncated image metadata");
      if (offset + length <= header.length) return header.subarray(offset, offset + length);
      if (!metadataWindow || offset < windowStart || offset + length > windowStart + metadataWindow.length) {
        windowStart = offset;
        metadataWindow = new Uint8Array(await file.slice(offset, Math.min(file.size, offset + Math.max(HEADER_BYTES, length))).arrayBuffer());
      }
      return metadataWindow.subarray(offset - windowStart, offset - windowStart + length);
    };
    let width, height, orientation = 1;
    if (header[0] === 0xff && header[1] === 0xd8) {
      let offset = 2;
      for (let count = 0; count < MAX_SEGMENTS; count++) {
        const marker = await read(offset, 2);
        if (marker[0] !== 0xff) return null;
        if (marker[1] === 0xff) { offset++; continue; }
        if ([0xda, 0xd9].includes(marker[1])) break;
        if (marker[1] === 0x01 || marker[1] >= 0xd0 && marker[1] <= 0xd7) { offset += 2; continue; }
        const lengthBytes = await read(offset + 2, 2);
        const length = (lengthBytes[0] << 8) | lengthBytes[1];
        if (length < 2) return null;
        if (marker[1] === 0xe1) {
          const metadata = await read(offset + 4, length - 2);
          if (ascii(metadata, 0, 6) === "Exif\0\0") orientation = exifOrientation(metadata);
        }
        if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker[1])) {
          const dimensions = await read(offset + 4, 5);
          height = (dimensions[1] << 8) | dimensions[2];
          width = (dimensions[3] << 8) | dimensions[4];
        }
        offset += 2 + length;
        if (count === MAX_SEGMENTS - 1) return null;
      }
    } else if (ascii(header, 0, 8) === "\x89PNG\r\n\x1a\n") {
      let offset = 8;
      for (let count = 0; count < MAX_SEGMENTS; count++) {
        const chunk = await read(offset, 8);
        const length = new DataView(chunk.buffer, chunk.byteOffset, 4).getUint32(0);
        const kind = ascii(chunk, 4, 4);
        if (kind === "IHDR") {
          const dimensions = await read(offset + 8, 8);
          const view = new DataView(dimensions.buffer, dimensions.byteOffset, 8);
          width = view.getUint32(0); height = view.getUint32(4);
        } else if (kind === "eXIf") {
          if (length > HEADER_BYTES) return null;
          orientation = exifOrientation(await read(offset + 8, length));
        }
        if (kind === "IEND") break;
        offset += 12 + length;
        if (count === MAX_SEGMENTS - 1) return null;
      }
    } else if (ascii(header, 0, 4) === "RIFF" && ascii(header, 8, 4) === "WEBP") {
      const riffLength = new DataView(header.buffer, header.byteOffset + 4, 4).getUint32(0, true) + 8;
      if (riffLength !== file.size) return null;
      let offset = 12;
      let count = 0;
      while (offset + 8 <= riffLength) {
        if (++count > MAX_SEGMENTS) return null;
        const chunk = await read(offset, 8);
        const kind = ascii(chunk, 0, 4);
        const length = new DataView(chunk.buffer, chunk.byteOffset + 4, 4).getUint32(0, true);
        if (offset + 8 + length + (length & 1) > riffLength) return null;
        if (kind === "VP8X") {
          const data = await read(offset + 8, 10);
          width = 1 + data[4] + (data[5] << 8) + (data[6] << 16);
          height = 1 + data[7] + (data[8] << 8) + (data[9] << 16);
        } else if (kind === "VP8 " && !width) {
          const data = await read(offset + 8, 10);
          if (data[3] !== 0x9d || data[4] !== 1 || data[5] !== 0x2a) return null;
          width = (data[6] | (data[7] << 8)) & 0x3fff;
          height = (data[8] | (data[9] << 8)) & 0x3fff;
        } else if (kind === "VP8L" && !width) {
          const data = await read(offset + 8, 5);
          if (data[0] !== 0x2f) return null;
          width = 1 + data[1] + ((data[2] & 0x3f) << 8);
          height = 1 + (data[2] >> 6) + (data[3] << 2) + ((data[4] & 0x0f) << 10);
        } else if (kind === "EXIF") {
          if (length > HEADER_BYTES) return null;
          orientation = exifOrientation(await read(offset + 8, length));
        }
        offset += 8 + length + (length & 1);
      }
    }
    if (!width || !height) return null;
    return { width, height, orientation };
  } catch {
    return null;
  }
}

export function dimensionsWithin(longEdge, width, height) {
  if (Math.max(width, height) <= longEdge) return { width, height };
  const scale = longEdge / Math.max(width, height);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function orientedDimensions({ width, height, orientation = 1 }) {
  return orientation >= 5 && orientation <= 8 ? { width: height, height: width } : { width, height };
}
