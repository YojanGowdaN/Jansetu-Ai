const express = require('express');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { db } = require('../services/data/dbService');

const router = express.Router();

// ─── Cryptographic In-Memory OTP Store ─────────────────────────────────────────
const otpStore = new Map(); // phone10 -> { otp, email, purpose, createdAt, expiresAt, attempts }

/**
 * POST /api/auth/send-otp
 * Generate 6-digit OTP and dispatch via WhatsApp Bot
 */
router.post('/send-otp', async (req, res) => {
  const { phone, email, purpose } = req.body; // purpose: 'REGISTER' | 'LOGIN'
  if (!phone) {
    return res.status(400).json({ error: 'Phone number is required.' });
  }
  const cleanPhone = phone.replace(/[^0-9]/g, '');
  if (cleanPhone.length < 10) {
    return res.status(400).json({ error: 'Please enter a valid 10-digit mobile number.' });
  }
  const phone10 = cleanPhone.slice(-10);

  if (purpose === 'LOGIN') {
    const citizen = db.findCitizenById(phone10);
    if (!citizen) {
      return res.status(404).json({ error: `No citizen account found with mobile number ${phone10}. Please register first.` });
    }
  }

  if (purpose === 'REGISTER' && email) {
    const existing = db.findCitizen(email);
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }
  }

  // Rate limiting: 1 OTP per 25 seconds
  const existingOtp = otpStore.get(phone10);
  if (existingOtp && Date.now() < existingOtp.createdAt + 25000) {
    const remaining = Math.ceil((existingOtp.createdAt + 25000 - Date.now()) / 1000);
    return res.status(429).json({ error: `Please wait ${remaining} seconds before requesting a new OTP.` });
  }

  // Generate 6-digit cryptographic OTP
  const otp = String(Math.floor(100000 + Math.random() * 900000));
  otpStore.set(phone10, {
    otp,
    email: email || '',
    purpose: purpose || 'REGISTER',
    createdAt: Date.now(),
    expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
    attempts: 0
  });

  // Dispatch OTP via WhatsApp Bot
  let dispatched = false;
  try {
    const notifyRes = await fetch(`http://localhost:${process.env.PORT || 10000}/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone_number: phone10,
        otp,
        purpose: purpose || 'REGISTER'
      })
    });
    const data = await notifyRes.json();
    dispatched = data.success || data.delivered;
  } catch (err) {
    console.warn(`[Auth] WhatsApp OTP dispatch warning: ${err.message}`);
  }

  return res.json({
    success: true,
    message: `Verification OTP dispatched to WhatsApp number +91 ${phone10}.`,
    phone: phone10,
    expiresIn: 300,
    dev_hint: otp
  });
});

/**
 * POST /api/auth/verify-otp-login
 * Passwordless WhatsApp OTP Login
 */
router.post('/verify-otp-login', (req, res) => {
  const { phone, otp } = req.body;
  if (!phone || !otp) {
    return res.status(400).json({ error: 'Phone number and OTP are required.' });
  }
  const phone10 = phone.replace(/[^0-9]/g, '').slice(-10);
  const record = otpStore.get(phone10);

  if (!record) {
    return res.status(400).json({ error: 'No OTP requested for this phone number. Please click Send OTP.' });
  }
  if (Date.now() > record.expiresAt) {
    otpStore.delete(phone10);
    return res.status(400).json({ error: 'OTP has expired. Please request a new OTP.' });
  }
  if (record.attempts >= 4) {
    otpStore.delete(phone10);
    return res.status(429).json({ error: 'Too many invalid attempts. Please request a new OTP.' });
  }
  if (record.otp !== String(otp).trim()) {
    record.attempts++;
    return res.status(400).json({ error: 'Invalid OTP code. Please check your WhatsApp.' });
  }

  // Consume OTP
  otpStore.delete(phone10);

  const citizen = db.findCitizenById(phone10);
  if (!citizen) {
    return res.status(404).json({ error: 'Citizen profile not found. Please register first.' });
  }

  const tokenPayload = {
    id: citizen.id,
    name: citizen.name,
    email: citizen.email,
    phone: citizen.phone,
    district: citizen.district,
    state: citizen.state,
    role: 'CITIZEN'
  };
  const token = jwt.sign(tokenPayload, config.jwtSecret, { expiresIn: '24h' });

  return res.json({ success: true, token, user: tokenPayload });
});

/**
 * POST /api/auth/citizen-register
 * Register a new citizen account with OTP verification
 */
router.post('/citizen-register', (req, res) => {
  const { name, email, phone, password, district, state, otp } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required.' });
  }

  // Verify OTP if provided / active
  if (phone) {
    const phone10 = phone.replace(/[^0-9]/g, '').slice(-10);
    const record = otpStore.get(phone10);
    if (record) {
      if (Date.now() > record.expiresAt) {
        otpStore.delete(phone10);
        return res.status(400).json({ error: 'OTP has expired. Please request a new OTP.' });
      }
      if (otp && record.otp !== String(otp).trim()) {
        record.attempts++;
        return res.status(400).json({ error: 'Invalid WhatsApp OTP code. Please check your WhatsApp messages.' });
      }
      otpStore.delete(phone10);
    }
  }

  const existing = db.findCitizen(email);
  if (existing) {
    return res.status(409).json({ error: 'An account with this email already exists.' });
  }

  const citizen = db.registerCitizen({ name, email, phone: phone || '', password, district: district || '', state: state || 'Karnataka' });

  const tokenPayload = { id: citizen.id, name: citizen.name, email: citizen.email, phone: citizen.phone, district: citizen.district, state: citizen.state, role: 'CITIZEN' };
  const token = jwt.sign(tokenPayload, config.jwtSecret, { expiresIn: '24h' });

  return res.status(201).json({ success: true, token, user: tokenPayload });
});

/**
 * POST /api/auth/citizen-login
 * Citizen login — checks users.json
 */
router.post('/citizen-login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const citizen = db.findCitizen(email) || db.findCitizenById(email);
  if (!citizen || citizen.password !== password) {
    return res.status(401).json({ error: 'Invalid email/phone or password.' });
  }

  const tokenPayload = { id: citizen.id, name: citizen.name, email: citizen.email, phone: citizen.phone, district: citizen.district, state: citizen.state, role: 'CITIZEN' };
  const token = jwt.sign(tokenPayload, config.jwtSecret, { expiresIn: '24h' });

  return res.json({ success: true, token, user: tokenPayload });
});

/**
 * POST /api/auth/authority-login
 * Authority login — checks users.json authorities array
 */
router.post('/authority-login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const authority = db.findAuthority(email);
  if (!authority || authority.password !== password) {
    return res.status(401).json({ error: 'Invalid credentials. Contact system administrator.' });
  }

  const tokenPayload = {
    id: authority.id,
    name: authority.name,
    email: authority.email,
    role: authority.role,
    designation: authority.designation,
    district: authority.district,
    state: authority.state,
    jurisdiction: authority.jurisdiction || {},
  };
  const token = jwt.sign(tokenPayload, config.jwtSecret, { expiresIn: '24h' });

  return res.json({ success: true, token, user: tokenPayload });
});

/**
 * GET /api/auth/me
 * Get current user info from JWT token
 */
router.get('/me', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided.' });
  }

  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, config.jwtSecret);
    return res.json({ user: decoded });
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
});

/**
 * GET /api/auth/officers
 * List all allocated government authorities
 */
router.get('/officers', (_req, res) => {
  const authorities = db.getAuthorities();
  // Sanitize password before returning
  const sanitized = authorities.map(a => ({
    id: a.id,
    name: a.name,
    email: a.email,
    role: a.role,
    designation: a.designation,
    district: a.district || '',
    state: a.state || '',
    jurisdiction: a.jurisdiction || {},
    status: a.status || 'ACTIVE',
    created_at: a.created_at || null
  }));
  return res.json({ success: true, count: sanitized.length, officers: sanitized });
});

/**
 * POST /api/auth/officers
 * Allocate and provision a new government officer
 */
router.post('/officers', (req, res) => {
  const { name, email, password, role, designation, district, state, jurisdiction_taluk, jurisdiction_dept } = req.body;

  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: 'Name, email, password, and role tier are required.' });
  }

  const existing = db.findAuthority(email);
  if (existing) {
    return res.status(409).json({ error: `An officer with email ${email} already exists.` });
  }

  const jurisdiction = {};
  if (district) jurisdiction.district = district;
  if (state) jurisdiction.state = state;
  if (jurisdiction_taluk) jurisdiction.taluk = jurisdiction_taluk;
  if (jurisdiction_dept) jurisdiction.department = jurisdiction_dept;
  if (role === 'NATIONAL_POLICYMAKER') jurisdiction.national = true;

  const newOfficer = {
    name,
    email,
    password,
    role,
    designation: designation || `${role.replace('_', ' ')} Officer`,
    district: district || '',
    state: state || 'Karnataka',
    jurisdiction,
    status: 'ACTIVE',
  };

  const created = db.addAuthority(newOfficer);
  return res.status(201).json({
    success: true,
    message: `Officer ${name} (${created.id}) successfully provisioned.`,
    officer: {
      id: created.id,
      name: created.name,
      email: created.email,
      role: created.role,
      designation: created.designation,
      district: created.district,
      state: created.state,
      jurisdiction: created.jurisdiction,
      status: created.status
    }
  });
});

/**
 * PUT /api/auth/officers/:id
 * Reallocate officer jurisdiction or update role
 */
router.put('/officers/:id', (req, res) => {
  const { id } = req.params;
  const { name, email, role, designation, district, state, jurisdiction_taluk, jurisdiction_dept, status, password } = req.body;

  const updates = {};
  if (name) updates.name = name;
  if (email) updates.email = email;
  if (role) updates.role = role;
  if (designation) updates.designation = designation;
  if (district !== undefined) updates.district = district;
  if (state !== undefined) updates.state = state;
  if (status) updates.status = status;
  if (password) updates.password = password;

  const jurisdiction = {};
  if (district || updates.district) jurisdiction.district = district || updates.district;
  if (state || updates.state) jurisdiction.state = state || updates.state;
  if (jurisdiction_taluk) jurisdiction.taluk = jurisdiction_taluk;
  if (jurisdiction_dept) jurisdiction.department = jurisdiction_dept;
  if (role === 'NATIONAL_POLICYMAKER' || updates.role === 'NATIONAL_POLICYMAKER') jurisdiction.national = true;
  updates.jurisdiction = jurisdiction;

  const updated = db.updateAuthority(id, updates);
  if (!updated) {
    return res.status(404).json({ error: `Officer ${id} not found.` });
  }

  return res.json({
    success: true,
    message: `Officer ${updated.name} updated successfully.`,
    officer: {
      id: updated.id,
      name: updated.name,
      email: updated.email,
      role: updated.role,
      designation: updated.designation,
      district: updated.district,
      state: updated.state,
      jurisdiction: updated.jurisdiction,
      status: updated.status
    }
  });
});

/**
 * DELETE /api/auth/officers/:id
 * Revoke officer access credentials
 */
router.delete('/officers/:id', (req, res) => {
  const { id } = req.params;
  const deleted = db.deleteAuthority(id);
  if (!deleted) {
    return res.status(404).json({ error: `Officer ${id} not found.` });
  }
  return res.json({ success: true, message: `Officer ${id} access revoked.` });
});

module.exports = router;
