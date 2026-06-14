function auth(req, res, next) {
  req.user = { id: 1, name: 'User', email: 'user@local' };
  next();
}

module.exports = auth;
