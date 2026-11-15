// Mobile-safe upload preprocessing helper (handles camera photos, WebP/HEIC, oversized images & iOS/Android Safari quirks)

export interface PreparedMobileFile {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  base64: string;
  dataUrl: string;
  blob: Blob;
}

const MAX_PDF_BYTES = 10 * 1024 * 1024; // 10 MB
const TARGET_IMAGE_MAX_BYTES = 1.8 * 1024 * 1024; // ~1.8 MB keeps JSON/multipart well below Vercel 4.5 MB limit

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunkSize, bytes.length)));
  }
  return btoa(binary);
}

function readBlobAsArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') {
    return blob.arrayBuffer();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(new Error('Falha ao ler arquivo no dispositivo móvel.'));
    reader.readAsArrayBuffer(blob);
  });
}

async function compressImageFileForMobile(
  file: File,
  maxBytes: number
): Promise<{ blob: Blob; mimeType: string; fileName: string } | null> {
  if (typeof document === 'undefined' || typeof window === 'undefined') return null;

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Imagem não suportada pelo decodificador do navegador.'));
      el.src = objectUrl;
    });

    const naturalW = img.naturalWidth || img.width || 1200;
    const naturalH = img.naturalHeight || img.height || 1200;
    const maxDim = 1800;
    const scale = Math.min(1, maxDim / Math.max(naturalW, naturalH));
    const width = Math.max(1, Math.round(naturalW * scale));
    const height = Math.max(1, Math.round(naturalH * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // White background prevents transparent PNGs from turning black when converted to JPEG
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    const preferPng =
      file.type === 'image/png' && file.size <= maxBytes && naturalW <= maxDim && naturalH <= maxDim;
    const outMime = preferPng ? 'image/png' : 'image/jpeg';

    const tryToBlob = (quality: number): Promise<Blob | null> =>
      new Promise((resolve) => canvas.toBlob((b) => resolve(b), outMime, quality));

    let blob = await tryToBlob(0.86);
    if (blob && blob.size > maxBytes) {
      blob = await tryToBlob(0.72);
    }
    if (blob && blob.size > maxBytes) {
      blob = await tryToBlob(0.56);
    }
    if (!blob) return null;

    const baseName = (file.name || 'comprovante').replace(/\.[^.]+$/, '');
    const ext = outMime === 'image/png' ? 'png' : 'jpg';
    return {
      blob,
      mimeType: outMime,
      fileName: `${baseName}.${ext}`,
    };
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function prepareMobileUploadFile(
  file: File,
  options?: { maxBytes?: number; maxImageBytes?: number }
): Promise<PreparedMobileFile> {
  const maxTotalBytes = options?.maxBytes ?? MAX_PDF_BYTES;
  const maxImgBytes = options?.maxImageBytes ?? TARGET_IMAGE_MAX_BYTES;
  const rawName = file.name || 'comprovante';
  const lower = rawName.toLowerCase();
  const isPdf = file.type === 'application/pdf' || lower.endsWith('.pdf');
  const isImage =
    file.type.startsWith('image/') ||
    /\.(jpe?g|png|webp|heic|heif|bmp|gif)$/i.test(lower);

  if (!isPdf && !isImage) {
    throw new Error('Formato não suportado. Selecione um arquivo PDF, JPEG, PNG ou WebP.');
  }

  if (file.size <= 0) {
    throw new Error('O arquivo selecionado está vazio.');
  }

  if (isPdf) {
    if (file.size > maxTotalBytes) {
      throw new Error(
        `O PDF selecionado excede o limite de ${(maxTotalBytes / (1024 * 1024)).toFixed(0)} MB.`
      );
    }
    const buf = await readBlobAsArrayBuffer(file);
    const base64 = arrayBufferToBase64(buf);
    return {
      fileName: lower.endsWith('.pdf') ? rawName : `${rawName}.pdf`,
      mimeType: 'application/pdf',
      sizeBytes: buf.byteLength,
      base64,
      dataUrl: `data:application/pdf;base64,${base64}`,
      blob: file,
    };
  }

  // Image handling: always convert/compress oversized photos or non-standard mobile formats (HEIC/WebP) to JPEG/PNG
  const needsCanvasProcess =
    file.size > maxImgBytes ||
    !/^image\/(jpeg|jpg|png)$/i.test(file.type) ||
    /\.(webp|heic|heif|bmp)$/i.test(lower);

  if (needsCanvasProcess) {
    const converted = await compressImageFileForMobile(file, maxImgBytes);
    if (converted && converted.blob.size > 0 && converted.blob.size <= maxTotalBytes) {
      const buf = await readBlobAsArrayBuffer(converted.blob);
      const base64 = arrayBufferToBase64(buf);
      return {
        fileName: converted.fileName,
        mimeType: converted.mimeType,
        sizeBytes: buf.byteLength,
        base64,
        dataUrl: `data:${converted.mimeType};base64,${base64}`,
        blob: converted.blob,
      };
    }
  }

  if (file.size > maxTotalBytes) {
    throw new Error('A imagem excede o limite máximo permitido. Tente tirar outra foto ou enviar em PDF.');
  }

  const buf = await readBlobAsArrayBuffer(file);
  const bytes = new Uint8Array(buf);
  let resolvedMime = file.type;
  if (!resolvedMime) {
    if (bytes[0] === 0x89 && bytes[1] === 0x50) resolvedMime = 'image/png';
    else if (bytes[0] === 0xff && bytes[1] === 0xd8) resolvedMime = 'image/jpeg';
    else resolvedMime = 'image/jpeg';
  }
  const base64 = arrayBufferToBase64(buf);
  return {
    fileName: rawName,
    mimeType: resolvedMime,
    sizeBytes: buf.byteLength,
    base64,
    dataUrl: `data:${resolvedMime};base64,${base64}`,
    blob: file,
  };
}
