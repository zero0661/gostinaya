import GuestRepository from '../repositories/GuestRepository.js';
import { sendMail } from '../utils/mailer.js';
import AuthService from './AuthService.js';
import { PasswordResetService } from './PasswordResetServiceCore.js';

export { PasswordResetService, hashPasswordResetToken } from './PasswordResetServiceCore.js';

export default new PasswordResetService({
  guests: GuestRepository,
  auth: AuthService,
  mailer: sendMail,
  appUrl: process.env.APP_URL || 'https://milenin.pro'
});
