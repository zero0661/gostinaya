import { readFile } from 'node:fs/promises';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import GhostApiService from '../services/GhostApiService.js';

function discussionTags(post) {
  return (post.tags || []).map(tag => tag.name).filter(name => /^#discussion-/i.test(name));
}

function generatedTag(pair) {
  return `#discussion-${crypto.createHash('sha256').update(`${pair.ruUrl}\n${pair.enUrl}`).digest('hex').slice(0, 16)}`;
}

export async function buildPairPlans(pairs, ghost = GhostApiService) {
  if (!Array.isArray(pairs) || !pairs.length) throw new Error('pairs.json must contain a non-empty pairs array');

  const seenUrls = new Set();
  const tagOwners = new Map();
  const plans = [];

  // Complete the read-only preflight for every pair before the first write.
  for (const [index, pair] of pairs.entries()) {
    if (!pair.ruUrl || !pair.enUrl) throw new Error(`Pair ${index + 1} must contain ruUrl and enUrl`);
    for (const url of [pair.ruUrl, pair.enUrl]) {
      if (seenUrls.has(url)) throw new Error(`URL is repeated in input: ${url}`);
      seenUrls.add(url);
    }

    const ru = await ghost.getPostByUrl(pair.ruUrl);
    const en = await ghost.getPostByUrl(pair.enUrl);
    if (!ru || !en) throw new Error(`Pair ${index + 1}: Ghost post was not found for one of the exact URLs`);

    const existing = [...discussionTags(ru), ...discussionTags(en)];
    const unique = [...new Set(existing)];
    if (unique.length > 1) throw new Error(`Pair ${index + 1}: conflicting discussion tags: ${unique.join(', ')}`);

    const tag = unique[0] || generatedTag(pair);
    const previousOwner = tagOwners.get(tag);
    if (previousOwner) throw new Error(`Discussion tag ${tag} is shared by pairs ${previousOwner} and ${index + 1}`);
    tagOwners.set(tag, index + 1);
    plans.push({ index: index + 1, pair, ru, en, tag });
  }

  return plans;
}

export async function syncPairs({ pairs, apply = false, ghost = GhostApiService, webhook = null, log = console.log }) {
  const plans = await buildPairPlans(pairs, ghost);

  for (const plan of plans) {
    log(`${apply ? 'APPLY' : 'PREVIEW'} ${plan.tag}\n  RU ${plan.pair.ruUrl}\n  EN ${plan.pair.enUrl}`);
  }
  if (!apply) return plans;
  if (!webhook) throw new Error('Webhook service is required in apply mode');

  // Writes are sequential and idempotent. A rerun resumes safely after a failure.
  for (const plan of plans) {
    const updatedRu = await ghost.addDiscussionTag(plan.ru, plan.tag);
    const updatedEn = await ghost.addDiscussionTag(plan.en, plan.tag);
    const result = await webhook.handlePost({ post: { current: updatedRu } });
    log(`  pair ${plan.index}: discussion topic ${result.topicId}${result.merged ? ' (merged)' : ''}`);
    await webhook.handlePost({ post: { current: updatedEn } });
  }

  return plans;
}

async function main() {
  const args = process.argv.slice(2);
  const pairsFlag = args.indexOf('--pairs-file');
  const pairsFile = pairsFlag >= 0 ? args[pairsFlag + 1] : null;
  const apply = args.includes('--apply');
  if (!pairsFile) throw new Error('Usage: node scripts/sync-article-discussion-pairs.js --pairs-file /path/pairs.json [--apply]');
  const parsed = JSON.parse(await readFile(pairsFile, 'utf8'));
  const webhook = apply ? (await import('../services/GhostWebhookService.js')).default : null;
  await syncPairs({ pairs: parsed.pairs, apply, webhook });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fileURLToPath(new URL(`file://${process.argv[1]}`))) {
  await main();
}
