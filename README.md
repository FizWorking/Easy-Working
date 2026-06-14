# TransactFlow - QuickBooks Online Bulk Importer

Import Excel/CSV transactions (Expenses & Bills) into QuickBooks Online in bulk.

## Prerequisites

1. **Node.js** v16+ installed
2. **Intuit Developer Account** (free): https://developer.intuit.com
3. **QB OAuth 2.0 App**: Create an app → Get Client ID & Client Secret

## Setup

### 1. Install dependencies
```bash
cd backend
npm install
```

### 2. Configure OAuth
Edit `backend/.env`:
```
QBO_CLIENT_ID=your_client_id_from_intuit
QBO_CLIENT_SECRET=your_client_secret_from_intuit
QBO_ENVIRONMENT=sandbox    # 'sandbox' for testing, 'production' for live
```

### 3. Set Redirect URI in Intuit Dashboard
In your Intuit app settings, add:
```
http://localhost:3000/api/qbo/callback
```

### 4. Run
```bash
npm start
```
Open http://localhost:3000

### 5. For Production
- Change `QBO_ENVIRONMENT=production` in `.env`
- Change `QBO_REDIRECT_URI` to your domain
- Change `JWT_SECRET` to a random string

## Usage
1. Sign up / Sign in
2. Click "Connect to QuickBooks" → Authorize with Intuit
3. Go to Import → Select company & type (Expense/Bill)
4. Upload Excel/CSV file → Auto-detect columns → Map fields
5. Click Import → View results
