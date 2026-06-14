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
    if (err.response?.data?.Fault?.Error) {
      const msgs = err.response.data.Fault.Error.map(e => {
        const detail = e.Detail ? ' [' + e.Detail + ']' : '';
        return (e.Message || '') + detail;
      }).join('; ');
      return new Error(msgs || 'QBO API error');
    }
    return new Error(err.message || 'QBO API error');
  }

  async getAccounts() {
    const data = await this.get(`${this.baseUrl}/query?query=select%20*%20from%20Account%20where%20Active%20%3D%20true&minorversion=73`);
    return data.QueryResponse?.Account || [];
  }

  async getVendors() {
    const data = await this.get(`${this.baseUrl}/query?query=select%20*%20from%20Vendor%20where%20Active%20%3D%20true&minorversion=73`);
    return data.QueryResponse?.Vendor || [];
  }

  async getClasses() {
    const data = await this.get(`${this.baseUrl}/query?query=select%20*%20from%20Class%20where%20Active%20%3D%20true&minorversion=73`);
    return data.QueryResponse?.Class || [];
  }

  async getTaxCodes() {
    const data = await this.get(`${this.baseUrl}/query?query=select%20*%20from%20TaxCode&minorversion=73`);
    return data.QueryResponse?.TaxCode || [];
  }

  async createPurchase(data) {
    return this.post(`${this.baseUrl}/purchase?minorversion=73`, data);
  }

  async createBill(data) {
    return this.post(`${this.baseUrl}/bill?minorversion=73`, data);
  }
}

module.exports = QboService;
