/**
 * Utility for client-side compression and conversion of medical certificates
 * and documents without external paid cloud storage services.
 */

export interface CompressionResult {
  dataUrl: string;
  fileName: string;
  fileSizeKb: number;
}

/**
 * Converts a base64 Data URL into a browser Blob.
 */
export function dataUrlToBlob(dataUrl: string): Blob {
  const parts = dataUrl.split(',');
  if (parts.length < 2) {
    throw new Error('Data URL non valido.');
  }

  const mimeMatch = parts[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
  const binaryString = atob(parts[1]);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);

  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  return new Blob([bytes], { type: mime });
}

/**
 * Checks if a given URL is a legacy simulation mock URL.
 */
export function isMockUrl(url?: string): boolean {
  if (!url) return false;
  return url.includes('example.com/mock-upload');
}

/**
 * Opens a document in a new browser tab safely.
 * Chromium blocks top-level navigation to `data:` URLs.
 * Converting to an ephemeral Blob URL bypasses this restriction.
 */
export function openDocumentBlobUrl(url: string, fileName?: string): Window | null {
  if (!url) return null;

  if (isMockUrl(url)) {
    console.warn('[openDocumentBlobUrl] Prevented navigation to mock URL:', url);
    return null;
  }

  if (url.startsWith('data:')) {
    try {
      const blob = dataUrlToBlob(url);
      const blobUrl = URL.createObjectURL(blob);
      const opened = window.open(blobUrl, '_blank');

      if (!opened) {
        // Fallback for pop-up blockers: trigger temporary download link
        const a = document.createElement('a');
        a.href = blobUrl;
        a.target = '_blank';
        if (fileName) a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }

      // Revoke the blob URL after 2 minutes to free memory
      setTimeout(() => URL.revokeObjectURL(blobUrl), 120000);
      return opened;
    } catch (err) {
      console.error('[openDocumentBlobUrl] Error converting data URL to Blob:', err);
      return null;
    }
  }

  // Already a blob: or normal http/https URL
  return window.open(url, '_blank');
}

/**
 * Compresses an image client-side via HTML Canvas to JPEG (~150-200 KB, max 300 KB).
 * For PDFs, reads into clean Base64 data URL with a strict 500 KB limit.
 */
export async function compressMedicalCertificate(file: File): Promise<CompressionResult> {
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  const isImage = file.type.startsWith('image/') || /\.(jpe?g|png|webp|heic)$/i.test(file.name);

  if (isPdf) {
    const maxPdfBytes = 500 * 1024; // 500 KB
    if (file.size > maxPdfBytes) {
      const sizeKb = Math.round(file.size / 1024);
      throw new Error(
        `Il file PDF supera la dimensione massima consentita di 500 KB (${sizeKb} KB). Si consiglia di comprimere il PDF o scattare una foto (JPG/PNG) del certificato.`
      );
    }

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const fileSizeKb = Math.round((dataUrl.length * 0.75) / 1024);
        resolve({
          dataUrl,
          fileName: file.name,
          fileSizeKb,
        });
      };
      reader.onerror = () => reject(new Error('Errore durante la lettura del file PDF.'));
      reader.readAsDataURL(file);
    });
  }

  if (isImage) {
    return new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(file);
      const img = new Image();

      img.onload = () => {
        URL.revokeObjectURL(objectUrl);

        try {
          let width = img.naturalWidth || img.width;
          let height = img.naturalHeight || img.height;

          // Constrain dimensions to max 1400px (optimal for A4 medical certificates readability)
          const maxDimension = 1400;
          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            } else {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Impossibile inizializzare il contesto Canvas per la compressione.'));
            return;
          }

          // Solid white background for PNG transparency support
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, width, height);

          // Draw scaled image
          ctx.drawImage(img, 0, 0, width, height);

          // Start with high quality and iteratively step down if needed
          // Target size is ~150-200 KB, with hard limit of 300 KB
          let quality = 0.82;
          let dataUrl = canvas.toDataURL('image/jpeg', quality);
          let approxBytes = dataUrl.length * 0.75;

          const targetMaxBytes = 250 * 1024; // 250 KB
          while (approxBytes > targetMaxBytes && quality > 0.45) {
            quality -= 0.08;
            dataUrl = canvas.toDataURL('image/jpeg', quality);
            approxBytes = dataUrl.length * 0.75;
          }

          const cleanBaseName = file.name.replace(/\.[^/.]+$/, '');
          const newFileName = `${cleanBaseName}.jpg`;
          const finalSizeKb = Math.round(approxBytes / 1024);

          resolve({
            dataUrl,
            fileName: newFileName,
            fileSizeKb: finalSizeKb,
          });
        } catch (err: any) {
          reject(new Error(`Errore durante la compressione dell'immagine: ${err?.message || err}`));
        }
      };

      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Impossibile caricare l\'immagine selezionata. Verifica che il formato sia valido.'));
      };

      img.src = objectUrl;
    });
  }

  throw new Error(`Formato file non supportato. Seleziona una scansione PDF o una foto (JPG, PNG).`);
}
