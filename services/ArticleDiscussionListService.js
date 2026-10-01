import repository from '../repositories/ArticleDiscussionRepository.js';
import synchronizer from './GhostWebhookService.js';
import { createArticleDiscussionListService } from './ArticleDiscussionListServiceCore.js';

export default createArticleDiscussionListService({ repository, synchronizer });
