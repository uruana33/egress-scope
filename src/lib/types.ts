export interface Geo {
  ip: string;
  asn?: number | string;
  isp?: string;
  country?: string;
  country_code?: string;
  region?: string;
  city?: string;
  longitude?: number;
  latitude?: number;
  timezone?: string;
  source?: string;
}

export interface Lookup {
  geo: Geo;
  sources: Geo[];
  risk: Risk;
  rdap?: Record<string, unknown>;
}

export interface RtcResult {
  ip: string;
  type: string;
  public: boolean;
  candidateType?: 'host' | 'srflx' | 'prflx' | 'relay';
  endpoint?: string;
  port?: number;
  protocol?: string;
  relatedAddress?: string;
  geo?: Geo;
  raw?: string;
}

export interface Risk {
  /** undefined means the provider returned no risk fields to evaluate. */
  available: boolean | undefined;
  vpn?: boolean;
  proxy?: boolean;
  tor?: boolean;
  bot_status?: boolean;
  recent_abuse?: boolean;
  fraud_score?: number;
  connection_type?: string;
  reason?: string;
  source?: string;
}
