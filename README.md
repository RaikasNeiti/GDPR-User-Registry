# GDPR-Compliant User Registry

A comprehensive, production-ready user registry website that follows all GDPR (General Data Protection Regulation) guidelines, recommendations, and best practices.

## 🛡️ GDPR Compliance Features

### Data Subject Rights (GDPR Articles)
- **Article 15 - Right to Access**: Users can export all their personal data in machine-readable format
- **Article 16 - Right to Rectification**: Users can update their personal information
- **Article 17 - Right to Erasure**: Users can request account deletion with a 30-day grace period
- **Article 18 - Right to Restrict Processing**: Future enhancement for data processing restrictions
- **Article 20 - Right to Data Portability**: Data export in JSON format
- **Article 21 - Right to Object**: Users can withdraw consent anytime

### Privacy & Consent Management
- ✅ **Explicit Consent**: Clear checkbox-based consent for terms and privacy policy
- ✅ **Consent Logging**: All consents are logged with timestamp, IP, and user agent
- ✅ **Cookie Consent Banner**: Compliant cookie consent with granular options
- ✅ **Privacy Policy**: Comprehensive, legally-focused privacy policy
- ✅ **Terms of Service**: Clear terms with GDPR-relevant clauses

### Data Security
- 🔐 **Password Security**: bcrypt hashing with salt rounds (10 iterations)
- 🔐 **HTTPS Ready**: Security headers (HSTS, CSP, X-Frame-Options, etc.)
- 🔐 **Data Encryption**: All sensitive data encrypted in transit
- 🔐 **No Plain-Text Storage**: Passwords never stored in plain text

### Accountability & Audit Trail
- 📋 **Audit Logging**: Complete audit trail of all user actions
- 📋 **IP Tracking**: IP address logging for security purposes
- 📋 **User Agent Tracking**: Browser/device identification
- 📋 **Timestamp Recording**: Precise timestamps for all events
- 📋 **Activity History**: Users can view their own activity log

### Data Retention & Deletion
- 🗑️ **Automatic Deletion**: 30-day grace period for account deletion
- 🗑️ **Soft Delete**: User accounts marked as inactive before permanent deletion
- 🗑️ **Audit Log Retention**: 12 months for compliance
- 🗑️ **Consent History Retention**: 3 years for legal compliance
- 🗑️ **Cancellable Deletion**: Users can cancel deletion requests within grace period

### Technical Compliance
- ✓ Data minimization (only collect necessary data)
- ✓ Purpose limitation (clear data usage statement)
- ✓ Lawful basis documentation
- ✓ Data Protection Impact Assessment (DPIA) ready
- ✓ Privacy by design principles
- ✓ Subprocessor accountability

## 📋 Features

### User Management
- User registration with validation
- Secure login/logout
- Profile management
- Password hashing with bcrypt

### Data Transparency
- Downloadable privacy policy
- Downloadable terms of service
- Cookie consent management
- Consent history tracking

### Data Control
- View personal data
- Export personal data
- Update personal information
- Request account deletion
- Cancel deletion requests
- View activity history

### Security
- SQL injection prevention (parameterized queries)
- XSS protection (Content Security Policy)
- CSRF protection ready
- Secure session management
- Rate limiting ready
- HTTPS headers configured

## 🚀 Getting Started

### Prerequisites
- Node.js v14+ 
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd GDPR-User-Registry
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:
```bash
# Edit .env file with your settings
cp .env.example .env
```

4. Start the server:
```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

5. Open your browser and navigate to:
```
https://localhost:3000
```

## 📁 Project Structure

```
GDPR-User-Registry/
├── server.js              # Express server & API
├── package.json          # Dependencies
├── .env                  # Environment configuration
├── .gitignore           # Git ignore rules
├── data/                # SQLite database storage
│   └── users.db        # User data (auto-created)
└── public/
    ├── index.html      # Main page
    ├── app.js          # Frontend logic
    └── style.css       # Styling
