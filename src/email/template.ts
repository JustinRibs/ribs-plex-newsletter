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
  /**
   * Final `src=` value for the brand logo. Either a `cid:…` reference (when
   * attached inline) or a public https URL (when hosted on Cloudinary).
   */
  logoSrc?: string;
  /** When true, the footer renders an Unsubscribe link with the {{UNSUBSCRIBE_URL}} placeholder. */
  includeUnsubscribe?: boolean;
}

/** Placeholder string the sender substitutes per-recipient. */
export const UNSUBSCRIBE_PLACEHOLDER = '{{UNSUBSCRIBE_URL}}';

/**
 * `posterSrc` is a ready-to-render `src=` value: either `cid:img1@…` (inline
 * attachment) or `https://…` (when Cloudinary hosting is enabled). The
 * template emits it as-is — see compose.ts for how it's chosen.
 */
export interface RenderedItem {
  title: string;
  subtitle?: string;
  summary?: string;
  posterSrc?: string;
  badge?: string;
  year?: string;
}

export interface RenderedShow {
  title: string;
  posterSrc?: string;
  episodes: { label: string; title: string; summary?: string }[];
}

export interface RenderedStatRow {
  label: string;
  detail: string;
  posterSrc?: string;
}

const COLORS = {
  bg: '#0e0e10',
  text: '#f5f5f7',
  textSoft: '#d4d4d8',
  muted: '#a1a1aa',
  divider: '#222226',
  hairline: '#1c1c20'
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

function shortSummary(s: string | undefined, max = 110): string {
  if (!s) return '';
  const trimmed = s.trim().replace(/\s+/g, ' ');
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max - 1).replace(/\s+\S*$/, '') + '…';
}

