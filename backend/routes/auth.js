const express = require('express');
const router = express.Router();

router.post('/register', (req, res) => {
  res.json({ token: 'no-auth-required', user: { id: 1, name: 'User', email: 'user@local' } });
});

router.post('/login', (req, res) => {
  res.json({ token: 'no-auth-required', user: { id: 1, name: 'User', email: 'user@local' } });
});

module.exports = router;
