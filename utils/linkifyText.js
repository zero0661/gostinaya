const URL_PATTERN = /https?:\/\/[^\s<>"']+/giu;
const TRAILING_PUNCTUATION = /[.,!?;:)\]}>»”]+$/u;

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function linkifyText(value) {
  const text = String(value ?? '');
  let html = '';
  let cursor = 0;

  for (const match of text.matchAll(URL_PATTERN)) {
    const rawUrl = match[0];
    const trailing = rawUrl.match(TRAILING_PUNCTUATION)?.[0] || '';
    const url = trailing ? rawUrl.slice(0, -trailing.length) : rawUrl;

    html += escapeHtml(text.slice(cursor, match.index));
    html += `<a class="message-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer nofollow">${escapeHtml(url)}</a>`;
    html += escapeHtml(trailing);
    cursor = Number(match.index) + rawUrl.length;
  }

  return html + escapeHtml(text.slice(cursor));
}
