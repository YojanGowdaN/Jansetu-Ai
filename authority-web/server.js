const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3002;
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5000';

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health Check for Render
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ONLINE', service: 'JanSetu Authority Portal' });
});

// Proxy /api requests to external backend if running as separate service
app.use('/api', async (req, res) => {
  try {
    const targetUrl = `${BACKEND_URL}/api${req.url}`;
    const options = {
      method: req.method,
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Content-Type': req.headers['content-type'] || 'application/json'
      }
    };
    if (req.headers.authorization) {
      options.headers.authorization = req.headers.authorization;
    }
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && req.body && Object.keys(req.body).length > 0) {
      options.body = JSON.stringify(req.body);
    }
    const backendRes = await fetch(targetUrl, options);
    const responseData = await backendRes.text();
    res.status(backendRes.status).send(responseData);
  } catch (e) {
    res.status(502).json({ error: 'Could not reach JanSetu Backend API', message: e.message });
  }
});

app.use(express.static(path.join(__dirname, 'public')));

// Default route serves login page
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/login', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/dashboard', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`  JanSetu Authority Platform running on http://localhost:${PORT}`);
});
