require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const validator = require('validator');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const sodium = require('libsodium-wrappers');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { execSync } = require('child_process');

const app = express();
app.disable('x-powered-by');
const PORT = process.env.PORT || 3000;
const VAULT_ADDR = process.env.VAULT_ADDR;
const VAULT_TOKEN = process.env.VAULT_TOKEN;
const VAULT_SECRET_PATH = process.env.VAULT_SECRET_PATH || 'secret/data/gdpr-app';
let JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';
let DATA_ENCRYPTION_KEY_HEX = process.env.DATA_ENCRYPTION_KEY;
const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10);
const RATE_LIMIT_MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10);
const AUTH_RATE_LIMIT_WINDOW_MS = parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS || '900000', 10);
const AUTH_RATE_LIMIT_MAX_REQUESTS = parseInt(process.env.AUTH_RATE_LIMIT_MAX_REQUESTS || '20', 10);
const CERT_DIR = path.join(__dirname, 'certs');
const CERT_PATH = process.env.SSL_CERT_PATH || path.join(CERT_DIR, 'cert.pem');
const KEY_PATH = process.env.SSL_KEY_PATH || path.join(CERT_DIR, 'key.pem');

// Security headers for GDPR compliance
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src-attr 'unsafe-hashes' 'unsafe-inline'");
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  next();
});

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

const globalLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' }
});

const authLimiter = rateLimit({
  windowMs: AUTH_RATE_LIMIT_WINDOW_MS,
  max: AUTH_RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication requests, please try again later.' }
});

app.use(globalLimiter);

let sodiumReady = false;

const { Agent } = require('undici');

async function loadVaultSecrets() {
  if (!VAULT_ADDR || !VAULT_TOKEN) {
    return;
  }

  const vaultUrl = `${VAULT_ADDR.replace(/\/$/, '')}/v1/${VAULT_SECRET_PATH.replace(/^\//, '')}`;
  console.log(`Loading secrets from Vault path: ${VAULT_SECRET_PATH}`);

  // Salli self-signed sertifikaatti vain jos eksplisiittisesti sallittu
  const allowInsecure = process.env.VAULT_TLS_INSECURE === 'true';
  const fetchOptions = {
    method: 'GET',
    headers: {
      'X-Vault-Token': VAULT_TOKEN,
      'Content-Type': 'application/json'
    }
  };

  if (allowInsecure) {
    fetchOptions.dispatcher = new Agent({
      connect: { rejectUnauthorized: false }
    });
  }

  const response = await fetch(vaultUrl, fetchOptions);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Vault fetch failed: ${response.status} ${response.statusText} - ${text}`);
  }

  const vaultPayload = await response.json();
  const vaultData = vaultPayload?.data?.data || vaultPayload?.data;
  if (!vaultData) {
    throw new Error('Vault response did not include secret data');
  }

  JWT_SECRET = JWT_SECRET || vaultData.JWT_SECRET || vaultData.jwt_secret || vaultData.jwtSecret;
  DATA_ENCRYPTION_KEY_HEX = DATA_ENCRYPTION_KEY_HEX || vaultData.DATA_ENCRYPTION_KEY || vaultData.data_encryption_key || vaultData.dataEncryptionKey;

  if (vaultData.DATABASE_URL && !process.env.DATABASE_URL) {
    process.env.DATABASE_URL = vaultData.DATABASE_URL;
  }

  console.log('Vault secrets loaded');
}



// Initialize Postgres connection (uses DATABASE_URL or PG* env vars)
let pool;

function convertPlaceholders(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => {
    i += 1; return `$${i}`;
  });
}

const db = {
  run: (sql, params, cb) => {
    const q = convertPlaceholders(sql);
    pool.query(q, params)
      .then(res => cb && cb(null, res))
      .catch(err => cb && cb(err));
  },
  get: (sql, params, cb) => {
    const q = convertPlaceholders(sql);
    pool.query(q, params)
      .then(res => cb && cb(null, res.rows[0]))
      .catch(err => cb && cb(err));
  },
  all: (sql, params, cb) => {
    const q = convertPlaceholders(sql);
    pool.query(q, params)
      .then(res => cb && cb(null, res.rows))
      .catch(err => cb && cb(err));
  }
};

function initializeDatabase() {
  // Users table for Postgres
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      email TEXT NOT NULL,
      email_hash TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      phone TEXT,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      is_active BOOLEAN DEFAULT TRUE,
      deletion_requested_at TIMESTAMPTZ NULL,
      deletion_scheduled_for TIMESTAMPTZ NULL,
      data_export_requested_at TIMESTAMPTZ NULL
    )
  `, [], (err) => { if (err) console.error('users table error:', err); });

  db.run(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS email_hash TEXT;
  `, [], (err) => { if (err) console.error('users alter email_hash error:', err); });

  db.run(`
    CREATE UNIQUE INDEX IF NOT EXISTS users_email_hash_idx ON users(email_hash);
  `, [], (err) => { if (err) console.error('users email_hash index error:', err); });

  // Consent management table
  db.run(`
    CREATE TABLE IF NOT EXISTS consent_log (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      consent_type TEXT NOT NULL,
      version TEXT NOT NULL,
      given_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      ip_address TEXT,
      user_agent TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `, [], (err) => { if (err) console.error('consent_log table error:', err); });

  // Audit log table (GDPR requirement for accountability)
  db.run(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      action TEXT NOT NULL,
      description TEXT,
      ip_address TEXT,
      user_agent TEXT,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `, [], (err) => { if (err) console.error('audit_log table error:', err); });

  // Data deletion requests table
  db.run(`
    CREATE TABLE IF NOT EXISTS deletion_requests (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      requested_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      scheduled_for TIMESTAMPTZ NOT NULL,
      status TEXT DEFAULT 'pending',
      reason TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `, [], (err) => { if (err) console.error('deletion_requests table error:', err); });

  console.log('Database initialized with GDPR-compliant schema (Postgres)');
}

