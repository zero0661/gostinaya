import GhostApiService from './GhostApiService.js';
import NewsletterDeliveryRepository from '../repositories/NewsletterDeliveryRepository.js';
import { sendNewsletterMail } from '../utils/mailer.js';
import { NewsletterDeliveryService } from './NewsletterDeliveryServiceCore.js';
import NewsletterSignupService from './NewsletterSignupService.js';

export { NewsletterDeliveryService, CHANNELS } from './NewsletterDeliveryServiceCore.js';

export default new NewsletterDeliveryService({
  ghost: GhostApiService,
  deliveries: NewsletterDeliveryRepository,
  mailer: sendNewsletterMail,
  unsubscribeUrl: details => NewsletterSignupService.createUnsubscribeUrl(details),
  logger: console
});
