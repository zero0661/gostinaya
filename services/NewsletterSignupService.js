import GhostApiService from './GhostApiService.js';
import { sendNewsletterMail } from '../utils/mailer.js';
import { NewsletterSignupService } from './NewsletterSignupServiceCore.js';
import NewsletterSubscriptionTokenRepository from '../repositories/NewsletterSubscriptionTokenRepository.js';

export { NewsletterSignupService, NEWSLETTERS } from './NewsletterSignupServiceCore.js';

export default new NewsletterSignupService({
  ghost: GhostApiService,
  mailer: sendNewsletterMail,
  tokens: NewsletterSubscriptionTokenRepository,
  appUrl: process.env.APP_URL || 'https://milenin.pro'
});