// Helper function to log audit events
function logAuditEvent(userId, action, description, req) {
  const id = uuidv4();
  const ip = req.ip || req.connection.remoteAddress;
  const userAgent = req.get('user-agent') || 'Unknown';
  
  db.run(
    `INSERT INTO audit_log (id, user_id, action, description, ip_address, user_agent)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, userId, action, description, ip, userAgent],
    (err) => {
      if (err) console.error('Audit log error:', err);
    }
  );
}

// Helper function to log consent
function logConsent(userId, consentType, req) {
  const id = uuidv4();
  const ip = req.ip || req.connection.remoteAddress;
  const userAgent = req.get('user-agent') || 'Unknown';
  
  db.run(
    `INSERT INTO consent_log (id, user_id, consent_type, version, ip_address, user_agent)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, userId, consentType, '1.0', ip, userAgent],
    (err) => {
      if (err) console.error('Consent log error:', err);
    }
  );
}

function createToken(user) {
  return jwt.sign(
    { id: user.id },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Authentication token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, payload) => {
    if (err) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    req.user = payload;
    next();
  });
}

function getEncryptionKey() {
  if (!sodiumReady) {
    throw new Error('Sodium is not initialized');
  }
  const key = sodium.from_hex(DATA_ENCRYPTION_KEY_HEX);
  if (key.length !== sodium.crypto_secretbox_KEYBYTES) {
    throw new Error('DATA_ENCRYPTION_KEY must be a 32-byte hex string');
  }
  return key;
}

function encryptField(value) {
  if (value === null || value === undefined) return null;
  const key = getEncryptionKey();
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
  const cipher = sodium.crypto_secretbox_easy(sodium.from_string(String(value)), nonce, key);
  return sodium.to_hex(nonce) + sodium.to_hex(cipher);
}

