import type { Settings } from '../types.js';
import { formatDuration } from '../tautulli.js';

export interface TemplateData {
  settings: Settings;
  movies: RenderedItem[];
  shows: RenderedShow[];
  music: RenderedItem[];
  topMovies?: RenderedStatRow[];
  topTV?: RenderedStatRow[];
  topUsers?: RenderedStatRow[];
  stats?: { totalPlays: number; totalDuration: string; windowDays: number };
  generatedDate: string;
  logoCid?: string;
}

export interface RenderedItem {
  title: string;
  subtitle?: string;
  summary?: string;
  posterCid?: string;
  badge?: string;
  year?: string;
}

export interface RenderedShow {
  title: string;
  posterCid?: string;
  episodes: { label: string; title: string; summary?: string }[];
}

export interface RenderedStatRow {
  label: string;
  detail: string;
  posterCid?: string;
}

const COLORS = {
  bg: '#0e0e10',
  card: '#16161a',
  text: '#f5f5f7',
  muted: '#a1a1aa',
  divider: '#2a2a30'
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

function shortSummary(s: string | undefined, max = 220): string {
  if (!s) return '';
  const trimmed = s.trim().replace(/\s+/g, ' ');
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max - 1).replace(/\s+\S*$/, '') + '…';
}

export function buildMjml(data: TemplateData): string {
  const { settings, movies, shows, music, topMovies, topTV, topUsers, stats, generatedDate, logoCid } = data;
  const accent = settings.brand_accent || '#e5a00d';
  const brandName = esc(settings.brand_name || 'Plex Newsletter');
  const headerHtml = settings.brand_header_html || '';
  const footerHtml = settings.brand_footer_html || '';
  const { bg, card, text, muted, divider } = COLORS;

  const logoBlock = logoCid
    ? `<mj-image src="cid:${esc(logoCid)}" alt="${brandName}" width="160px" align="center" padding="0" />`
    : `<mj-text align="center" font-size="26px" font-weight="700" color="${text}" padding="0">${brandName}</mj-text>`;

  const headerSection = `
    <mj-section background-color="${bg}" padding="32px 24px 8px 24px">
      <mj-column>
        ${logoBlock}
        ${
          headerHtml
            ? `<mj-text align="center" color="${muted}" font-size="14px" line-height="1.5" padding="16px 12px 0 12px">${headerHtml}</mj-text>`
            : ''
        }
        <mj-text align="center" color="${accent}" font-size="11px" letter-spacing="2px" font-weight="700" text-transform="uppercase" padding="20px 0 0 0">${esc(generatedDate)}</mj-text>
        <mj-divider border-color="${accent}" border-width="2px" width="40px" padding="12px 0 4px 0" />
      </mj-column>
    </mj-section>
  `;

  const movieSections = movies.length > 0 ? renderItemList('New Movies', movies, accent) : '';
  const showSections = shows.length > 0 ? renderShows(shows, accent) : '';
  const musicSections = music.length > 0 ? renderItemList('New Music', music, accent) : '';

  const topMoviesSection =
    topMovies && topMovies.length > 0 ? renderStatBlock('Most Watched Movies', topMovies, accent) : '';
  const topTVSection = topTV && topTV.length > 0 ? renderStatBlock('Most Watched TV', topTV, accent) : '';
  const topUsersSection =
    topUsers && topUsers.length > 0 ? renderStatBlock('Top Viewers', topUsers, accent) : '';
  const statsSection = stats ? renderStats(stats, accent) : '';

  const nothingNew = movies.length === 0 && shows.length === 0 && music.length === 0;
  const emptyState = nothingNew
    ? `
      <mj-section background-color="${bg}" padding="24px">
        <mj-column>
          <mj-text align="center" color="${muted}" font-size="14px">Nothing new was added this period — but the catalog is still here whenever you are.</mj-text>
        </mj-column>
      </mj-section>
    `
    : '';

  const footerSection = `
    <mj-section background-color="${bg}" padding="24px">
      <mj-column>
        <mj-divider border-color="${divider}" border-width="1px" padding="0 0 16px 0" />
        ${
          footerHtml
            ? `<mj-text align="center" color="${muted}" font-size="12px" line-height="1.6">${footerHtml}</mj-text>`
            : ''
        }
        <mj-text align="center" color="${muted}" font-size="11px" padding="12px 0 0 0">${brandName} • ${esc(generatedDate)}</mj-text>
      </mj-column>
    </mj-section>
  `;

  return `<mjml>
  <mj-head>
    <mj-title>${brandName}</mj-title>
    <mj-preview>${brandName} — recently added on Plex</mj-preview>
    <mj-attributes>
      <mj-all font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" />
      <mj-text color="${text}" font-size="14px" line-height="1.55" />
      <mj-section background-color="${bg}" />
    </mj-attributes>
    <mj-style>
      a, a:visited { color: ${accent} !important; text-decoration: none; }
      img { max-width: 100%; height: auto; display: block; }
      @media only screen and (max-width:480px) {
        .card-poster-wrap { padding: 0 !important; }
        .card-content { padding: 14px !important; }
        .card-poster-wrap img { width: 100% !important; max-width: 100% !important; height: auto !important; border-radius: 0 !important; }
        .episode-label { font-size: 10px !important; }
      }
    </mj-style>
  </mj-head>
  <mj-body background-color="${bg}" width="640px">
    ${headerSection}
    ${statsSection}
    ${topMoviesSection}
    ${topTVSection}
    ${topUsersSection}
    ${emptyState}
    ${movieSections}
    ${showSections}
    ${musicSections}
    ${footerSection}
  </mj-body>
</mjml>`;
}

