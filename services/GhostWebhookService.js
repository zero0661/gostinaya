import DiscussionRepository from '../repositories/DiscussionRepository.js';
import ArticleDiscussionRepository from '../repositories/ArticleDiscussionRepository.js';

const AUTHOR_ID = 2;

function normalizePost(payload) {
  return payload?.post?.current || payload?.post || null;
}

export default {
  async handlePublishedPost(payload) {
    const post = normalizePost(payload);

    if (!post?.id || !post?.url || !post?.title) {
      throw new Error('Invalid Ghost post payload');
    }

    const existing = await ArticleDiscussionRepository.getByGhostPostId(post.id);

    if (existing) {
      return {
        created: false,
        topicId: existing.topic_id
      };
    }

    const topicResult = await DiscussionRepository.createTopic(
      'articles',
      post.title,
      AUTHOR_ID
    );

    const topicId = topicResult.lastID;

    await ArticleDiscussionRepository.create({
      topicId,
      ghostPostIdRu: post.id,
      urlRu: post.url,
      publishedAt: post.published_at || null
    });

    return {
      created: true,
      topicId
    };
  }
};
