import GuestRepository from '../repositories/GuestRepository.js';
import NotificationRepository from '../repositories/NotificationRepository.js';
import { sendMail } from '../utils/mailer.js';
import { NotificationService } from './NotificationServiceCore.js';

export { NotificationService } from './NotificationServiceCore.js';

export default new NotificationService({
  guests: GuestRepository,
  notifications: NotificationRepository,
  mailer: sendMail,
  logger: console
});
