const jwt = require('jsonwebtoken');
const config = require('../config');

const ROLE_HIERARCHY = {
  FIELD_OFFICER: 1,
  DEPARTMENT_OFFICER: 2,
  DISTRICT_AUTHORITY: 3,
  STATE_AUTHORITY: 4,
  NATIONAL_POLICYMAKER: 5,
};

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    // For development/demo prototyping: fallback to default District Officer session if no token provided
    req.user = {
      uid: 'DEMO-OFFICER-001',
      name: 'Dr. S. K. Narayana',
      email: 'officer.demo@jansetu.gov.in',
      role: 'DISTRICT_AUTHORITY',
      district: 'Yadgir',
      state: 'Karnataka',
      designation: 'Deputy Commissioner & District Magistrate',
    };
    return next();
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid or expired authentication token.' });
  }
};

const requireRole = (minRole) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required for this authority endpoint.' });
    }

    const userLevel = ROLE_HIERARCHY[req.user.role] || 0;
    const requiredLevel = ROLE_HIERARCHY[minRole] || 0;

    if (userLevel < requiredLevel) {
      return res.status(403).json({
        error: `Access Denied. Required role level: ${minRole}. Your current role: ${req.user.role}.`,
      });
    }

    next();
  };
};

module.exports = { authenticateToken, requireRole };
