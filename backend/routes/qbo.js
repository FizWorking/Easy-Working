const express = require('express');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const store = require('../config/store');
const auth = require('../middleware/auth');

const router = express.Router();

router.get('/auth-url', auth, (req, res) => {
  const state = jwt.sign({ userId: req.user.id }, process.env.JWT_SECRET, { expiresIn: '10m' });
  const params = new URLSearchParams({
    client_id: process.env.QBO_CLIENT_ID,
    redirect_uri: process.env.QBO_REDIRECT_URI,
    response_type: 'code',
    scope: 'com.intuit.quickbooks.accounting',
    state
  });
  res.json({ authUrl: `https://appcenter.intuit.com/app/connect/oauth2?${params}`, state });
});

router.get('/callback', async (req, res) => {
  const { code, state, realmId } = req.query;
  if (!code || !state || !realmId) {
    return res.redirect('/#!/dashboard?error=Invalid OAuth response');
  }

  try {
    const decoded = jwt.verify(state, process.env.JWT_SECRET);
    const userId = decoded.userId;

    const params = new URLSearchParams();
    params.append('grant_type', 'authorization_code');
    params.append('code', code);
    params.append('redirect_uri', process.env.QBO_REDIRECT_URI);

    const tokenRes = await axios({
      method: 'post',
      url: 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
      auth: { username: process.env.QBO_CLIENT_ID, password: process.env.QBO_CLIENT_SECRET },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      data: params.toString()
    });

    const { access_token, refresh_token } = tokenRes.data;

    let companyName = 'QuickBooks Company';
    try {
      const infoRes = await axios({
        method: 'get',
        url: `https://quickbooks.api.intuit.com/v3/company/${realmId}/companyinfo/${realmId}`,
        headers: { Authorization: `Bearer ${access_token}`, Accept: 'application/json' }
      });
      companyName = infoRes.data.CompanyInfo.CompanyName || companyName;
    } catch (_) { }

    const existing = store.get('qbo_connections', { user_id: userId, company_id: realmId });
    if (existing) {
      store.update('qbo_connections', { id: existing.id }, {
        access_token, refresh_token, company_name: companyName
      });
    } else {
      store.insert('qbo_connections', {
        user_id: userId, company_id: realmId, company_name: companyName,
        access_token, refresh_token, realm_id: realmId
      });
    }

    res.redirect('/#!/dashboard?qbo=connected');
  } catch (err) {
    console.error('OAuth error:', err.message);
    res.redirect('/#!/dashboard?error=oauth_failed');
  }
});

router.get('/connections', auth, (req, res) => {
  const connections = store.all('qbo_connections', { user_id: req.user.id })
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .map(c => ({ id: c.id, company_id: c.company_id, company_name: c.company_name, connected_at: c.created_at }));
  res.json(connections);
});

router.delete('/connections/:id', auth, (req, res) => {
  const result = store.delete('qbo_connections', { id: parseInt(req.params.id), user_id: req.user.id });
  if (result.changes === 0) return res.status(404).json({ error: 'Connection not found' });
  res.json({ message: 'Disconnected' });
});

module.exports = router;