function sectionTitle(title: string, accent: string): string {
  return `
    <mj-section background-color="${COLORS.bg}" padding="32px 24px 8px 24px">
      <mj-column>
        <mj-text font-size="11px" letter-spacing="2px" font-weight="700" text-transform="uppercase" color="${accent}" padding="0">${esc(title)}</mj-text>
        <mj-divider border-color="${accent}" border-width="2px" width="32px" align="left" padding="8px 0 0 0" />
      </mj-column>
    </mj-section>
  `;
}

/**
 * Build one card row. Two top-level columns (poster + content), both share the card bg color.
 * Section padding gives the outer gap; columns stack to 100% width on screens < 480px.
 */
function itemCard(opts: {
  title: string;
  subtitle?: string;
  meta?: string;
  summary?: string;
  posterCid?: string;
  posterWidth?: number;
}): string {
  const { card, text, muted } = COLORS;
  const { title, subtitle, meta, summary, posterCid, posterWidth = 200 } = opts;

  const posterCol = posterCid
    ? `
      <mj-column width="33%" background-color="${card}" padding="0" vertical-align="middle" css-class="card-poster-wrap">
        <mj-image src="cid:${esc(posterCid)}" alt="${esc(title)}" width="${posterWidth}px" padding="0" align="center" />
      </mj-column>
    `
    : '';
  const contentWidth = posterCid ? '67%' : '100%';

  const titleHtml = `<mj-text color="${text}" font-size="16px" font-weight="700" line-height="1.3" padding="0">${esc(title)}${meta ? ` <span style="color:${muted}; font-weight:500;">· ${esc(meta)}</span>` : ''}</mj-text>`;
  const subtitleHtml = subtitle
    ? `<mj-text color="${muted}" font-size="12px" font-weight="600" letter-spacing="1px" text-transform="uppercase" padding="2px 0 0 0">${esc(subtitle)}</mj-text>`
    : '';
  const summaryHtml = summary
    ? `<mj-text color="${muted}" font-size="13px" line-height="1.55" padding="8px 0 0 0">${esc(shortSummary(summary, 260))}</mj-text>`
    : '';

  return `
    <mj-section background-color="${COLORS.bg}" padding="6px 16px">
      ${posterCol}
      <mj-column width="${contentWidth}" background-color="${card}" padding="14px 16px" vertical-align="middle" css-class="card-content">
        ${titleHtml}
        ${subtitleHtml}
        ${summaryHtml}
      </mj-column>
    </mj-section>
  `;
}

function renderItemList(heading: string, items: RenderedItem[], accent: string): string {
  const blocks: string[] = [sectionTitle(`${heading} (${items.length})`, accent)];
  for (const item of items) {
    blocks.push(
      itemCard({
        title: item.title,
        meta: item.year,
        subtitle: item.subtitle,
        summary: item.summary,
        posterCid: item.posterCid,
        posterWidth: 200
      })
    );
  }
  return blocks.join('\n');
}

