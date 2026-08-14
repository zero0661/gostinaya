import { isModerator } from '../services/ModerationPolicy.js';

export default function requireModerator(req, res, next) {
  if (!req.session?.guest?.id) {
    return res.redirect('/gostinaya/login');
  }

  if (!isModerator(req.session.guest.role)) {
    return res.status(403).send(
      'Доступ только для модераторов / Moderators only'
    );
  }

  return next();
}
