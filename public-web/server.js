const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

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

app.get('/track', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'track.html'));
});

app.listen(PORT, () => {
  console.log(`  JanSetu Public Portal running on http://localhost:${PORT}`);
});