export function buildMjml(data: TemplateData): string {
  const { settings, movies, shows, music, topMovies, topTV, topUsers, stats, generatedDate, logoSrc, includeUnsubscribe } = data;
  const accent = settings.brand_accent || '#e5a00d';
  const brandName = esc(settings.brand_name || 'Plex Newsletter');
  const headerHtml = settings.brand_header_html || '';
  const footerHtml = settings.brand_footer_html || '';
  const showSummaries = !!settings.show_summaries;
  const { bg, text, muted, divider } = COLORS;

  const logoBlock = logoSrc
    ? `<mj-image src="${esc(logoSrc)}" alt="${brandName}" width="140px" align="center" padding="0" />`
    : `<mj-text align="center" font-size="24px" font-weight="700" color="${text}" letter-spacing="-0.02em" padding="0">${brandName}</mj-text>`;

  const headerSection = `
    <mj-section background-color="${bg}" padding="44px 32px 0 32px">
      <mj-column>
        <mj-text align="center" color="${accent}" font-size="10.5px" letter-spacing="2.5px" font-weight="700" text-transform="uppercase" padding="0 0 24px 0">${esc(generatedDate)}</mj-text>
        ${logoBlock}
        ${
          headerHtml
            ? `<mj-text align="center" color="${muted}" font-size="14px" line-height="1.6" padding="20px 16px 0 16px">${headerHtml}</mj-text>`
            : ''
        }
      </mj-column>
    </mj-section>
    <mj-section background-color="${bg}" padding="36px 32px 0 32px">
      <mj-column>
        <mj-divider border-color="${divider}" border-width="1px" padding="0" />
      </mj-column>
    </mj-section>
  `;

  const movieSections = movies.length > 0 ? renderItemList('New Movies', movies, accent, { showSummaries }) : '';
  const showSections = shows.length > 0 ? renderShows(shows, accent) : '';
  const musicSections = music.length > 0 ? renderItemList('New Music', music, accent, { showSummaries }) : '';

  const topMoviesSection =
    topMovies && topMovies.length > 0 ? renderStatBlock('Most Watched Movies', topMovies, accent) : '';
  const topTVSection = topTV && topTV.length > 0 ? renderStatBlock('Most Watched TV', topTV, accent) : '';
  const topUsersSection =
    topUsers && topUsers.length > 0 ? renderStatBlock('Top Viewers', topUsers, accent) : '';
  const statsSection = stats ? renderStats(stats, accent) : '';

  const nothingNew = movies.length === 0 && shows.length === 0 && music.length === 0;
  const emptyState = nothingNew
    ? `
      <mj-section background-color="${bg}" padding="48px 32px">
        <mj-column>
          <mj-text align="center" color="${muted}" font-size="14px" line-height="1.6">Nothing new was added this period — but the catalog is still here whenever you are.</mj-text>
        </mj-column>
      </mj-section>
    `
    : '';

  const unsubscribeLink = includeUnsubscribe
    ? `<mj-text align="center" color="${muted}" font-size="11px" padding="6px 0 0 0">
         <a href="${UNSUBSCRIBE_PLACEHOLDER}" style="color:${muted}; text-decoration:underline;">Unsubscribe</a>
       </mj-text>`
    : '';

  const footerSection = `
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
  `;

  return `<mjml>
  <mj-head>
    <mj-title>${brandName}</mj-title>
    <mj-preview>${brandName} — recently added on Plex</mj-preview>
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
      .stat-number { font-variant-numeric: tabular-nums; }
      .stat-rank { font-variant-numeric: tabular-nums; }
      @media only screen and (max-width:480px) {
        .item-poster img { width: 80px !important; max-width: 80px !important; }
        .item-poster { padding-right: 14px !important; }
        .show-episodes-table td { font-size: 13px !important; }
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

function sectionHeader(title: string, count: number, accent: string): string {
  const { muted, divider } = COLORS;
  return `
    <mj-section background-color="${COLORS.bg}" padding="40px 32px 0 32px">
      <mj-column>
        <mj-text font-size="10.5px" letter-spacing="2.5px" font-weight="700" text-transform="uppercase" color="${muted}" padding="0 0 14px 0">
          ${esc(title)} <span style="color:${accent};">·</span> ${count}
        </mj-text>
        <mj-divider border-color="${divider}" border-width="1px" padding="0" />
      </mj-column>
    </mj-section>
  `;
}

function itemRow(opts: {
  title: string;
  subtitle?: string;
  meta?: string;
  summary?: string;
  posterSrc?: string;
  isLast?: boolean;
  posterDisplayPx?: number;
}): string {
  const { text, textSoft, muted, divider } = COLORS;
  const { title, subtitle, meta, summary, posterSrc, isLast, posterDisplayPx = 100 } = opts;

  const posterCol = posterSrc
    ? `<mj-column width="${posterDisplayPx + 24}px" padding="0" vertical-align="top" css-class="item-poster">
         <mj-image src="${esc(posterSrc)}" alt="${esc(title)}" width="${posterDisplayPx}px" padding="0" align="left" border-radius="4px" />
       </mj-column>`
    : '';
  const contentWidth = posterSrc ? `${640 - 64 - posterDisplayPx - 24}px` : '100%';

  const subtitleLine = subtitle
    ? `<mj-text color="${muted}" font-size="11px" font-weight="600" letter-spacing="1.4px" text-transform="uppercase" padding="0 0 6px 0">${esc(subtitle)}</mj-text>`
    : '';
  const titleLine = `<mj-text color="${text}" font-size="17px" font-weight="700" line-height="1.3" letter-spacing="-0.01em" padding="0">${esc(title)}${meta ? ` <span style="color:${muted}; font-weight:500;">${esc(meta)}</span>` : ''}</mj-text>`;
  const summaryLine = summary
    ? `<mj-text color="${textSoft}" font-size="13.5px" line-height="1.6" padding="8px 0 0 0">${esc(shortSummary(summary, 110))}</mj-text>`
    : '';

  const dividerSection = !isLast
    ? `<mj-section background-color="${COLORS.bg}" padding="22px 32px 0 32px">
         <mj-column>
           <mj-divider border-color="${divider}" border-width="1px" padding="0" />
         </mj-column>
       </mj-section>`
    : '';

  return `
    <mj-section background-color="${COLORS.bg}" padding="22px 32px 0 32px">
      ${posterCol}
      <mj-column width="${contentWidth}" padding="0" vertical-align="top">
        ${subtitleLine}
        ${titleLine}
        ${summaryLine}
      </mj-column>
    </mj-section>
    ${dividerSection}
  `;
}

function renderItemList(heading: string, items: RenderedItem[], accent: string, opts: { showSummaries: boolean }): string {
  const blocks: string[] = [sectionHeader(heading, items.length, accent)];
  items.forEach((item, i) => {
    blocks.push(
      itemRow({
        title: item.title,
        meta: item.year,
        subtitle: item.subtitle,
        summary: opts.showSummaries ? item.summary : undefined,
        posterSrc: item.posterSrc,
        isLast: i === items.length - 1
      })
    );
  });
  return blocks.join('\n');
}

function renderShows(shows: RenderedShow[], accent: string): string {
  const epCount = shows.reduce((n, s) => n + s.episodes.length, 0);
  const blocks: string[] = [sectionHeader('New TV', epCount, accent)];
  const { text, textSoft, muted, divider } = COLORS;

  shows.forEach((show, showIdx) => {
    const isLastShow = showIdx === shows.length - 1;

    // Compact episode list — small label in accent, title in muted body color, no summaries.
    const episodeRows = show.episodes
      .map((ep, i) => {
        const top = i === 0 ? '' : `border-top:1px solid ${divider};`;
        return `
          <tr>
            <td style="padding:8px 14px 8px 0; vertical-align:top; ${top} width:64px; white-space:nowrap;">
              <span style="color:${accent}; font-size:11px; font-weight:700; letter-spacing:1px; font-family:Inter,sans-serif;">${esc(ep.label)}</span>
            </td>
            <td style="padding:8px 0; vertical-align:top; ${top}">
              <span style="color:${textSoft}; font-size:13.5px; font-weight:500; line-height:1.5; font-family:Inter,sans-serif;">${esc(ep.title)}</span>
            </td>
          </tr>
        `;
      })
      .join('');

    const posterCol = show.posterSrc
      ? `<mj-column width="124px" padding="0" vertical-align="top" css-class="item-poster">
           <mj-image src="${esc(show.posterSrc)}" alt="${esc(show.title)}" width="100px" padding="0" align="left" border-radius="4px" />
         </mj-column>`
      : '';
    const contentWidth = show.posterSrc ? '452px' : '100%';

    blocks.push(`
      <mj-section background-color="${COLORS.bg}" padding="22px 32px 0 32px">
        ${posterCol}
        <mj-column width="${contentWidth}" padding="0" vertical-align="top">
          <mj-text color="${muted}" font-size="11px" font-weight="600" letter-spacing="1.4px" text-transform="uppercase" padding="0 0 6px 0">${esc(show.episodes.length === 1 ? '1 episode' : `${show.episodes.length} episodes`)}</mj-text>
          <mj-text color="${text}" font-size="17px" font-weight="700" line-height="1.3" letter-spacing="-0.01em" padding="0 0 10px 0">${esc(show.title)}</mj-text>
          <mj-raw>
            <table role="presentation" class="show-episodes-table" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%; border-collapse:collapse;">
              ${episodeRows}
            </table>
          </mj-raw>
        </mj-column>
      </mj-section>
      ${
        !isLastShow
          ? `<mj-section background-color="${COLORS.bg}" padding="22px 32px 0 32px">
               <mj-column>
                 <mj-divider border-color="${divider}" border-width="1px" padding="0" />
               </mj-column>
             </mj-section>`
          : ''
      }
    `);
  });

  return blocks.join('\n');
}

function renderStatBlock(title: string, rows: RenderedStatRow[], accent: string): string {
  const { text, muted, divider } = COLORS;
  const items = rows
    .slice(0, 5)
    .map(
      (r, i) => `
        <tr>
          <td style="padding:12px 0; vertical-align:middle; ${i === 0 ? '' : `border-top:1px solid ${divider};`}">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td width="32" style="color:${muted}; font-size:13px; font-weight:600; vertical-align:middle; width:32px; font-variant-numeric:tabular-nums;">${i + 1}</td>
                ${
                  r.posterSrc
                    ? `<td width="44" style="vertical-align:middle; width:44px; padding-right:12px;"><img src="${esc(r.posterSrc)}" width="36" height="36" style="border-radius:4px; object-fit:cover; display:block; width:36px; height:36px;" alt="" /></td>`
                    : ''
                }
                <td style="vertical-align:middle;">
                  <div style="color:${text}; font-size:14px; font-weight:600; letter-spacing:-0.005em;">${esc(r.label)}</div>
                </td>
                <td style="vertical-align:middle; text-align:right; color:${muted}; font-size:12px; font-variant-numeric:tabular-nums; white-space:nowrap; padding-left:12px;">${esc(r.detail)}</td>
              </tr>
            </table>
          </td>
        </tr>
      `
    )
    .join('');
  return `
    ${sectionHeader(title, rows.length, accent)}
    <mj-section background-color="${COLORS.bg}" padding="6px 32px 0 32px">
      <mj-column padding="0">
        <mj-raw>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%; border-collapse:collapse;">
            ${items}
          </table>
        </mj-raw>
      </mj-column>
    </mj-section>
  `;
}

function renderStats(stats: { totalPlays: number; totalDuration: string; windowDays: number }, accent: string): string {
  const { muted, divider } = COLORS;
  return `
    <mj-section background-color="${COLORS.bg}" padding="40px 32px 0 32px">
      <mj-column>
        <mj-text font-size="10.5px" letter-spacing="2.5px" font-weight="700" text-transform="uppercase" color="${muted}" padding="0 0 14px 0">
          Last ${stats.windowDays} Days
        </mj-text>
        <mj-divider border-color="${divider}" border-width="1px" padding="0" />
      </mj-column>
    </mj-section>
    <mj-section background-color="${COLORS.bg}" padding="22px 32px 0 32px">
      <mj-column padding="0" width="50%">
        <mj-text align="left" color="${accent}" font-size="34px" font-weight="700" letter-spacing="-0.02em" padding="0" css-class="stat-number">${stats.totalPlays.toLocaleString()}</mj-text>
        <mj-text align="left" color="${muted}" font-size="11px" letter-spacing="2px" font-weight="700" text-transform="uppercase" padding="4px 0 0 0">Total Plays</mj-text>
      </mj-column>
      <mj-column padding="0" width="50%">
        <mj-text align="left" color="${accent}" font-size="34px" font-weight="700" letter-spacing="-0.02em" padding="0" css-class="stat-number">${esc(stats.totalDuration)}</mj-text>
        <mj-text align="left" color="${muted}" font-size="11px" letter-spacing="2px" font-weight="700" text-transform="uppercase" padding="4px 0 0 0">Watched</mj-text>
      </mj-column>
    </mj-section>
  `;
}

export { formatDuration };
