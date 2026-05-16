export type UploadResult = {
  id: string;
  url: string;
  mime: string;
  bytes: number;
  width: number | null;
  height: number | null;
};

export const ALLOWED_UPLOAD_MIMES: ReadonlySet<string> = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
]);

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

function probeImage(file: File): Promise<{ width: number; height: number } | null> {
  if (file.type === 'image/svg+xml') return Promise.resolve(null);
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

export async function uploadImage(file: File): Promise<UploadResult> {
  if (!ALLOWED_UPLOAD_MIMES.has(file.type)) {
    throw new Error(`Unsupported image type: ${file.type || 'unknown'}`);
  }
  if (file.size === 0) {
    throw new Error('File is empty');
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(
      `File is ${(file.size / 1024 / 1024).toFixed(1)} MB — limit is ${MAX_UPLOAD_BYTES / 1024 / 1024} MB`,
    );
  }
  const dims = await probeImage(file);
  const form = new FormData();
  form.append('file', file);
  if (dims) {
    form.append('width', String(dims.width));
    form.append('height', String(dims.height));
  }
  const res = await fetch('/api/attachments', { method: 'POST', body: form });
  if (!res.ok) {
    let message = `Upload failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // ignore — keep generic message
    }
    throw new Error(message);
  }
  return (await res.json()) as UploadResult;
}
