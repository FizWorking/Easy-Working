require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));

// Serve frontend
app.use(express.static(path.join(__dirname, 'public')));

// API routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/qbo', require('./routes/qbo'));
app.use('/api/import', require('./routes/import'));

// SPA fallback
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  } else {
    res.status(404).json({ error: 'API endpoint not found' });
  }
});

app.use((err, req, res, next) => {
  const msg = process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message;
  console.error('Server error:', err.message);
  res.status(err.status || 500).json({ error: msg });
});

app.listen(PORT, () => {
  console.log(`SaasAnt Clone running at http://localhost:${PORT}`);
  console.log(`Environment: ${process.env.QBO_ENVIRONMENT || 'sandbox'}`);
  console.log(`QBO Client ID: ${process.env.QBO_CLIENT_ID ? '✓ Set' : '✗ NOT SET'}`);
  if (!process.env.QBO_CLIENT_ID || process.env.QBO_CLIENT_ID === 'your_qbo_client_id_here') {
    console.log('\n⚠  IMPORTANT: Update backend/.env with your Intuit OAuth credentials');
    console.log('   Get them at: https://developer.intuit.com → My Apps\n');
  }
});
