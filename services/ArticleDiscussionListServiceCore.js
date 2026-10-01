// Repair partial language pairs when their webhook was missed. Never guess pairs.
export function createArticleDiscussionListService({ repository, synchronizer, now = Date.now, cooldownMs = 60000, log = console.error }) {
  const attempted = new Map();
  let inFlight = null;

  async function repairAndList() {
    const rows = await repository.list();
    for (const row of rows) {
      if (row.ghost_post_id_ru && row.ghost_post_id_en && row.url_ru && row.url_en) continue;
      const postId = row.ghost_post_id_ru || row.ghost_post_id_en;
      if (!postId) continue;
      const last = attempted.get(postId);
      if (last !== undefined && now() - last < cooldownMs) continue;
      attempted.set(postId, now());
      try {
        await synchronizer.syncPostById(postId);
      } catch (error) {
        log('Could not repair article language pair:', postId, error.message);
      }
    }
    // Merges can remove duplicate topics; don't render the stale pre-repair rows.
    return repository.list();
  }

  return {
    list() {
      if (!inFlight) {
        inFlight = repairAndList().finally(() => { inFlight = null; });
      }
      return inFlight;
    }
  };
}
