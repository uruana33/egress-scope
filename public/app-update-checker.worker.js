const pending = new Set();

async function checkBuild(message) {
  if (pending.has(message.url)) return;
  pending.add(message.url);
  try {
    const url = new URL(message.url);
    url.searchParams.set('t', Date.now().toString());
    const response = await fetch(url, {
      cache: 'no-store',
      credentials: 'same-origin',
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`Update check failed with HTTP ${response.status}`);
    const version = await response.json();
    if (typeof version.build !== 'string' || !version.build) {
      throw new Error('Invalid build version');
    }
    self.postMessage({
      type: version.build === message.build ? 'unchanged' : 'changed',
    });
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
  } finally {
    pending.delete(message.url);
  }
}

self.addEventListener('message', ({ data }) => {
  const valid =
    data?.type === 'check' && typeof data.url === 'string' && typeof data.build === 'string';
  if (valid) void checkBuild(data);
});