function decryptField(encryptedValue) {
  if (!encryptedValue) return null;
  const key = getEncryptionKey();
  const nonceHex = encryptedValue.slice(0, sodium.crypto_secretbox_NONCEBYTES * 2);
  const cipherHex = encryptedValue.slice(sodium.crypto_secretbox_NONCEBYTES * 2);
  const nonce = sodium.from_hex(nonceHex);
  const cipher = sodium.from_hex(cipherHex);
  try {
    return sodium.to_string(sodium.crypto_secretbox_open_easy(cipher, nonce, key));
  } catch (err) {
    console.error('Decryption failed:', err);
    return null;
  }
}

function hashEmail(email) {
  if (!email) return null;
  const hash = sodium.crypto_generichash(32, sodium.from_string(email));
  return sodium.to_hex(hash);
}

// Homepage
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

// Privacy Policy
app.get('/api/privacy-policy', (req, res) => {
  res.json({
    policy: `
PRIVACY POLICY

Last Updated: ${new Date().toISOString().split('T')[0]}

1. DATA CONTROLLER
Organization: GDPR User Registry
Contact: privacy@gdpr-registry.com

2. DATA WE COLLECT
- Personal Information: First name, last name, email, phone number (optional)
- Account Information: Password (hashed), account creation date
- Usage Information: IP address, user agent (for security audit logging only)

3. LEGAL BASIS FOR PROCESSING
- Consent: You provide explicit consent when registering
- Contract: Processing is necessary for account management
- Legal Obligation: We maintain audit logs to comply with regulations

4. YOUR RIGHTS (GDPR ARTICLES)
- Right to Access (Article 15): Request a copy of your data
- Right to Rectification (Article 16): Correct inaccurate information
- Right to Erasure (Article 17): Request data deletion
- Right to Restrict Processing (Article 18): Limit how we use your data
- Right to Data Portability (Article 20): Export your data in machine-readable format
- Right to Object (Article 21): Oppose certain processing

5. DATA RETENTION
- Account data: Retained while account is active
- Audit logs: Retained for 12 months for security compliance
- After deletion request: 30-day grace period before permanent deletion
- Consent logs: Retained for 3 years

6. DATA SECURITY
- Passwords are hashed using bcrypt with salt rounds
- All data transfers use HTTPS (SSL/TLS encryption)
- Access is restricted to authorized personnel
- Regular security audits are performed

7. INTERNATIONAL DATA TRANSFERS
Currently, data is processed only within the EU/EEA region.

8. CONTACT US
For privacy inquiries: privacy@gdpr-registry.com
Data Protection Officer: dpo@gdpr-registry.com
    `
  });
});

// Terms of Service
app.get('/api/terms-of-service', (req, res) => {
  res.json({
    terms: `
TERMS OF SERVICE

1. ACCEPTANCE OF TERMS
By using this service, you accept these terms.

2. USER RESPONSIBILITIES
- You are responsible for maintaining the confidentiality of your password
- You agree not to use this service for illegal activities
- You will not attempt to gain unauthorized access to the system

3. DATA ACCURACY
- You agree to provide accurate information during registration
- You are responsible for keeping your information updated
- We reserve the right to verify information and request updates

4. LIMITATION OF LIABILITY
- Service is provided "as-is"
- We are not liable for data loss due to user negligence
- We maintain backups but cannot guarantee 100% availability

5. TERMINATION
- We may terminate accounts that violate these terms
- Users can delete their accounts at any time
- Upon deletion, data will be permanently removed after 30 days

6. MODIFICATIONS
We reserve the right to modify these terms with notice.
    `
  });
});

// Cookie Consent (GDPR requirement)
app.get('/api/cookie-consent-info', (req, res) => {
  res.json({
    cookies: {
      essential: {
        name: 'Essential Cookies',
        required: true,
        description: 'Required for authentication and security'
      },
      analytics: {
        name: 'Analytics Cookies',
        required: false,
        description: 'Help us understand how users interact with the site'
      },
      marketing: {
        name: 'Marketing Cookies',
        required: false,
        description: 'Used for targeted advertising (not used in this version)'
      }
    }
  });
});

// ==================== AUTH ROUTES ====================

