import fs from 'node:fs';
import path from 'node:path';
import mjml2html from 'mjml';
import { UPLOADS_DIR } from '../config.js';
import { buildPublicId, cloudinaryConfigFromSettings, uploadImageBuffer } from '../cloudinary.js';
import type { ComposedNewsletter, Settings } from '../types.js';
import { UNSUBSCRIBE_PLACEHOLDER } from './template.js';

const COLORS = {
  bg: '#0e0e10',
  text: '#f5f5f7',
  muted: '#a1a1aa',
  divider: '#222226'
};

function esc(s: string | undefined | null): string {
  if (s === undefined || s === null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function guessContentType(p: string): string {
  const ext = path.extname(p).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.svg') return 'image/svg+xml';
  if (ext === '.webp') return 'image/webp';
  return 'application/octet-stream';
}

export interface BroadcastOptions {
  subject: string;
  bodyHtml: string;
  /** When false, skip the brand header/footer wrapper and send the body html as-is. */
  wrapWithBranding?: boolean;
}

/**
 * Compose a one-off broadcast email. Wraps the user's HTML in the same
 * brand shell as the newsletter (logo header + footer with unsubscribe) so
 * recipients still see a consistent look. Subject and body keep their
 * `{{name}}` / `{{first_name}}` / `{{email}}` / `{{unsubscribe_url}}`
 * placeholders for per-recipient substitution downstream.
 */
export async function composeBroadcast(settings: Settings, opts: BroadcastOptions): Promise<ComposedNewsletter> {
  const wrap = opts.wrapWithBranding !== false;
  const includeUnsubscribe = !!settings.public_url;
  const attachments: ComposedNewsletter['attachments'] = [];

  let html: string;
  let text: string;

  if (wrap) {
    // Resolve logo to either a Cloudinary URL or an attached cid:
    let logoSrc: string | undefined;
    const cloudinary = cloudinaryConfigFromSettings(settings);
    if (settings.brand_logo_path) {
      const logoFull = path.join(UPLOADS_DIR, path.basename(settings.brand_logo_path));
      if (fs.existsSync(logoFull)) {
        try {
          const bytes = fs.readFileSync(logoFull);
          const contentType = guessContentType(logoFull);
          if (cloudinary) {
            try {
              const mtime = fs.statSync(logoFull).mtimeMs;
              const publicId = buildPublicId(cloudinary.folder, `logo-${path.basename(logoFull)}`, `${logoFull}@${mtime}`);
              logoSrc = await uploadImageBuffer(cloudinary, bytes, publicId, contentType);
            } catch (err) {
              console.warn('Cloudinary logo upload failed, falling back to CID:', err);
            }
          }
          if (!logoSrc) {
            const cid = `logo@pivo`;
            attachments.push({ filename: path.basename(logoFull), cid, content: bytes, contentType });
            logoSrc = `cid:${cid}`;
          }
        } catch (err) {
          console.warn('Failed to attach broadcast logo:', err);
        }
      }
    }

    const generatedDate = new Date().toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });

    const mjml = buildBroadcastMjml({
      settings,
      bodyHtml: opts.bodyHtml,
      generatedDate,
      logoSrc,
      includeUnsubscribe
    });

    const result = mjml2html(mjml, { validationLevel: 'soft' }) as unknown as {
      html: string;
      errors?: { formattedMessage: string }[];
    };
    if (result.errors && result.errors.length > 0) {
      for (const e of result.errors) console.warn('Broadcast MJML warning:', e.formattedMessage);
    }
    html = result.html;
  } else {
    // Send the body HTML as-is, with a tiny unsubscribe footer appended if applicable.
    const footer = includeUnsubscribe
      ? `<div style="margin-top:32px; padding-top:16px; border-top:1px solid #ddd; color:#666; font-size:12px; text-align:center;"><a href="${UNSUBSCRIBE_PLACEHOLDER}" style="color:#666;">Unsubscribe</a></div>`
      : '';
    html = `<!doctype html><html><body>${opts.bodyHtml}${footer}</body></html>`;
  }

  text = htmlToText(opts.bodyHtml) + (includeUnsubscribe ? `\n\n---\nTo unsubscribe: ${UNSUBSCRIBE_PLACEHOLDER}` : '');

  return {
    subject: opts.subject,
    html,
    text,
    attachments
  };
}