function renderShows(shows: RenderedShow[], accent: string): string {
  const epCount = shows.reduce((n, s) => n + s.episodes.length, 0);
  const blocks: string[] = [sectionTitle(`New TV (${epCount} episode${epCount === 1 ? '' : 's'})`, accent)];
  const { card, text, muted, divider } = COLORS;

  for (const show of shows) {
    const episodeBlocks = show.episodes
      .map((ep, i) => {
        const dividerEl =
          i > 0
            ? `<mj-divider border-color="${divider}" border-width="1px" padding="14px 0 12px 0" />`
            : '';
        const summaryEl = ep.summary
          ? `<mj-text color="${muted}" font-size="13px" line-height="1.55" padding="6px 0 0 0">${esc(shortSummary(ep.summary, 200))}</mj-text>`
          : '';
        return `
          ${dividerEl}
          <mj-text color="${accent}" font-size="11px" font-weight="700" letter-spacing="1px" line-height="1.4" padding="0">${esc(ep.label)}</mj-text>
          <mj-text color="${text}" font-size="14px" font-weight="600" line-height="1.4" padding="3px 0 0 0">${esc(ep.title)}</mj-text>
          ${summaryEl}
        `;
      })
      .join('');

    const posterCol = show.posterCid
      ? `
        <mj-column width="33%" background-color="${card}" padding="0" vertical-align="top" css-class="card-poster-wrap">
          <mj-image src="cid:${esc(show.posterCid)}" alt="${esc(show.title)}" width="200px" padding="0" align="center" />
        </mj-column>
      `
      : '';
    const contentWidth = show.posterCid ? '67%' : '100%';

    blocks.push(`
      <mj-section background-color="${COLORS.bg}" padding="6px 16px">
        ${posterCol}
        <mj-column width="${contentWidth}" background-color="${card}" padding="16px 18px" vertical-align="top" css-class="card-content">
          <mj-text color="${text}" font-size="17px" font-weight="700" padding="0 0 12px 0" line-height="1.25">${esc(show.title)}</mj-text>
          ${episodeBlocks}
        </mj-column>
      </mj-section>
    `);
  }
  return blocks.join('\n');
}

function renderStatBlock(title: string, rows: RenderedStatRow[], accent: string): string {
  const { card, text, muted, divider } = COLORS;
  const items = rows
    .slice(0, 5)
    .map(
      (r, i) => `
        <tr>
          <td style="padding:10px 12px; vertical-align:middle; ${i === 0 ? '' : `border-top:1px solid ${divider};`}">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td width="28" style="color:${accent}; font-size:18px; font-weight:700; vertical-align:middle; width:28px;">${i + 1}</td>
                ${
                  r.posterCid
                    ? `<td width="48" style="vertical-align:middle; width:48px; padding-right:10px;"><img src="cid:${esc(r.posterCid)}" width="40" height="40" style="border-radius:4px; object-fit:cover; display:block; width:40px; height:40px;" alt="" /></td>`
                    : ''
                }
                <td style="vertical-align:middle;">
                  <div style="color:${text}; font-size:14px; font-weight:600;">${esc(r.label)}</div>
                  <div style="color:${muted}; font-size:12px; padding-top:2px;">${esc(r.detail)}</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      `
    )
    .join('');
  return `
    ${sectionTitle(title, accent)}
    <mj-section background-color="${COLORS.bg}" padding="6px 16px">
      <mj-column background-color="${card}" padding="6px 0">
        <mj-raw>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;">
            ${items}
          </table>
        </mj-raw>
      </mj-column>
    </mj-section>
  `;
}

function renderStats(stats: { totalPlays: number; totalDuration: string; windowDays: number }, accent: string): string {
  const { card, muted } = COLORS;
  return `
    ${sectionTitle(`Last ${stats.windowDays} Days`, accent)}
    <mj-section background-color="${COLORS.bg}" padding="6px 16px">
      <mj-column background-color="${card}" padding="22px 16px" width="50%">
        <mj-text align="center" color="${accent}" font-size="32px" font-weight="700" padding="0">${stats.totalPlays.toLocaleString()}</mj-text>
        <mj-text align="center" color="${muted}" font-size="11px" letter-spacing="2px" font-weight="700" text-transform="uppercase" padding="6px 0 0 0">Total Plays</mj-text>
      </mj-column>
      <mj-column background-color="${card}" padding="22px 16px" width="50%">
        <mj-text align="center" color="${accent}" font-size="32px" font-weight="700" padding="0">${esc(stats.totalDuration)}</mj-text>
        <mj-text align="center" color="${muted}" font-size="11px" letter-spacing="2px" font-weight="700" text-transform="uppercase" padding="6px 0 0 0">Watched</mj-text>
      </mj-column>
    </mj-section>
  `;
}

export { formatDuration };
