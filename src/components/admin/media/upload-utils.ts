/**
 * Browser-side upload helpers: HEIC to JPEG (07 §8), the placeholder colour, and a PUT with
 * progress (fetch cannot report upload progress, XMLHttpRequest can).
 */

export function isHeicFile(file: File): boolean {
  return /^image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
}

function renameExtension(name: string, ext: string) {
  return `${name.replace(/\.[a-z0-9]+$/i, "")}.${ext}`;
}

function canvasToJpeg(source: CanvasImageSource, width: number, height: number): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(source, 0, 0);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode"))), "image/jpeg", 0.92),
  );
}

/**
 * HEIC photos (iPhone) become JPEG before upload: the browser's own decoder when it has one
 * (Safari), otherwise libheif compiled to WebAssembly, loaded only now. Re-encoding drops
 * EXIF, and both decoders apply the photo's rotation first.
 */
export async function convertHeic(file: File): Promise<File> {
  let jpeg: Blob | null = null;
  try {
    const bitmap = await createImageBitmap(file);
    jpeg = await canvasToJpeg(bitmap, bitmap.width, bitmap.height);
    bitmap.close();
  } catch {
    const { heicTo } = await import("heic-to/csp");
    jpeg = await heicTo({ blob: file, type: "image/jpeg", quality: 0.92 });
  }
  return new File([jpeg], renameExtension(file.name, "jpg"), { type: "image/jpeg" });
}

/** Average colour of a 16x16 downscale, as #rrggbb; null when the browser cannot read it. */
export async function averageColor(file: Blob): Promise<string | null> {
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml") return null;
  try {
    const size = 16;
    const bitmap = await createImageBitmap(file, {
      resizeWidth: size,
      resizeHeight: size,
      resizeQuality: "medium",
    });
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    const { data } = ctx.getImageData(0, 0, size, size);
    let r = 0;
    let g = 0;
    let b = 0;
    let weight = 0;
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3]! / 255;
      r += data[i]! * a;
      g += data[i + 1]! * a;
      b += data[i + 2]! * a;
      weight += a;
    }
    if (weight === 0) return null;
    const hex = (n: number) =>
      Math.round(n / weight)
        .toString(16)
        .padStart(2, "0");
    return `#${hex(r)}${hex(g)}${hex(b)}`;
  } catch {
    return null;
  }
}

export function putWithProgress(
  url: string,
  file: Blob,
  onProgress: (fraction: number) => void,
): Promise<{ ok: true } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve({ ok: true });
      let error = "The upload failed. Try again.";
      try {
        error = (JSON.parse(xhr.responseText) as { error?: string }).error ?? error;
      } catch {
        /* not JSON */
      }
      resolve({ ok: false, error });
    };
    xhr.onerror = () =>
      resolve({ ok: false, error: "The connection dropped during the upload. Try again." });
    xhr.send(file);
  });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
