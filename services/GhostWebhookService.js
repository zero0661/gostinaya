import DiscussionRepository from '../repositories/DiscussionRepository.js';
import ArticleDiscussionRepository from '../repositories/ArticleDiscussionRepository.js';
import GhostApiService from './GhostApiService.js';

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

    const fullPost = await GhostApiService.getPostById(post.id);
    const discussionTag = (fullPost?.tags || []).find(tag =>
      tag.name?.startsWith('#discussion-')
    );

    const isEnglish = new URL(post.url).pathname.startsWith('/en/');

    if (discussionTag) {
      const relatedPosts =
        await GhostApiService.findPostsByDiscussionTag(discussionTag.name);

      for (const relatedPost of relatedPosts) {
        if (relatedPost.id === post.id) continue;

        const relatedDiscussion =
          await ArticleDiscussionRepository.getByGhostPostId(relatedPost.id);

        if (!relatedDiscussion) continue;

        await ArticleDiscussionRepository.updateLanguageVersion(
          relatedDiscussion.topic_id,
          {
            ghostPostIdRu: isEnglish ? null : post.id,
            ghostPostIdEn: isEnglish ? post.id : null,
            urlRu: isEnglish ? null : post.url,
            urlEn: isEnglish ? post.url : null,
            publishedAt: post.published_at || null
          }
        );

        return {
          created: false,
          linked: true,
          topicId: relatedDiscussion.topic_id
        };
      }
    }

    const topicResult = await DiscussionRepository.createTopic(
      'articles',
      post.title,
      AUTHOR_ID
    );

    const topicId = topicResult.lastID;

    await ArticleDiscussionRepository.create({
      topicId,
      ghostPostIdRu: isEnglish ? null : post.id,
      ghostPostIdEn: isEnglish ? post.id : null,
      urlRu: isEnglish ? null : post.url,
      urlEn: isEnglish ? post.url : null,
      publishedAt: post.published_at || null
    });

    return {
      created: true,
      topicId
    };
  }
};
