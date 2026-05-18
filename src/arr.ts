import { request } from 'undici';

export class ArrError extends Error {}

interface ArrImage {
  coverType: string;
  url?: string;
  remoteUrl?: string;
}

export interface UpcomingMovie {
  id: number;
  title: string;
  year?: number;
  overview?: string;
  /** ISO date — the chosen release event within the window. */
  releaseDate: string;
  releaseType: 'digital' | 'physical' | 'cinemas';
  posterRemoteUrl?: string;
}

export interface UpcomingEpisode {
  seriesId: number;
  seriesTitle: string;
  episodeTitle: string;
  seasonNumber: number;
  episodeNumber: number;
  airDateUtc: string;
  overview?: string;
  posterRemoteUrl?: string;
}

abstract class ArrClient {
  constructor(protected baseUrl: string, protected apiKey: string) {
    if (!baseUrl) throw new ArrError('URL is not configured');
    if (!apiKey) throw new ArrError('API key is not configured');
  }

  protected apiUrl(path: string, params: Record<string, string | number | boolean> = {}): string {
    const base = this.baseUrl.replace(/\/+$/, '');
    const url = new URL(base + '/api/v3' + path);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
    return url.toString();
  }

  protected async call<T>(path: string, params: Record<string, string | number | boolean> = {}): Promise<T> {
    const url = this.apiUrl(path, params);
    const res = await request(url, {
      method: 'GET',
      headers: { 'X-Api-Key': this.apiKey, Accept: 'application/json' },
      headersTimeout: 15_000,
      bodyTimeout: 30_000
    });
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw new ArrError(`HTTP ${res.statusCode}`);
    }
    return (await res.body.json()) as T;
  }

  async ping(): Promise<void> {
    await this.call('/system/status');
  }
}

export class RadarrClient extends ArrClient {
  async getUpcoming(startISO: string, endISO: string): Promise<UpcomingMovie[]> {
    const data = await this.call<any[]>('/calendar', {
      start: startISO,
      end: endISO,
      unmonitored: 'false'
    });
    const startMs = Date.parse(startISO);
    const endMs = Date.parse(endISO);
    const out: UpcomingMovie[] = [];
    for (const m of data || []) {
      // Movies have up to three release dates — pick the earliest one that
      // falls inside the window. Digital wins ties since that's when it
      // typically shows up on a Plex server.
      const candidates: { date: string; type: UpcomingMovie['releaseType']; rank: number }[] = [];
      if (m.digitalRelease) candidates.push({ date: m.digitalRelease, type: 'digital', rank: 0 });
      if (m.physicalRelease) candidates.push({ date: m.physicalRelease, type: 'physical', rank: 1 });
      if (m.inCinemas) candidates.push({ date: m.inCinemas, type: 'cinemas', rank: 2 });

      const valid = candidates.filter((c) => {
        const ms = Date.parse(c.date);
        return Number.isFinite(ms) && ms >= startMs && ms <= endMs;
      });
      if (valid.length === 0) continue;
      valid.sort((a, b) => Date.parse(a.date) - Date.parse(b.date) || a.rank - b.rank);
      const pick = valid[0];

      const poster = (m.images || []).find((i: ArrImage) => i.coverType === 'poster') as ArrImage | undefined;
      out.push({
        id: m.id,
        title: m.title,
        year: m.year,
        overview: m.overview,
        releaseDate: pick.date,
        releaseType: pick.type,
        posterRemoteUrl: poster?.remoteUrl
      });
    }
    out.sort((a, b) => Date.parse(a.releaseDate) - Date.parse(b.releaseDate));
    return out;
  }
}

export class SonarrClient extends ArrClient {
  async getUpcoming(startISO: string, endISO: string): Promise<UpcomingEpisode[]> {
    const data = await this.call<any[]>('/calendar', {
      start: startISO,
      end: endISO,
      includeSeries: 'true',
      unmonitored: 'false'
    });
    const out: UpcomingEpisode[] = [];
    for (const ep of data || []) {
      const series = ep.series || {};
      const poster = (series.images || []).find((i: ArrImage) => i.coverType === 'poster') as
        | ArrImage
        | undefined;
      out.push({
        seriesId: ep.seriesId,
        seriesTitle: series.title || '',
        episodeTitle: ep.title || '',
        seasonNumber: ep.seasonNumber || 0,
        episodeNumber: ep.episodeNumber || 0,
        airDateUtc: ep.airDateUtc || '',
        overview: ep.overview,
        posterRemoteUrl: poster?.remoteUrl
      });
    }
    out.sort((a, b) => Date.parse(a.airDateUtc) - Date.parse(b.airDateUtc));
    return out;
  }
}

export async function fetchRemoteImage(
  url: string
): Promise<{ bytes: Buffer; contentType: string } | null> {
  if (!url) return null;
  try {
    const res = await request(url, { method: 'GET', headersTimeout: 15_000, bodyTimeout: 30_000 });
    if (res.statusCode < 200 || res.statusCode >= 300) return null;
    const ct = (res.headers['content-type'] as string) || 'image/jpeg';
    const buf = Buffer.from(await res.body.arrayBuffer());
    if (buf.length === 0) return null;
    return { bytes: buf, contentType: ct };
  } catch {
    return null;
  }
}
