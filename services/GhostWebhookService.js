import DiscussionRepository from '../repositories/DiscussionRepository.js';
import ArticleDiscussionRepository from '../repositories/ArticleDiscussionRepository.js';
import GhostApiService from './GhostApiService.js';

const AUTHOR_ID = 2;
const DISCUSSION_TAG = /^#discussion-[a-z0-9][a-z0-9-]*$/i;

function normalizePost(payload) { return payload?.post?.current || payload?.post || null; }
function isEnglish(post) { return new URL(post.url).pathname.startsWith('/en/'); }
function languageVersion(posts) {
  const ru = posts.find(post => !isEnglish(post));
  const en = posts.find(post => isEnglish(post));
  if (!ru || !en) throw new Error('Discussion tag must belong to one RU post and one EN post');
  return {
    ghostPostIdRu: ru.id, ghostPostIdEn: en.id,
    urlRu: ru.url, urlEn: en.url,
    publishedAt: ru.published_at || en.published_at || null,
    title: ru.title || en.title
  };
}

async function selectPrimary(discussions) {
  const rows = await Promise.all(discussions.map(async discussion => ({
    discussion,
    topic: await DiscussionRepository.getTopic(discussion.topic_id)
  })));
  rows.sort((a, b) => {
    const aRu = Boolean(a.discussion.ghost_post_id_ru || a.discussion.url_ru);
    const bRu = Boolean(b.discussion.ghost_post_id_ru || b.discussion.url_ru);
    if (aRu !== bRu) return aRu ? -1 : 1;
    return String(a.topic?.created_at || '').localeCompare(String(b.topic?.created_at || '')) || Number(a.discussion.topic_id) - Number(b.discussion.topic_id);
  });
  return rows[0].discussion;
}

export default {
  async handlePost(payload) {
    const post = normalizePost(payload);
    if (!post?.id || !post?.url || !post?.title) throw new Error('Invalid Ghost post payload');

    const fullPost = await GhostApiService.getPostById(post.id);
    const tags = (fullPost?.tags || []).map(tag => tag.name).filter(name => DISCUSSION_TAG.test(name));
    if (tags.length > 1) throw new Error(`Post ${post.id} has multiple discussion tags: ${tags.join(', ')}`);

    // Untagged legacy posts retain the old one-post/one-discussion behaviour.
    if (!tags.length) {
      const existing = await ArticleDiscussionRepository.getByGhostPostId(post.id);
      if (existing) return { created: false, topicId: existing.topic_id };
      const topic = await DiscussionRepository.createTopic('articles', post.title, AUTHOR_ID);
      await ArticleDiscussionRepository.create({ topicId: topic.lastID, ...(isEnglish(post)
        ? { ghostPostIdEn: post.id, urlEn: post.url }
        : { ghostPostIdRu: post.id, urlRu: post.url }), publishedAt: post.published_at || null });
      return { created: true, topicId: topic.lastID };
    }

    const tag = tags[0];
    const relatedPosts = await GhostApiService.findPostsByDiscussionTag(tag);
    if (relatedPosts.length !== 2) {
      console.error(`Ghost discussion tag ${tag} belongs to ${relatedPosts.length} posts; expected exactly 2. No merge performed.`);
      return { created: false, skipped: true, reason: 'invalid-tag-cardinality', tag, posts: relatedPosts.length };
    }

    const version = languageVersion(relatedPosts);
    const discussions = await ArticleDiscussionRepository.getByGhostPostIds(relatedPosts.map(item => item.id));
    const uniqueDiscussions = [...new Map(discussions.map(item => [item.topic_id, item])).values()];

    if (!uniqueDiscussions.length) {
      const topic = await DiscussionRepository.createTopic('articles', version.title, AUTHOR_ID);
      await ArticleDiscussionRepository.create({ topicId: topic.lastID, ...version });
      return { created: true, linked: true, topicId: topic.lastID };
    }

    const primary = await selectPrimary(uniqueDiscussions);
    if (uniqueDiscussions.length === 1) {
      await ArticleDiscussionRepository.updateLanguageVersion(primary.topic_id, version);
      return { created: false, linked: true, topicId: primary.topic_id };
    }
    if (uniqueDiscussions.length !== 2) throw new Error(`Discussion tag ${tag} is linked to ${uniqueDiscussions.length} discussion topics`);

    const duplicate = uniqueDiscussions.find(item => Number(item.topic_id) !== Number(primary.topic_id));
    const result = await ArticleDiscussionRepository.mergeTopics({
      primaryTopicId: primary.topic_id, duplicateTopicId: duplicate.topic_id, languageVersion: version
    });
    return { created: false, linked: true, merged: result.merged, topicId: result.topicId };
  },
  handlePublishedPost(payload) { return this.handlePost(payload); }
};
