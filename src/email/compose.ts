import fs from 'node:fs';
import path from 'node:path';
import mjml2html from 'mjml';
import { TautulliClient, formatDuration } from '../tautulli.js';
import { UPLOADS_DIR } from '../config.js';
import type { ComposedNewsletter, RecentlyAddedItem, Settings } from '../types.js';
import { buildMjml, type RenderedItem, type RenderedShow, type RenderedStatRow, type TemplateData } from './template.js';

interface Attachment {
  filename: string;
  cid: string;
  content: Buffer;
  contentType: string;
}

export interface ComposeOptions {
  /** When true, fetch zero images and use placeholder posters. Useful for fast previews. */
  skipImages?: boolean;
}

export async function composeNewsletter(settings: Settings, opts: ComposeOptions = {}): Promise<ComposedNewsletter> {
  const tautulli = new TautulliClient(settings.tautulli_url, settings.tautulli_api_key);
  const attachments: Attachment[] = [];
  let cidCounter = 0;
  const nextCid = () => `img${++cidCounter}@ribs-newsletter`;

  async function attachImage(img: string, filenameHint: string, width = 400): Promise<string | undefined> {
    if (opts.skipImages || !img) return undefined;
    const fetched = await tautulli.fetchImage(img, { width });
    if (!fetched) return undefined;
    const cid = nextCid();
    const ext = fetched.contentType.includes('png') ? 'png' : 'jpg';
    attachments.push({
      filename: `${filenameHint}.${ext}`.replace(/[^a-zA-Z0-9._-]/g, '_'),
      cid,
      content: fetched.bytes,
      contentType: fetched.contentType
    });
    return cid;
  }

  // Determine "recently added" window: pull more than the cap, then filter by toggles client-side
  const fetchCount = Math.max(settings.recently_added_count * 2, 20);
  const all = await tautulli.getRecentlyAdded(fetchCount);

  // Movies: keep movie items, cap at recently_added_count if include_movies is on
  const movies: RenderedItem[] = [];
  const shows: RenderedShow[] = [];
  const music: RenderedItem[] = [];

  if (settings.include_movies) {
    const movieItems = all.filter((i) => i.media_type === 'movie').slice(0, settings.recently_added_count);
    for (const m of movieItems) {
      const posterCid = m.thumb ? await attachImage(m.thumb, `movie-${m.rating_key}`, 400) : undefined;
      movies.push({
        title: m.title,
        year: m.year ? String(m.year) : undefined,
        summary: settings.show_summaries ? m.summary : undefined,
        posterCid
      });
    }
  }

  if (settings.include_tv) {
    // Group episodes by show (grandparent_title)
    const episodes = all.filter((i) => i.media_type === 'episode').slice(0, settings.recently_added_count);
    const grouped = new Map<string, RecentlyAddedItem[]>();
    for (const ep of episodes) {
      const key = ep.grandparent_title || ep.parent_title || ep.title;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(ep);
    }

    for (const [showName, eps] of grouped) {
      const showThumb = eps[0].grandparent_thumb || eps[0].parent_thumb;
      const posterCid = showThumb ? await attachImage(showThumb, `show-${eps[0].grandparent_rating_key || eps[0].rating_key}`, 320) : undefined;
      const renderedEps = eps
        .sort((a, b) => Number(a.parent_title || '0') - Number(b.parent_title || '0') || (a.title || '').localeCompare(b.title || ''))
        .map((ep) => {
          const seasonNum = parseInt((ep.parent_title || '').replace(/\D/g, '') || '0', 10);
          const epNum = parseInt(((ep as any).media_index || '0').toString(), 10);
          let label = ep.parent_title || 'Episode';
          if (seasonNum && epNum) label = `S${pad2(seasonNum)}E${pad2(epNum)}`;
          else if (seasonNum) label = `Season ${seasonNum}`;
          return {
            label,
            title: ep.title,
            summary: settings.show_summaries ? ep.summary : undefined
          };
        });
      shows.push({ title: showName, posterCid, episodes: renderedEps });
    }
  }

  if (settings.include_music) {
    const albumItems = all.filter((i) => i.media_type === 'album').slice(0, settings.recently_added_count);
    for (const a of albumItems) {
      const posterCid = a.thumb ? await attachImage(a.thumb, `album-${a.rating_key}`, 320) : undefined;
      music.push({
        title: a.title,
        subtitle: a.parent_title,
        year: a.year ? String(a.year) : undefined,
        summary: settings.show_summaries ? a.summary : undefined,
        posterCid
      });
    }
  }

  // Optional sections
  let topMovies: RenderedStatRow[] | undefined;
  let topTV: RenderedStatRow[] | undefined;
  let topUsers: RenderedStatRow[] | undefined;
  let stats: { totalPlays: number; totalDuration: string; windowDays: number } | undefined;

  if (settings.enable_top_watched || settings.enable_top_users) {
    try {
      const home = await tautulli.getHomeStats(settings.stats_window_days, 5);
      const findStat = (id: string) => home.find((s) => s.stat_id === id);

      if (settings.enable_top_watched) {
        const tm = findStat('top_movies');
        if (tm) {
          topMovies = [];
          for (const r of (tm.rows || []).slice(0, 5)) {
            const cid = r.thumb ? await attachImage(r.thumb, `top-movie-${r.rating_key}`, 200) : undefined;
            topMovies.push({
              label: r.title || '—',
              detail: `${r.total_plays || 0} play${r.total_plays === 1 ? '' : 's'}`,
              posterCid: cid
            });
          }
        }
        const tt = findStat('top_tv');
        if (tt) {
          topTV = [];
          for (const r of (tt.rows || []).slice(0, 5)) {
            const cid = r.thumb ? await attachImage(r.thumb, `top-tv-${r.rating_key}`, 200) : undefined;
            topTV.push({
              label: r.title || '—',
              detail: `${r.total_plays || 0} play${r.total_plays === 1 ? '' : 's'}`,
              posterCid: cid
            });
          }
        }
      }

      if (settings.enable_top_users) {
        const tu = findStat('top_users');
        if (tu) {
          topUsers = [];
          for (const r of (tu.rows || []).slice(0, 5)) {
            const cid = r.user_thumb ? await attachImage(r.user_thumb, `user-${r.user_id}`, 80) : undefined;
            topUsers.push({
              label: r.user || `User ${r.user_id}`,
              detail: `${r.total_plays || 0} play${r.total_plays === 1 ? '' : 's'}`,
              posterCid: cid
            });
          }
        }
      }
    } catch (err) {
      // home stats are best-effort
      console.warn('Failed to load home stats:', err);
    }
  }

  if (settings.enable_stats) {
    try {
      const totals = await tautulli.getHistoryTotals(settings.stats_window_days);
      stats = {
        totalPlays: totals.totalPlays,
        totalDuration: formatDuration(totals.totalDurationSec),
        windowDays: settings.stats_window_days
      };
    } catch (err) {
      console.warn('Failed to load stats totals:', err);
    }
  }

  // Optional logo attachment
  let logoCid: string | undefined;
  if (settings.brand_logo_path) {
    const logoFull = path.join(UPLOADS_DIR, path.basename(settings.brand_logo_path));
    if (fs.existsSync(logoFull)) {
      try {
        const bytes = fs.readFileSync(logoFull);
        const ct = guessContentType(logoFull);
        logoCid = nextCid();
        attachments.push({ filename: path.basename(logoFull), cid: logoCid, content: bytes, contentType: ct });
      } catch (err) {
        console.warn('Failed to attach logo:', err);
      }
    }
  }

  const generatedDate = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });

  const tplData: TemplateData = {
    settings,
    movies,
    shows,
    music,
    topMovies,
    topTV,
    topUsers,
    stats,
    generatedDate,
    logoCid
  };

  const mjml = buildMjml(tplData);
  // mjml@4 is synchronous despite the published @types claiming a Promise
  const result = mjml2html(mjml, { validationLevel: 'soft' }) as unknown as {
    html: string;
    errors?: { formattedMessage: string }[];
  };
  if (result.errors && result.errors.length > 0) {
    for (const e of result.errors) console.warn('MJML warning:', e.formattedMessage);
  }

  const subject = (settings.newsletter_subject || 'New on Plex').replace(/\{\{date\}\}/g, generatedDate);
  const text = buildPlainText(tplData);

  return { subject, html: result.html, text, attachments };
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
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

