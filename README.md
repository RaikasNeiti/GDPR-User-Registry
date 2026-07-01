# GDPR User Registry

This project is a GDPR-focused user registry application built with Node.js, Express, PostgreSQL, and a browser-based UI. It supports user registration, authentication, consent logging, activity tracking, and data export/deletion workflows.

This repository was created as a thesis project to demonstrate a practical implementation of GDPR-compliant user data handling and privacy-focused application design.

## What this app does

- Register and log in users securely
- Store password hashes with bcrypt
- Log consent events and user activity
- Support data export for GDPR access requests
- Support deletion requests with a grace period
- Run against PostgreSQL and optionally Docker

## Prerequisites

- Node.js 20 or newer
- npm
- PostgreSQL instance, or Docker Desktop with Docker Compose
- A secure secret source for:
  - DATA_ENCRYPTION_KEY
  - JWT_SECRET
  - DATABASE_URL

## Quick start

1. Clone the repository
   ```bash
   git clone <repository-url>
   cd GDPR-User-Registry
   ```

2. Install dependencies
   ```bash
   npm install
   ```

3. Create your environment file
   ```bash
   cp .env.example .env
   ```

4. Configure your secrets and database connection in the .env file

## Required environment variables

The app requires the following values to start:

- DATA_ENCRYPTION_KEY: a 32-byte hex value
- JWT_SECRET: a long random string
- DATABASE_URL: your PostgreSQL connection string

You should provide these from your own secure secret store. The recommended approach is to use a vault.

### Option A: Use HashiCorp Vault

Set these variables in your environment or .env file:

```env
VAULT_ADDR=https://your-vault-host:8200
VAULT_TOKEN=your-vault-token
VAULT_SECRET_PATH=secret/data/gdpr-app
```

Then store these keys in your Vault secret:

```json
{
  "DATA_ENCRYPTION_KEY": "<32-byte-hex-value>",
  "JWT_SECRET": "<random-secret>",
  "DATABASE_URL": "postgres://user:password@host:5432/dbname"
}
```

### Option B: Use .env directly

If you are not using Vault, add these directly to .env:

```env
DATA_ENCRYPTION_KEY=<32-byte-hex-value>
JWT_SECRET=<random-secret>
DATABASE_URL=postgres://user:password@host:5432/dbname
```

### Generate secure values

Generate a strong encryption key:

```bash
node -e "const s=require('libsodium-wrappers'); s.ready.then(()=>console.log(Buffer.from(s.randombytes_buf(32)).toString('hex')));"
```

Generate a JWT secret:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

## Run locally

Start the application:

```bash
npm start
```

For development with auto-reload:

```bash
npm run dev
```

Then open:

```text
https://localhost:3000
```

## Run with Docker

This repository includes a Docker Compose setup for the app and a PostgreSQL container.

1. Ensure your `.env` file contains the required secrets and `DATABASE_URL` values.

2. Build and start the containers:
   ```bash
   docker compose up --build
   ```

   or use the Makefile:
   ```bash
   make docker-up
   ```

3. The app will be available at:
   ```text
   https://localhost:3000
   ```

4. Stop the containers when you are done:
   ```bash
   docker compose down
   ```

   or:
   ```bash
   make docker-down
   ```

## Docker convenience commands

The project includes a `Makefile` with helpful Docker shortcuts:

- `make docker-build`
- `make docker-up`
- `make docker-down`
- `make docker-logs`
- `make docker-shell`
- `make docker-restart`
- `make docker-clean`
- `make docker-backup`
- `make docker-restore`
- `make docker-test`
- `make docker-status`

## Run the tests

Run the test suite with:

```bash
npm test
```

The tests expect the same secret and database configuration to be available before startup.

## Project structure

```text
GDPR-User-Registry/
├── server.js
├── package.json
├── docker-compose.yml
├── Dockerfile
├── .env.example
├── public/
├── tests/
└── readfiles/
```

## Database structure

The app uses PostgreSQL and creates the following tables at startup:

### users

| Column | Type | Description |
| --- | --- | --- |
| id | TEXT | Primary key for the user record |
| first_name | TEXT | User first name |
| last_name | TEXT | User last name |
| email | TEXT | User email address |
| email_hash | TEXT | Unique hash of the email address |
| password_hash | TEXT | Hashed password |
| phone | TEXT | Optional phone number |
| created_at | TIMESTAMPTZ | Account creation timestamp |
| updated_at | TIMESTAMPTZ | Last update timestamp |
| is_active | BOOLEAN | Whether the account is active |
| deletion_requested_at | TIMESTAMPTZ | Timestamp for deletion request |
| deletion_scheduled_for | TIMESTAMPTZ | Scheduled deletion date |
| data_export_requested_at | TIMESTAMPTZ | Timestamp for data export request |

### consent_log

| Column | Type | Description |
| --- | --- | --- |
| id | TEXT | Primary key |
| user_id | TEXT | Linked user ID |
| consent_type | TEXT | Type of consent recorded |
| version | TEXT | Consent version |
| given_at | TIMESTAMPTZ | Consent timestamp |
| ip_address | TEXT | Client IP address |
| user_agent | TEXT | Browser/user-agent string |

### audit_log

| Column | Type | Description |
| --- | --- | --- |
| id | TEXT | Primary key |
| user_id | TEXT | Linked user ID |
| action | TEXT | Action performed |
| description | TEXT | Human-readable action description |
| ip_address | TEXT | Client IP address |
| user_agent | TEXT | Browser/user-agent string |
| created_at | TIMESTAMPTZ | Event timestamp |

### deletion_requests

| Column | Type | Description |
| --- | --- | --- |
| id | TEXT | Primary key |
| user_id | TEXT | Linked user ID |
| requested_at | TIMESTAMPTZ | Request timestamp |
| scheduled_for | TIMESTAMPTZ | Planned deletion date |
| status | TEXT | Current request status |
| reason | TEXT | Reason for deletion |

## API overview

Some of the main endpoints include:

- POST /api/auth/register
- POST /api/auth/login
- POST /api/dsar/export
- POST /api/deletion/request
- POST /api/deletion/cancel
- GET /api/audit-log/:userId
- GET /api/consent-history/:userId

## Notes

- The app is intended for local development and demonstration use unless you harden it further for production.
- For production, use a managed PostgreSQL service, TLS, proper certificate management, and a dedicated secrets manager.
- If you use Docker on Windows or macOS, make sure your environment and networking settings support the compose setup you choose.
