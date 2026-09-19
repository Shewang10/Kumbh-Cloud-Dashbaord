// Cloudflare Worker Environment Types

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  TRACKER_SECRET?: string;
  DEFAULT_VEHICLE_ID?: string;
  ROUTE_DEVIATION_THRESHOLD_METERS?: string;
  STALE_AFTER_SECONDS?: string;
  DELAYED_AFTER_SECONDS?: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data: T | null;
  error: {
    code: string;
    message: string;
  } | null;
}

