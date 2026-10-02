import Translation from './DiscussionTranslationService.js';
import { NewsPublicationService } from './NewsPublicationServiceCore.js';

export default new NewsPublicationService({
  detectLanguage: Translation.detectLanguage,
  translate: (text, language) => Translation.translateText(text, language)
});
