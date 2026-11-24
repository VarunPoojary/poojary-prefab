import { readExifTakenAt } from "./exif";

/** Longest side of a stored photo. Phone photos (4000 px) shrink to a few hundred KB. */
export const PHOTO_MAX_PX = 1600;
export const PHOTO_QUALITY = 0.8;

export interface PreparedImage {
  blob: Blob;
  name: string;
  width: number;
  height: number;
  takenAt: string | null;
}

const isShrinkable = (f: File) => /^image\/(jpeg|png|webp|heic|heif)$/i.test(f.type);

/**
 * Shrinks a photo on the device before upload (JPEG, longest side PHOTO_MAX_PX) and reads when it was taken.
 * Other files (PDF, drawings) are returned unchanged.
 */
export async function prepareImage(file: File): Promise<PreparedImage> {
  const takenAt = /jpe?g/i.test(file.type) ? readExifTakenAt(await file.slice(0, 256 * 1024).arrayBuffer()) : null;
  if (!isShrinkable(file) || typeof createImageBitmap === "undefined") {
    return { blob: file, name: file.name, width: 0, height: 0, takenAt };
  }
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, PHOTO_MAX_PX / Math.max(bmp.width, bmp.height));
    const width = Math.round(bmp.width * scale);
    const height = Math.round(bmp.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bmp, 0, 0, width, height);
    bmp.close();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", PHOTO_QUALITY));
    if (!blob || (scale === 1 && blob.size >= file.size)) return { blob: file, name: file.name, width, height, takenAt };
    return { blob, name: file.name.replace(/\.[^.]+$/, "") + ".jpg", width, height, takenAt };
  } catch {
    return { blob: file, name: file.name, width: 0, height: 0, takenAt };
  }
}