// Register
app.post('/api/auth/register', authLimiter, (req, res) => {
  try {
    const { firstName, lastName, email, password, phone, acceptTerms, acceptPrivacy } = req.body;

    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    if (!validator.isEmail(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    if (!acceptTerms || !acceptPrivacy) {
      return res.status(400).json({ error: 'You must accept terms and privacy policy' });
    }

    const salt = bcrypt.genSaltSync(10);
    const passwordHash = bcrypt.hashSync(password, salt);
    const userId = uuidv4();
    const normalizedEmail = email.toLowerCase().trim();
    const emailHash = hashEmail(normalizedEmail);
    const encryptedEmail = encryptField(normalizedEmail);
    const encryptedFirstName = encryptField(firstName);
    const encryptedLastName = encryptField(lastName);
    const encryptedPhone = encryptField(phone || null);

    db.run(
      `INSERT INTO users (id, first_name, last_name, email, email_hash, password_hash, phone)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId, encryptedFirstName, encryptedLastName, encryptedEmail, emailHash, passwordHash, encryptedPhone],
      function(err) {
        if (err) {
          if (err.code === '23505' || (err.message && err.message.toLowerCase().includes('duplicate'))) {
            return res.status(400).json({ error: 'Email already registered' });
          }
          console.error('Registration DB error:', err);
          return res.status(500).json({ error: 'Registration failed' });
        }

        logConsent(userId, 'terms', req);
        logConsent(userId, 'privacy', req);
        logAuditEvent(userId, 'ACCOUNT_CREATED', 'User registered', req);

        const token = createToken({ id: userId, email });
        res.status(201).json({
          message: 'Registration successful',
          user: { id: userId, firstName, lastName, email, phone: phone || null },
          token
        });
      }
    );
  } catch (err) {
  console.error('Registration error:', err.message);
  return res.status(500).json({ error: 'Registration failed' });
  }
});

// Login
app.post('/api/auth/login', authLimiter, (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Missing credentials' });
  }

  const normalizedEmail = email.toLowerCase().trim();
  const emailHash = hashEmail(normalizedEmail);

  db.get(
    `SELECT * FROM users WHERE email_hash = ? AND is_active = TRUE`,
    [emailHash],
    (err, user) => {
      if (err) {
        return res.status(500).json({ error: 'Login failed' });
      }

      if (!user) {
        logAuditEvent(null, 'LOGIN_FAILED', `Failed login attempt for: ${email}`, req);
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const isValidPassword = bcrypt.compareSync(password, user.password_hash);
      
      if (!isValidPassword) {
        logAuditEvent(user.id, 'LOGIN_FAILED', 'Invalid password', req);
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      logAuditEvent(user.id, 'LOGIN_SUCCESS', 'User logged in', req);
      const token = createToken({ id: user.id });

      res.json({
        message: 'Login successful',
        token,
        user: {
          id: user.id,
          firstName: decryptField(user.first_name),
          lastName: decryptField(user.last_name),
          email: decryptField(user.email)
        }
      });
    }
  );
});

// ==================== USER DATA ROUTES ====================

// Get user profile
app.get('/api/user/:userId', authenticateToken, (req, res) => {
  const { userId } = req.params;
  if (req.user.id !== userId) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  db.get(
    `SELECT id, first_name, last_name, email, phone, created_at, updated_at 
     FROM users WHERE id = ?`,
    [userId],
    (err, user) => {
      if (err || !user) {
        return res.status(404).json({ error: 'User not found' });
      }

      logAuditEvent(userId, 'DATA_ACCESS', 'User viewed profile', req);

      res.json({
        id: user.id,
        firstName: decryptField(user.first_name),
        lastName: decryptField(user.last_name),
        email: decryptField(user.email),
        phone: decryptField(user.phone),
        createdAt: user.created_at
      });
    }
  );
});

// Update user profile
app.put('/api/user/:userId', authenticateToken, (req, res) => {
  const { userId } = req.params;
  const { firstName, lastName, phone } = req.body;

  if (req.user.id !== userId) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  if (!firstName || !lastName) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const encryptedFirstName = encryptField(firstName);
  const encryptedLastName = encryptField(lastName);
  const encryptedPhone = encryptField(phone || null);

  db.run(
    `UPDATE users SET first_name = ?, last_name = ?, phone = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [encryptedFirstName, encryptedLastName, encryptedPhone, userId],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Update failed' });
      }

      logAuditEvent(userId, 'DATA_UPDATED', 'User profile updated', req);

      res.json({ message: 'Profile updated successfully' });
    }
  );
});

// ==================== GDPR DATA RIGHTS ROUTES ====================

// Data Subject Access Request (DSAR) - Export user data
app.post('/api/dsar/export', authenticateToken, (req, res) => {
  const userId = req.user.id;

  db.get(
    `SELECT * FROM users WHERE id = ?`,
    [userId],
    (err, user) => {
      if (err || !user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Get consent logs
      db.all(
        `SELECT * FROM consent_log WHERE user_id = ?`,
        [userId],
        (err, consents) => {
          // Get audit log
          db.all(
            `SELECT * FROM audit_log WHERE user_id = ?`,
            [userId],
            (err, audits) => {
              const exportData = {
                exportDate: new Date().toISOString(),
                userProfile: {
                  id: user.id,
                  firstName: decryptField(user.first_name),
                  lastName: decryptField(user.last_name),
                  email: decryptField(user.email),
                  phone: decryptField(user.phone),
                  createdAt: user.created_at,
                  updatedAt: user.updated_at,
                  isActive: user.is_active
                },
                consentHistory: consents || [],
                activityLog: audits || []
              };

              logAuditEvent(userId, 'DSAR_INITIATED', 'User requested data export', req);

              // Return as JSON for download
              res.json(exportData);
            }
          );
        }
      );
    }
  );
});

// Request account deletion (with 30-day grace period)
app.post('/api/deletion/request', authenticateToken, (req, res) => {
  const userId = req.user.id;
  const { reason } = req.body;

  const deletionId = uuidv4();
  const scheduledDeletion = new Date();
  scheduledDeletion.setDate(scheduledDeletion.getDate() + 30); // 30-day grace period

  db.run(
    `INSERT INTO deletion_requests (id, user_id, scheduled_for, reason, status)
     VALUES (?, ?, ?, ?, 'pending')`,
    [deletionId, userId, scheduledDeletion.toISOString(), reason || null],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Deletion request failed' });
      }

      // Mark user for deletion
      db.run(
        `UPDATE users SET deletion_requested_at = CURRENT_TIMESTAMP, 
         deletion_scheduled_for = ? WHERE id = ?`,
        [scheduledDeletion.toISOString(), userId],
        (err) => {
          logAuditEvent(userId, 'DELETION_REQUESTED', 
            `Account deletion scheduled for ${scheduledDeletion.toISOString()}`, req);

          res.json({
            message: 'Deletion request submitted. Your account will be deleted in 30 days.',
            deletionScheduledFor: scheduledDeletion.toISOString(),
            note: 'You can cancel this request anytime within the grace period'
          });
        }
      );
    }
  );
});

