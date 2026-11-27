/**
 * Shrinks a photo in the browser before upload (longest side at most `maxSide` px, JPEG),
 * so phone photos of several MB become a few hundred KB. GIFs are left as they are.
 */
export async function shrinkImage(file: File, maxSide = 1600): Promise<File> {
  if (file.type === "image/gif") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    // e.g. a format the browser can't decode (some HEIC photos): upload unchanged, the server checks it.
    return file;
  }
}