```

## 🔌 API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user

### User Data
- `GET /api/user/:userId` - Get user profile
- `PUT /api/user/:userId` - Update user profile

### GDPR Rights
- `POST /api/dsar/export` - Export personal data (Data Subject Access Request)
- `POST /api/deletion/request` - Request account deletion (30-day grace period)
- `POST /api/deletion/cancel` - Cancel deletion request
- `POST /api/deletion/immediate` - Immediate deletion (for testing)

### Activity & Consent
- `GET /api/audit-log/:userId` - Get user activity log
- `GET /api/consent-history/:userId` - Get consent history

### Information
- `GET /api/privacy-policy` - Get privacy policy
- `GET /api/terms-of-service` - Get terms of service
- `GET /api/cookie-consent-info` - Get cookie information

## 🗄️ Database Schema

### Users Table
```sql
id                      TEXT PRIMARY KEY
first_name             TEXT
last_name              TEXT
email                  TEXT UNIQUE
password_hash          TEXT
phone                  TEXT
created_at             DATETIME
updated_at             DATETIME
is_active              BOOLEAN
deletion_requested_at  DATETIME
deletion_scheduled_for DATETIME
data_export_requested_at DATETIME
```

### Consent Log Table
```sql
id         TEXT PRIMARY KEY
user_id    TEXT (Foreign Key)
consent_type TEXT
version    TEXT
given_at   DATETIME
ip_address TEXT
user_agent TEXT
```

### Audit Log Table
```sql
id        TEXT PRIMARY KEY
user_id   TEXT (Foreign Key)
action    TEXT
description TEXT
ip_address TEXT
user_agent TEXT
created_at DATETIME
```

### Deletion Requests Table
```sql
id          TEXT PRIMARY KEY
user_id     TEXT (Foreign Key)
requested_at DATETIME
scheduled_for DATETIME
status      TEXT
reason      TEXT
```

## 🔒 GDPR Best Practices Implemented

### Data Minimization
- Only collect essential information (name, email, optional phone)
- No unnecessary tracking
- Clear purpose for each data point

### Purpose Limitation
- Data used only for account management
- Clear privacy policy explaining all uses
- Consent required for non-essential processing

### Storage Limitation
- 12-month audit log retention
- 3-year consent history retention
- User data retained only while account active
- 30-day grace period before permanent deletion

### Integrity and Confidentiality
- Encrypted password storage
- HTTPS-ready security headers
- No plain-text sensitive data
- Regular audit trails

### Accountability
- Complete audit logs
- Consent documentation
- IP and user agent tracking
- Timestamps on all actions
- Deletion request tracking

## 📝 Privacy Policy Highlights

The privacy policy covers:
- Data controller information
- Types of data collected
- Legal basis for processing
- User rights and how to exercise them
- Data retention periods
- Security measures
- International transfers
- Contact information for privacy inquiries

## 🚨 Testing GDPR Features

### Register a Test Account
1. Fill in registration form
2. Accept terms and privacy policy
3. Account created with consent logged

### Export Personal Data
1. Login to dashboard
2. Click "📥 Export My Data"
3. JSON file downloads with all your data, audit logs, and consents

### Request Deletion
1. Login to dashboard
2. Click "🗑️ Request Deletion"
3. Account marked for deletion
4. 30-day grace period starts
5. Can cancel anytime during this period

### View Activity Log
1. Login to dashboard
2. Scroll to "📝 Activity Log"
3. See all your account activities with timestamps

### View Consent History
1. Login to dashboard
2. Scroll to "✅ Consent History"
3. See when and what you consented to

## 🔐 Security Notes

### In Production, Implement:
1. **HTTPS/SSL**: Use proper SSL certificates
2. **CSRF Protection**: Add CSRF tokens to forms
3. **Rate Limiting**: Prevent brute force attacks
4. **Input Validation**: Enhanced validation and sanitization
5. **Secrets Management**: Use environment variables for sensitive data
6. **Database Encryption**: Encrypt database backups
7. **Access Control**: Role-based access control (RBAC)
8. **Backup & Recovery**: Regular encrypted backups
9. **Incident Response**: Data breach notification procedures
10. **Data Processing Agreement**: With hosting providers

## 📚 Additional Resources

### GDPR Articles Referenced
- Article 4 - Definitions
- Article 5 - Principles
- Article 6 - Lawfulness of processing
- Article 7 - Conditions for consent
- Article 12-22 - Data subject rights
- Article 25 - Data protection by design
- Article 32 - Security of processing
- Article 33-34 - Breach notification

### Recommended Reading
- [GDPR Text (EUR-Lex)](https://eur-lex.europa.eu/eli/reg/2016/679/oj)
- [ICO GDPR Guidance](https://ico.org.uk/for-organisations/gdpr/)
- [EDPB Guidelines](https://edpb.ec.europa.eu/our-work-tools/general-guidance_en)

## 📋 Compliance Checklist

- ✅ Privacy policy visible and accessible
- ✅ Clear consent mechanism
- ✅ Consent logging and tracking
- ✅ User data export functionality
- ✅ Account deletion functionality
- ✅ Activity audit logs
- ✅ Data retention policies
- ✅ Security headers configured
- ✅ Password hashing implemented
- ✅ No plain-text sensitive data storage
- ✅ IP and user agent logging
- ✅ Cookie consent banner

## 🤝 Contributing

To contribute to this project:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📄 License

This project is open source and available under the MIT License.

## ⚖️ Legal Disclaimer

This is a demonstration application. While it implements GDPR best practices, each organization must:
- Conduct their own Data Protection Impact Assessment (DPIA)
- Implement appropriate administrative and organizational measures
- Ensure compliance with local data protection laws
- Maintain proper records of processing activities
- Have Data Processing Agreements with all service providers

For legal advice, consult with your Data Protection Officer or legal team.


**Last Updated**: June 2026
**Version**: 1.0.1
**GDPR Compliance Level**: Comprehensive ✓
Thesis work for Metropolia
