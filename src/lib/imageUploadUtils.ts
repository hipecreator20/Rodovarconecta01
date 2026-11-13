export interface ProcessedUploadImage {
  dataUrl: string;
  width: number;
  height: number;
  mimeType: string;
  sizeBytes: number;
  wasCompressed: boolean;
}

export interface ImageUploadProcessOptions {
  maxWidth?: number;
  maxHeight?: number;
  maxDataUrlBytes?: number;
  preferPng?: boolean;
}

function estimateBase64Bytes(dataUrl: string): number {
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx < 0) return dataUrl.length;
  const b64 = dataUrl.slice(commaIdx + 1);
  return Math.floor((b64.length * 3) / 4);
}

function readFileAsDataUrlRaw(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo de imagem selecionado.'));
    reader.readAsDataURL(file);
  });
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Arquivo inválido ou formato de imagem não suportado pelo navegador.'));
    img.src = src;
  });
}

/**
 * Normalizes and safely compresses images on the client so uploads never fail
 * due to Vercel Serverless's 4.5 MB request body limit or exotic image formats
 * (e.g., AVIF/BMP/GIF/ICO/HEIC-decoded by browser).
 */
export async function processImageFileForUpload(
  file: File,
  options: ImageUploadProcessOptions = {}
): Promise<ProcessedUploadImage> {
  const maxWidth = options.maxWidth ?? 1920;
  const maxHeight = options.maxHeight ?? 1080;
  const maxDataUrlBytes = options.maxDataUrlBytes ?? 1_800_000; // Safe margin below Vercel 4.5MB limit

  if (!file) {
    throw new Error('Nenhum arquivo de imagem foi selecionado.');
  }

  const lowerName = file.name.toLowerCase();
  const isSvg = file.type === 'image/svg+xml' || lowerName.endsWith('.svg');
  if (isSvg) {
    throw new Error('Arquivos SVG não são permitidos por política de segurança. Utilize PNG, JPG ou WebP.');
  }

  if (file.size > 20 * 1024 * 1024) {
    throw new Error('O arquivo selecionado ultrapassa 20 MB. Escolha uma imagem menor.');
  }

  const rawDataUrl = await readFileAsDataUrlRaw(file);
  if (!rawDataUrl.startsWith('data:image/')) {
    throw new Error('O arquivo selecionado não é uma imagem válida.');
  }

  const img = await loadImageElement(rawDataUrl);
  const naturalWidth = img.naturalWidth || img.width;
  const naturalHeight = img.naturalHeight || img.height;

  if (!naturalWidth || !naturalHeight) {
    throw new Error('Não foi possível identificar as dimensões da imagem.');
  }

  const isStandardMime = ['image/png', 'image/jpeg', 'image/webp'].includes(file.type.toLowerCase());
  const rawBytes = estimateBase64Bytes(rawDataUrl);

  // If already standard PNG/JPG/WebP, within target dimensions and safely below Vercel cap, keep untouched
  if (
    isStandardMime &&
    rawBytes <= maxDataUrlBytes &&
    naturalWidth <= maxWidth &&
    naturalHeight <= maxHeight
  ) {
    return {
      dataUrl: rawDataUrl,
      width: naturalWidth,
      height: naturalHeight,
      mimeType: file.type.toLowerCase(),
      sizeBytes: rawBytes,
      wasCompressed: false,
    };
  }

  // Otherwise render onto canvas (also converts GIF/BMP/AVIF/ICO into clean PNG or JPEG)
  const scale = Math.min(1, maxWidth / naturalWidth, maxHeight / naturalHeight);
  const targetW = Math.max(1, Math.round(naturalWidth * scale));
  const targetH = Math.max(1, Math.round(naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return {
      dataUrl: rawDataUrl,
      width: naturalWidth,
      height: naturalHeight,
      mimeType: file.type || 'image/png',
      sizeBytes: rawBytes,
      wasCompressed: false,
    };
  }

  ctx.drawImage(img, 0, 0, targetW, targetH);

  // Prefer PNG for small transparent/UI assets when requested, otherwise WebP/JPEG for compact payload
  const preferPng = options.preferPng || file.type === 'image/png' || file.type === 'image/x-icon';
  if (preferPng) {
    const pngUrl = canvas.toDataURL('image/png');
    const pngBytes = estimateBase64Bytes(pngUrl);
    if (pngBytes <= maxDataUrlBytes) {
      return {
        dataUrl: pngUrl,
        width: targetW,
        height: targetH,
        mimeType: 'image/png',
        sizeBytes: pngBytes,
        wasCompressed: true,
      };
    }
  }

  // Try JPEG at progressive quality levels so payload always stays comfortably under Vercel cap
  for (const quality of [0.88, 0.78, 0.68, 0.56]) {
    const jpgUrl = canvas.toDataURL('image/jpeg', quality);
    const jpgBytes = estimateBase64Bytes(jpgUrl);
    if (jpgBytes <= maxDataUrlBytes || quality === 0.56) {
      return {
        dataUrl: jpgUrl,
        width: targetW,
        height: targetH,
        mimeType: 'image/jpeg',
        sizeBytes: jpgBytes,
        wasCompressed: true,
      };
    }
  }

  return {
    dataUrl: rawDataUrl,
    width: naturalWidth,
    height: naturalHeight,
    mimeType: file.type || 'image/jpeg',
    sizeBytes: rawBytes,
    wasCompressed: false,
  };
}