// Cancel deletion request
app.post('/api/deletion/cancel', authenticateToken, (req, res) => {
  const userId = req.user.id;

  db.run(
    `UPDATE users SET deletion_requested_at = NULL, deletion_scheduled_for = NULL 
     WHERE id = ?`,
    [userId],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to cancel deletion' });
      }

      db.run(
        `UPDATE deletion_requests SET status = 'cancelled' WHERE user_id = ?`,
        [userId],
        (err) => {
          logAuditEvent(userId, 'DELETION_CANCELLED', 'User cancelled deletion request', req);
          res.json({ message: 'Deletion request cancelled' });
        }
      );
    }
  );
});

// Immediate deletion (without grace period) - for testing
app.post('/api/deletion/immediate', authenticateToken, (req, res) => {
  const userId = req.user.id;

  // Mark as inactive first (soft delete)
  db.run(
    `UPDATE users SET is_active = FALSE WHERE id = ?`,
    [userId],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Deletion failed' });
      }

      logAuditEvent(userId, 'ACCOUNT_DELETED', 'Account deleted (user requested)', req);

      // Note: In production, personal data would be securely wiped, 
      // but audit logs retained for legal compliance
      res.json({ message: 'Account deleted successfully' });
    }
  );
});

// Get audit log (user can view their own activity)
app.get('/api/audit-log/:userId', authenticateToken, (req, res) => {
  const { userId } = req.params;
  if (req.user.id !== userId) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  db.all(
    `SELECT action, description, ip_address, created_at FROM audit_log 
     WHERE user_id = ? ORDER BY created_at DESC LIMIT 100`,
    [userId],
    (err, logs) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to retrieve audit log' });
      }

      res.json(logs || []);
    }
  );
});

