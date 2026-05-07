export interface Settings {
  // Tautulli
  tautulli_url: string;
  tautulli_api_key: string;

  // SMTP
  smtp_host: string;
  smtp_port: number;
  smtp_secure: number; // 0/1
  smtp_user: string;
  smtp_pass: string;
  smtp_from_name: string;
  smtp_from_email: string;

  // Branding
  brand_name: string;
  brand_accent: string;       // hex color like #e5a00d (Plex orange-ish)
  brand_logo_path: string;    // relative path under DATA_DIR/uploads, or ""
  brand_header_html: string;  // optional html shown under the logo
  brand_footer_html: string;  // optional html shown at the bottom

  // Content
  recently_added_count: number;
  include_movies: number;
  include_tv: number;
  include_music: number;
  show_summaries: number;

  enable_top_watched: number;
  enable_top_users: number;
  enable_stats: number;
  stats_window_days: number;

  // Scheduling
  schedule_cron: string;      // e.g. "0 9 * * 0" for Sundays 9am
  schedule_enabled: number;
  newsletter_subject: string; // can include {{date}}
}

export interface Recipient {
  id: number;
  email: string;
  name: string;
  active: number;
  created_at: string;
}

export interface SendLog {
  id: number;
  sent_at: string;
  recipient_count: number;
  status: 'success' | 'partial' | 'failed';
  message: string;
  duration_ms: number;
}

export interface RecentlyAddedItem {
  rating_key: string;
  parent_rating_key?: string;
  grandparent_rating_key?: string;
  title: string;
  parent_title?: string;
  grandparent_title?: string;
  year?: string;
  summary?: string;
  thumb?: string;
  parent_thumb?: string;
  grandparent_thumb?: string;
  art?: string;
  media_type: string; // "movie" | "show" | "season" | "episode" | "album" | "track"
  library_name?: string;
  added_at?: string;
  originally_available_at?: string;
  content_rating?: string;
  rating?: string;
  audience_rating?: string;
  duration?: string;
  video_resolution?: string;
}

export interface HomeStatRow {
  title?: string;
  rating_key?: string;
  thumb?: string;
  art?: string;
  user?: string;
  user_id?: number;
  user_thumb?: string;
  total_plays?: number;
  total_duration?: number;
  last_play?: number;
}

export interface HomeStat {
  stat_id: string;     // e.g. "top_movies", "top_tv", "top_users"
  stat_title?: string;
  rows: HomeStatRow[];
}

export interface ComposedNewsletter {
  subject: string;
  html: string;
  text: string;
  attachments: { filename: string; cid: string; content: Buffer; contentType: string }[];
}
