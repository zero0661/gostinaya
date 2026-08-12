export default function requireGuest(req, res, next) {
    if (!req.session?.guest?.id) {
        return res.redirect('/gostinaya/login');
    }

    return next();
}