function buildPlainText(d: TemplateData): string {
  const lines: string[] = [];
  lines.push(d.settings.brand_name);
  lines.push(d.generatedDate);
  lines.push('');
  if (d.stats) {
    lines.push(`Last ${d.stats.windowDays} days: ${d.stats.totalPlays} plays, ${d.stats.totalDuration} watched.`);
    lines.push('');
  }
  if (d.topMovies?.length) {
    lines.push('MOST WATCHED MOVIES');
    for (const r of d.topMovies) lines.push(`• ${r.label} — ${r.detail}`);
    lines.push('');
  }
  if (d.topTV?.length) {
    lines.push('MOST WATCHED TV');
    for (const r of d.topTV) lines.push(`• ${r.label} — ${r.detail}`);
    lines.push('');
  }
  if (d.topUsers?.length) {
    lines.push('TOP VIEWERS');
    for (const r of d.topUsers) lines.push(`• ${r.label} — ${r.detail}`);
    lines.push('');
  }
  if (d.movies.length) {
    lines.push(`NEW MOVIES (${d.movies.length})`);
    for (const m of d.movies) lines.push(`• ${m.title}${m.year ? ` (${m.year})` : ''}`);
    lines.push('');
  }
  if (d.shows.length) {
    const epCount = d.shows.reduce((n, s) => n + s.episodes.length, 0);
    lines.push(`NEW TV (${epCount})`);
    for (const s of d.shows) {
      lines.push(`• ${s.title}`);
      for (const e of s.episodes) lines.push(`    ${e.label} — ${e.title}`);
    }
    lines.push('');
  }
  if (d.music.length) {
    lines.push(`NEW MUSIC (${d.music.length})`);
    for (const m of d.music) lines.push(`• ${m.title}${m.subtitle ? ` — ${m.subtitle}` : ''}`);
    lines.push('');
  }
  return lines.join('\n');
}
