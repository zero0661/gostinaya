import GuestRepository from '../repositories/GuestRepository.js';
import { sendMail } from '../utils/mailer.js';
import { EmailVerificationService } from './EmailVerificationServiceCore.js';

export { EmailVerificationService, hashVerificationToken } from './EmailVerificationServiceCore.js';

export default new EmailVerificationService({
  guests: GuestRepository,
  mailer: sendMail,
  appUrl: process.env.APP_URL || 'https://milenin.pro'
});
