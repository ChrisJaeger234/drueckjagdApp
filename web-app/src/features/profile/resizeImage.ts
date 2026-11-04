/**
 * Verkleinert ein Foto vor dem Upload auf höchstens `max` Pixel Kantenlänge (quadratisch
 * zugeschnitten) und speichert es als JPEG. iPhone-Fotos sind sonst oft über 2 MB.
 */
export async function resizeAvatar(file: File, max = 512): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const size = Math.min(max, side);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
  bitmap.close();
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob ?? file), 'image/jpeg', 0.85));
}
