/**
 * Reads DateTimeOriginal (when the photo was taken) from a JPEG's EXIF block.
 * Returns "yyyy-mm-ddThh:mm:ss" in the camera's local time, or null.
 */
export function readExifTakenAt(buf: ArrayBuffer): string | null {
  const v = new DataView(buf);
  if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return null;
  let off = 2;
  while (off + 4 <= v.byteLength) {
    const marker = v.getUint16(off);
    const len = v.getUint16(off + 2);
    if (marker === 0xffe1 && off + 10 <= v.byteLength && v.getUint32(off + 4) === 0x45786966 /* "Exif" */) {
      return readTiff(v, off + 10, off + 2 + len);
    }
    if ((marker & 0xff00) !== 0xff00 || marker === 0xffda) return null;
    off += 2 + len;
  }
  return null;
}

function readTiff(v: DataView, start: number, end: number): string | null {
  if (start + 8 > end) return null;
  const little = v.getUint16(start) === 0x4949;
  const u16 = (o: number) => v.getUint16(o, little);
  const u32 = (o: number) => v.getUint32(o, little);

  const findTag = (ifd: number, tag: number): number | null => {
    if (ifd + 2 > end) return null;
    const n = u16(ifd);
    for (let i = 0; i < n; i++) {
      const e = ifd + 2 + i * 12;
      if (e + 12 > end) return null;
      if (u16(e) === tag) return e;
    }
    return null;
  };
  const ascii = (entry: number): string | null => {
    const count = u32(entry + 4);
    const at = count > 4 ? start + u32(entry + 8) : entry + 8;
    if (at + count > end) return null;
    let s = "";
    for (let i = 0; i < count; i++) {
      const c = v.getUint8(at + i);
      if (!c) break;
      s += String.fromCharCode(c);
    }
    return s;
  };

  const ifd0 = start + u32(start + 4);
  const exifPtr = findTag(ifd0, 0x8769);
  let raw: string | null = null;
  if (exifPtr !== null) {
    const exifIfd = start + u32(exifPtr + 8);
    const dto = findTag(exifIfd, 0x9003);
    if (dto !== null) raw = ascii(dto);
  }
  if (!raw) {
    const dt = findTag(ifd0, 0x0132);
    if (dt !== null) raw = ascii(dt);
  }
  const m = raw && /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(raw);
  if (!m || m[1] === "0000") return null;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`;
}
