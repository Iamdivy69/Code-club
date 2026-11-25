const CACHE = 'practice-reading-public-v1';
const PREFIX = 'practice-reading-public-';
const status = document.querySelector('#status');
const saved = document.querySelector('#saved');
const article = document.querySelector('#problem');
const validSlug = value => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 200;
let activeSlug = '';
let loading = false;
let renderEpoch = 0;
function element(tag, text) {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
}
function render(problem) {
  article.replaceChildren(element('h1', problem.title), element('p', problem.topic + ' · ' + problem.difficulty),
    element('p', problem.description), element('h2', 'Examples'));
  for (const example of problem.examples) {
    article.append(element('h3', 'Example ' + (example.index + 1)), element('p', 'Input'), element('pre', example.input), element('p', 'Output'), element('pre', example.output));
  }
  article.append(element('h2', 'Constraints'));
  const list = document.createElement('ul');
  for (const line of problem.constraints) list.append(element('li', line));
  article.append(list);
  for (const [index, hint] of problem.hints.entries()) {
    const details = document.createElement('details');
    details.append(element('summary', 'Hint ' + (index + 1)), element('p', hint));
    article.append(details);
  }
  if (problem.editorial) {
    const details = document.createElement('details');
    details.append(element('summary', 'Editorial'), element('p', problem.editorial));
    article.append(details);
  }
  if (problem.executionPending) article.append(element('p', 'Read & edit · Code execution is not available for this problem yet.'));
  const link = element('a', 'Open editor when connected');
  link.href = '/practice/solve/' + encodeURIComponent(problem.slug);
  article.append(link);
  article.hidden = false;
}
async function updateSaved() {
  const cache = await caches.open(CACHE);
  const options = [new Option('Choose a problem', '')];
  for (const request of await cache.keys()) {
    const response = await cache.match(request);
    try {
      const { problem } = await response.json();
      options.push(new Option(problem.title, problem.slug));
    } catch { await cache.delete(request); }
  }
  saved.replaceChildren(...options);
  saved.value = activeSlug;
}
async function load(slug) {
  if (!validSlug(slug) || loading) return;
  loading = true;
  const generation = ++renderEpoch;
  activeSlug = slug;
  status.textContent = 'Loading public reading material…';
  try {
    const response = await fetch('/api/practice/reading/' + encodeURIComponent(slug), { credentials: 'omit', cache: 'no-store' });
    const data = await response.json();
    if (generation !== renderEpoch) return;
    if (!response.ok) {
      article.hidden = true;
      article.replaceChildren();
      status.textContent = data.message || 'Public reading material is unavailable.';
    } else {
      render(data.problem);
      status.textContent = response.headers.get('X-CodeClub-Offline') === '1'
        ? 'Offline · Reading the saved public version. Reconnect to check for updates.'
        : 'Saved on this device · Public version ' + data.problem.contentVersion + '.';
    }
    await updateSaved();
  } catch { if (generation === renderEpoch) status.textContent = 'Could not load this problem. Check your connection and retry.'; }
  finally { loading = false; }
}
async function refreshSaved() {
  const selected = activeSlug;
  const cache = await caches.open(CACHE);
  let removed = 0;
  for (const request of await cache.keys()) {
    try {
      const response = await fetch(request.url, { credentials: 'omit', cache: 'no-store' });
      if ([403, 404, 410].includes(response.status)) {
        removed++;
        if (new URL(request.url).pathname.endsWith('/' + selected)) {
          renderEpoch++;
          article.hidden = true;
          article.replaceChildren();
          activeSlug = '';
        }
      }
    } catch { /* A failed connection does not establish that content was withdrawn. */ }
  }
  await updateSaved();
  if (removed) status.textContent = 'Removed ' + removed + ' unavailable saved problem(s).';
  else if (selected) await load(selected);
  else status.textContent = navigator.onLine ? 'Saved public material checked.' : 'Offline · Choose previously saved material.';
}
async function clearAll() {
  renderEpoch++;
  activeSlug = '';
  article.hidden = true;
  article.replaceChildren();
  saved.replaceChildren(new Option('Choose a problem', ''));
  navigator.serviceWorker.controller?.postMessage({ type: 'CLEAR' });
  await Promise.all((await caches.keys()).filter(key => key.startsWith(PREFIX)).map(key => caches.delete(key)));
  status.textContent = 'Saved reading material cleared.';
}
saved.addEventListener('change', () => void load(saved.value));
document.querySelector('#refresh').addEventListener('click', () => void refreshSaved());
document.querySelector('#remove').addEventListener('click', async () => {
  renderEpoch++;
  if (activeSlug) await (await caches.open(CACHE)).delete('/api/practice/reading/' + encodeURIComponent(activeSlug));
  activeSlug = '';
  article.hidden = true;
  article.replaceChildren();
  await updateSaved();
  status.textContent = 'Saved copy removed.';
});
document.querySelector('#clear').addEventListener('click', () => void clearAll());
window.addEventListener('online', () => void refreshSaved());
if ('BroadcastChannel' in window) {
  const channel = new BroadcastChannel('practice-reading');
  channel.onmessage = event => { if (event.data?.type === 'CLEAR') void clearAll(); };
}
(async () => {
  if (!('serviceWorker' in navigator) || !('caches' in window)) {
    status.textContent = 'Offline reading requires a supported browser on HTTPS or localhost.';
    return;
  }
  try {
    await navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' });
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Reader initialization timed out.')), 7000);
        navigator.serviceWorker.addEventListener('controllerchange', () => { clearTimeout(timer); resolve(); }, { once: true });
        if (navigator.serviceWorker.controller) { clearTimeout(timer); resolve(); }
      });
    }
    await refreshSaved();
    const slug = new URLSearchParams(location.search).get('slug');
    if (slug && validSlug(slug)) await load(slug);
  } catch { status.textContent = 'Could not prepare offline reading. Reload while connected to try again.'; }
})();


// Discovery always requires the network. Only selected public payloads are cached.
const browse = document.querySelector('#browse');
browse.addEventListener('change', () => { if (browse.value) { history.replaceState(null, '', '?slug=' + encodeURIComponent(browse.value)); void load(browse.value); } });
async function refreshIndex() {
  try {
    const response = await fetch('/api/practice/reading-index', { credentials: 'omit', cache: 'no-store' });
    if (!response.ok) throw new Error('Unavailable');
    const { problems } = await response.json();
    browse.replaceChildren(new Option('Choose a published problem', ''), ...problems.map(problem => new Option(problem.title + ' · ' + problem.topic + ' · ' + problem.difficulty, problem.slug)));
  } catch { browse.replaceChildren(new Option('Reconnect to browse public problems', '')); }
}
window.addEventListener('online', () => void refreshIndex());
void refreshIndex();
