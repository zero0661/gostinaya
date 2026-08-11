import { readFile } from 'node:fs/promises';
import crypto from 'node:crypto';
import GhostApiService from '../services/GhostApiService.js';
import GhostWebhookService from '../services/GhostWebhookService.js';

const args = process.argv.slice(2);
const pairsFile = args[args.indexOf('--pairs-file') + 1];
const apply = args.includes('--apply');
if (!pairsFile || !args.includes('--pairs-file')) throw new Error('Usage: node scripts/sync-article-discussion-pairs.js --pairs-file /path/pairs.json [--apply]');

const parsed = JSON.parse(await readFile(pairsFile, 'utf8'));
if (!Array.isArray(parsed.pairs) || !parsed.pairs.length) throw new Error('pairs.json must contain a non-empty pairs array');
const seen = new Set();

for (const [index, pair] of parsed.pairs.entries()) {
  if (!pair.ruUrl || !pair.enUrl) throw new Error(`Pair ${index + 1} must contain ruUrl and enUrl`);
  for (const url of [pair.ruUrl, pair.enUrl]) {
    if (seen.has(url)) throw new Error(`URL is repeated in input: ${url}`);
    seen.add(url);
  }
  const [ru, en] = await Promise.all([GhostApiService.getPostByUrl(pair.ruUrl), GhostApiService.getPostByUrl(pair.enUrl)]);
  if (!ru || !en) throw new Error(`Pair ${index + 1}: Ghost post was not found for one of the exact URLs`);
  const existing = [...(ru.tags || []), ...(en.tags || [])].map(tag => tag.name).filter(name => /^#discussion-/i.test(name));
  const tag = existing[0] || `#discussion-${crypto.createHash('sha256').update(`${pair.ruUrl}\n${pair.enUrl}`).digest('hex').slice(0, 16)}`;
  if (new Set(existing).size > 1) throw new Error(`Pair ${index + 1}: conflicting discussion tags: ${[...new Set(existing)].join(', ')}`);
  console.log(`${apply ? 'APPLY' : 'PREVIEW'} ${tag}\n  RU ${pair.ruUrl}\n  EN ${pair.enUrl}`);
  if (!apply) continue;
  const [updatedRu, updatedEn] = await Promise.all([GhostApiService.addDiscussionTag(ru, tag), GhostApiService.addDiscussionTag(en, tag)]);
  const result = await GhostWebhookService.handlePost({ post: { current: updatedRu } });
  console.log(`  discussion topic ${result.topicId}${result.merged ? ' (merged)' : ''}`);
  // The second call verifies the idempotent post.updated path as well.
  await GhostWebhookService.handlePost({ post: { current: updatedEn } });
}