// Get consent history
app.get('/api/consent-history/:userId', authenticateToken, (req, res) => {
  const { userId } = req.params;
  if (req.user.id !== userId) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  db.all(
    `SELECT consent_type, given_at, version FROM consent_log 
     WHERE user_id = ? ORDER BY given_at DESC`,
    [userId],
    (err, consents) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to retrieve consent history' });
      }

      res.json(consents || []);
    }
  );
});

// ==================== SERVER START ====================

function loadHttpsCredentials() {
  if (fs.existsSync(CERT_PATH) && fs.existsSync(KEY_PATH)) {
    return {
      key: fs.readFileSync(KEY_PATH),
      cert: fs.readFileSync(CERT_PATH)
    };
  }

  fs.mkdirSync(CERT_DIR, { recursive: true });
  console.log('No HTTPS certificate found. Generating a self-signed certificate in certs/ for local development...');

  try {
    execSync(
      `openssl req -x509 -newkey rsa:2048 -nodes -keyout "${KEY_PATH}" -out "${CERT_PATH}" -days 365 -subj "/CN=localhost"`,
      { stdio: 'inherit' }
    );
  } catch (error) {
    console.error('Failed to generate HTTPS certificate. Make sure OpenSSL is installed.', error);
    process.exit(1);
  }

  return {
    key: fs.readFileSync(KEY_PATH),
    cert: fs.readFileSync(CERT_PATH)
  };
}

async function startServer() {

  await sodium.ready;
  sodiumReady = true;
  console.log('Libsodium is initialized');

  await loadVaultSecrets();

  if (!JWT_SECRET) {
    console.error('FATAL: JWT_SECRET environment variable is required');
    process.exit(1);
  }

  if (!DATA_ENCRYPTION_KEY_HEX) {
    console.error('FATAL: DATA_ENCRYPTION_KEY environment variable is required');
    process.exit(1);
  }

  pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  await pool.connect()
    .then(client => {
      client.release();
      console.log('Connected to Postgres database');
      initializeDatabase();
    })
    .catch(err => {
      console.error('Error connecting to Postgres:', err);
      process.exit(1);
    });

  const credentials = loadHttpsCredentials();

  https.createServer(credentials, app).listen(PORT, () => {
    console.log(`GDPR User Registry server running on https://localhost:${PORT}`);
    console.log('Environment: ' + (process.env.NODE_ENV || 'development'));
  });
}

async function initForTests() {
  
  await sodium.ready;
  sodiumReady = true;
  

  await loadVaultSecrets().catch((err) => {
    console.log('Vault load failed:', err.message);
  });

  if (!JWT_SECRET) JWT_SECRET = process.env.JWT_SECRET;
  if (!DATA_ENCRYPTION_KEY_HEX) DATA_ENCRYPTION_KEY_HEX = process.env.DATA_ENCRYPTION_KEY;

  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET is required for tests');
  }
  if (!DATA_ENCRYPTION_KEY_HEX) {
    throw new Error('DATA_ENCRYPTION_KEY is required for tests');
  }

  pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  const client = await pool.connect();
  client.release();
  initializeDatabase();

  // Pieni viive jotta CREATE TABLE -kyselyt ehtivät valmistua
  await new Promise(resolve => setTimeout(resolve, 500));
}

module.exports = { app, initForTests };

if (require.main === module) {
  startServer().catch(error => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
}