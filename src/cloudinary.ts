import crypto from 'node:crypto';
import { request } from 'undici';
import { lookupCloudinaryUrl, saveCloudinaryUrl } from './db.js';
import type { Settings } from './types.js';

export interface CloudinaryConfig {
  cloud_name: string;
  api_key: string;
  api_secret: string;
  folder: string;
}

export class CloudinaryError extends Error {}

/** Returns config when Cloudinary is enabled and fully configured, otherwise null. */
export function cloudinaryConfigFromSettings(s: Settings): CloudinaryConfig | null {
  if (!s.cloudinary_enabled) return null;
  if (!s.cloudinary_cloud_name || !s.cloudinary_api_key || !s.cloudinary_api_secret) return null;
  return {
    cloud_name: s.cloudinary_cloud_name,
    api_key: s.cloudinary_api_key,
    api_secret: s.cloudinary_api_secret,
    folder: (s.cloudinary_folder || 'pivo').replace(/^\/+|\/+$/g, '') || 'pivo'
  };
}

/**
 * Build a deterministic Cloudinary public_id from a hint and the source image
 * reference. The Plex `thumb` path includes a version suffix that changes when
 * the poster is re-grabbed, so encoding it into the public_id naturally
 * invalidates the cache without us having to track timestamps.
 */
export function buildPublicId(folder: string, hint: string, src: string): string {
  const safeHint = hint.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60) || 'img';
  const versionHash = crypto.createHash('sha1').update(src).digest('hex').slice(0, 10);
  return `${folder}/${safeHint}-${versionHash}`;
}

function signParams(params: Record<string, string | number>, apiSecret: string): string {
  const toSign = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
  return crypto.createHash('sha1').update(toSign + apiSecret).digest('hex');
}

/**
 * Upload a buffer to Cloudinary using a signed upload. Reuses the cached URL if
 * we've previously uploaded the same public_id. Returns the secure_url.
 */
export async function uploadImageBuffer(
  cfg: CloudinaryConfig,
  bytes: Buffer,
  publicId: string,
  contentType: string
): Promise<string> {
  const cached = lookupCloudinaryUrl(publicId);
  if (cached) return cached;

  const timestamp = Math.floor(Date.now() / 1000);
  // Only the parameters that participate in the signature go through signParams.
  // `file`, `api_key`, `resource_type`, and `signature` are explicitly excluded
  // by Cloudinary's signing rules.
  const signed = { public_id: publicId, timestamp, overwrite: 'true' } as const;
  const signature = signParams(signed, cfg.api_secret);

  const form = new FormData();
  // Cloudinary accepts a data URI in the `file` field — handy because we
  // already have the bytes in memory and avoid spinning up Blob/File shims.
  form.append('file', `data:${contentType};base64,${bytes.toString('base64')}`);
  form.append('public_id', publicId);
  form.append('timestamp', String(timestamp));
  form.append('overwrite', 'true');
  form.append('api_key', cfg.api_key);
  form.append('signature', signature);

  const url = `https://api.cloudinary.com/v1_1/${encodeURIComponent(cfg.cloud_name)}/image/upload`;
  const res = await request(url, {
    method: 'POST',
    body: form,
    headersTimeout: 30_000,
    bodyTimeout: 60_000
  });

  const body = (await res.body.json()) as {
    secure_url?: string;
    error?: { message?: string };
  };
  if (res.statusCode < 200 || res.statusCode >= 300 || !body.secure_url) {
    const msg = body.error?.message || `HTTP ${res.statusCode}`;
    throw new CloudinaryError(`Cloudinary upload failed: ${msg}`);
  }

  saveCloudinaryUrl(publicId, body.secure_url);
  return body.secure_url;
}
