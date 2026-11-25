/** Public reading owns these caches exclusively. It never stores account data. */
export async function clearReadingStorage() {
  if ('BroadcastChannel' in window) {
    const channel = new BroadcastChannel('practice-reading');
    channel.postMessage({ type: 'CLEAR' });
    channel.close();
  }
  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations().catch(() => []);
    for (const registration of registrations) {
      if (registration.active?.scriptURL.endsWith('/practice-reading/sw.js')) registration.active.postMessage({ type: 'CLEAR' });
    }
  }
  if ('caches' in window) {
    await Promise.all((await caches.keys()).filter(key => key.startsWith('practice-reading-public-')).map(key => caches.delete(key)));
  }
}
