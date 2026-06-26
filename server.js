require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const validator = require('validator');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { execSync } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;
const CERT_DIR = path.join(__dirname, 'certs');
const CERT_PATH = process.env.SSL_CERT_PATH || path.join(CERT_DIR, 'cert.pem');
const KEY_PATH = process.env.SSL_KEY_PATH || path.join(CERT_DIR, 'key.pem');

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// Security headers for GDPR compliance
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Content-Security-Policy', "default-src 'self'");
  next();
});

// Initialize Postgres connection (uses DATABASE_URL or PG* env vars)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

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

pool.connect()
  .then(client => {
    client.release();
    console.log('Connected to Postgres database');
    initializeDatabase();
  })
  .catch(err => {
    console.error('Error connecting to Postgres:', err);
    process.exit(1);
  });

function initializeDatabase() {
  // Users table for Postgres
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
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

// ==================== ROUTES ====================

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
app.post('/api/auth/register', (req, res) => {
  const { firstName, lastName, email, password, phone, acceptTerms, acceptPrivacy } = req.body;

  // Validation
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

  // Hash password
  const salt = bcrypt.genSaltSync(10);
  const passwordHash = bcrypt.hashSync(password, salt);
  const userId = uuidv4();

  db.run(
    `INSERT INTO users (id, first_name, last_name, email, password_hash, phone)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [userId, firstName, lastName, email, passwordHash, phone || null],
    function(err) {
      if (err) {
        if (err.code === '23505' || (err.message && err.message.toLowerCase().includes('duplicate'))) {
          return res.status(400).json({ error: 'Email already registered' });
        }
        console.error('Registration error:', err);
        return res.status(500).json({ error: 'Registration failed' });
      }

      // Log consents
      logConsent(userId, 'terms', req);
      logConsent(userId, 'privacy', req);
      logAuditEvent(userId, 'ACCOUNT_CREATED', 'User registered', req);

      res.status(201).json({ 
        message: 'Registration successful',
        userId: userId
      });
    }
  );
});

// Login
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Missing credentials' });
  }

  db.get(
    `SELECT * FROM users WHERE email = ? AND is_active = TRUE`,
    [email],
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

      res.json({
        message: 'Login successful',
        user: {
          id: user.id,
          firstName: user.first_name,
          lastName: user.last_name,
          email: user.email
        }
      });
    }
  );
});

// ==================== USER DATA ROUTES ====================

// Get user profile
app.get('/api/user/:userId', (req, res) => {
  const { userId } = req.params;

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
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email,
        phone: user.phone,
        createdAt: user.created_at
      });
    }
  );
});

// Update user profile
app.put('/api/user/:userId', (req, res) => {
  const { userId } = req.params;
  const { firstName, lastName, phone } = req.body;

  if (!firstName || !lastName) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  db.run(
    `UPDATE users SET first_name = ?, last_name = ?, phone = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [firstName, lastName, phone || null, userId],
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
app.post('/api/dsar/export', (req, res) => {
  const { userId } = req.body;

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
                  firstName: user.first_name,
                  lastName: user.last_name,
                  email: user.email,
                  phone: user.phone,
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
app.post('/api/deletion/request', (req, res) => {
  const { userId, reason } = req.body;

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
app.post('/api/deletion/cancel', (req, res) => {
  const { userId } = req.body;

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
app.post('/api/deletion/immediate', (req, res) => {
  const { userId } = req.body;

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
app.get('/api/audit-log/:userId', (req, res) => {
  const { userId } = req.params;

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
app.get('/api/consent-history/:userId', (req, res) => {
  const { userId } = req.params;

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

try {
  const credentials = loadHttpsCredentials();

  https.createServer(credentials, app).listen(PORT, () => {
    console.log(`GDPR User Registry server running on https://localhost:${PORT}`);
    console.log('Environment: ' + (process.env.NODE_ENV || 'development'));
  });
} catch (error) {
  console.error('Failed to start HTTPS server:', error);
  process.exit(1);
}
