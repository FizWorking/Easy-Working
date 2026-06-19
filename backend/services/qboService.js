const axios = require('axios');

const environmentMap = {
  sandbox: 'sandbox-quickbooks.api.intuit.com',
  production: 'quickbooks.api.intuit.com'
};

class QboService {
  constructor(connection, onTokenRefresh) {
    this.connection = connection;
    this.onTokenRefresh = onTokenRefresh;
    this.baseUrl = `https://${environmentMap[process.env.QBO_ENVIRONMENT || 'sandbox']}/v3/company/${connection.realm_id || connection.company_id}`;
  }

  headers(token) {
    return {
      'Authorization': `Bearer ${token || this.connection.access_token}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    };
  }

  async get(url, retried = false) {
    try {
      const res = await axios.get(url, { headers: this.headers() });
      return res.data;
    } catch (err) {
      if (err.response?.status === 401 && !retried) {
        await this.refreshToken();
        return this.get(url, true);
      }
      throw this.normalizeError(err);
    }
  }

  async post(url, data, retried = false) {
    try {
      const res = await axios.post(url, data, { headers: this.headers() });
      return res.data;
    } catch (err) {
      if (err.response?.status === 401 && !retried) {
        await this.refreshToken();
        return this.post(url, data, true);
      }
      throw this.normalizeError(err);
    }
  }

  async refreshToken() {
    const params = new URLSearchParams();
    params.append('grant_type', 'refresh_token');
    params.append('refresh_token', this.connection.refresh_token);

    const res = await axios({
      method: 'post',
      url: 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
      auth: {
        username: process.env.QBO_CLIENT_ID,
        password: process.env.QBO_CLIENT_SECRET
      },
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      data: params.toString()
    });

    const { access_token, refresh_token } = res.data;
    this.connection.access_token = access_token;
    this.connection.refresh_token = refresh_token;

    if (this.onTokenRefresh) {
      this.onTokenRefresh(this.connection.id, access_token, refresh_token);
    }
  }

  normalizeError(err) {
    const status = err.response?.status;
    const detail = err.response?.data?.Fault?.Error?.[0]?.Detail || '';
    const message = err.response?.data?.Fault?.Error?.[0]?.Message || err.message;
    console.error(`[QBO ERROR] ${status}: ${message}${detail ? ' [' + detail + ']' : ''}`);
    if (err.response?.data?.Fault?.Error) {
      const msgs = err.response.data.Fault.Error.map(e => {
        const d = e.Detail ? ' [' + e.Detail + ']' : '';
        return (e.Message || '') + d;
      }).join('; ');
      return new Error(msgs || 'QBO API error');
    }
    return new Error(err.message || 'QBO API error');
  }

  async queryAll(entityType, whereClause = '') {
    let allResults = [];
    let startPosition = 1;
    const maxResults = 1000;
    let hasMore = true;

    while (hasMore) {
      const query = `select%20*%20from%20${entityType}${whereClause}%20STARTPOSITION%20${startPosition}%20MAXRESULTS%20${maxResults}`;
      const data = await this.get(`${this.baseUrl}/query?query=${query}&minorversion=73`);
      const items = data.QueryResponse?.[entityType] || [];
      allResults = allResults.concat(items);
      startPosition += maxResults;
      hasMore = items.length === maxResults;
    }

    return allResults;
  }

  async getAccounts() {
    return this.queryAll('Account', '%20where%20Active%20%3D%20true');
  }

  async getVendors() {
    return this.queryAll('Vendor', '%20where%20Active%20%3D%20true');
  }

  async getClasses() {
    return this.queryAll('Class');
  }

  async getTaxCodes() {
    return this.queryAll('TaxCode');
  }

  async getTaxRates() {
    return this.queryAll('TaxRate');
  }

  async createPurchase(data) {
    return this.post(`${this.baseUrl}/purchase?minorversion=73`, data);
  }

  async createBill(data) {
    return this.post(`${this.baseUrl}/bill?minorversion=73`, data);
  }
}

module.exports = QboService;
