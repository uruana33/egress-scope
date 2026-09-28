export function mapConfig(env) {
  const raw = env?.TIANDITU_TOKEN;
  const token = typeof raw === 'string' ? raw.trim() : '';
  if (!token) {
    return { provider: 'osm' };
  }
  return { provider: 'tianditu', token };
}