function buildBroadcastMjml(opts: {
  settings: Settings;
  bodyHtml: string;
  generatedDate: string;
  logoSrc?: string;
  includeUnsubscribe: boolean;
}): string {
  const { settings, bodyHtml, generatedDate, logoSrc, includeUnsubscribe } = opts;
  const accent = settings.brand_accent || '#e5a00d';
  const brandName = esc(settings.brand_name || 'Plex Newsletter');
  const footerHtml = settings.brand_footer_html || '';
  const { bg, text, muted, divider } = COLORS;

  const logoBlock = logoSrc
    ? `<mj-image src="${esc(logoSrc)}" alt="${brandName}" width="140px" align="center" padding="0" />`
    : `<mj-text align="center" font-size="24px" font-weight="700" color="${text}" letter-spacing="-0.02em" padding="0">${brandName}</mj-text>`;

  const unsubscribeLink = includeUnsubscribe
    ? `<mj-text align="center" color="${muted}" font-size="11px" padding="6px 0 0 0">
         <a href="${UNSUBSCRIBE_PLACEHOLDER}" style="color:${muted}; text-decoration:underline;">Unsubscribe</a>
       </mj-text>`
    : '';

  return `<mjml>
  <mj-head>
    <mj-title>${brandName}</mj-title>
    <mj-font name="Inter" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" />
    <mj-attributes>
      <mj-all font-family="Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" />
      <mj-text color="${text}" font-size="14px" line-height="1.6" />
      <mj-section background-color="${bg}" />
    </mj-attributes>
    <mj-style>
      a, a:visited { color: ${accent} !important; text-decoration: none; }
      img { max-width: 100%; height: auto; display: block; }
      body, table, td, div, p, a, span, h1, h2, h3, h4 {
        font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif !important;
        font-feature-settings: 'cv02', 'cv11', 'ss01';
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
      }
      .broadcast-body { color: ${text}; }
      .broadcast-body p { margin: 0 0 14px 0; line-height: 1.6; color: ${text}; }
      .broadcast-body h1, .broadcast-body h2, .broadcast-body h3 { color: ${text}; letter-spacing: -0.01em; line-height: 1.3; }
      .broadcast-body h1 { font-size: 24px; margin: 0 0 12px 0; }
      .broadcast-body h2 { font-size: 19px; margin: 24px 0 10px 0; }
      .broadcast-body h3 { font-size: 16px; margin: 20px 0 8px 0; }
      .broadcast-body ul, .broadcast-body ol { padding-left: 22px; margin: 0 0 14px 0; }
      .broadcast-body li { margin: 4px 0; line-height: 1.55; }
      .broadcast-body img { border-radius: 4px; margin: 8px 0; }
      .broadcast-body blockquote { border-left: 3px solid ${accent}; padding: 4px 0 4px 14px; color: ${muted}; margin: 14px 0; }
      .broadcast-body hr { border: 0; border-top: 1px solid ${divider}; margin: 20px 0; }
    </mj-style>
  </mj-head>
  <mj-body background-color="${bg}" width="640px">
    <mj-section background-color="${bg}" padding="44px 32px 0 32px">
      <mj-column>
        <mj-text align="center" color="${accent}" font-size="10.5px" letter-spacing="2.5px" font-weight="700" text-transform="uppercase" padding="0 0 24px 0">${esc(generatedDate)}</mj-text>
        ${logoBlock}
      </mj-column>
    </mj-section>
    <mj-section background-color="${bg}" padding="36px 32px 0 32px">
      <mj-column>
        <mj-divider border-color="${divider}" border-width="1px" padding="0" />
      </mj-column>
    </mj-section>
    <mj-section background-color="${bg}" padding="28px 32px 0 32px">
      <mj-column>
        <mj-raw>
          <div class="broadcast-body" style="color:${text}; font-family:Inter,-apple-system,sans-serif; font-size:14px; line-height:1.6;">
            ${bodyHtml}
          </div>
        </mj-raw>
      </mj-column>
    </mj-section>
    <mj-section background-color="${bg}" padding="48px 32px 32px 32px">
      <mj-column>
        <mj-divider border-color="${divider}" border-width="1px" padding="0 0 24px 0" />
        ${
          footerHtml
            ? `<mj-text align="center" color="${muted}" font-size="12px" line-height="1.7">${footerHtml}</mj-text>`
            : ''
        }
        <mj-text align="center" color="${muted}" font-size="11px" letter-spacing="0.3px" padding="14px 0 0 0">${brandName}</mj-text>
        ${unsubscribeLink}
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`;
}

/** Bare-bones HTML→text fallback for the multipart text/plain leg. */
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
