import GuestRepository from '../repositories/GuestRepository.js';
import AuthService from '../services/AuthService.js';

class GuestController {
  async register(req, res) {
    try {

const { name, email, password } = req.body;

      if (!name || !email) {
        return res.status(400).json({
          error: 'Name and email are required'
        });
      }

      const existing = await GuestRepository.findByEmail(email);

      if (existing) {
        return res.json({
          success: true,
          guest: existing,
          message: 'Guest already exists'
        });
      }

const passwordHash = await AuthService.hashPassword(password);
const guest = await GuestRepository.create(name, email, passwordHash);

res.json({
    success: true,
    guest,
    redirect: '/gostinaya/hall'
});
    } catch (err) {
      console.error(err);

      res.status(500).json({
        error: 'Internal server error'
      });
    }
  }
}

export default new GuestController();
