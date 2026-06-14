const LoginPage = {
  tab: 'login',

  init(params) {
    if (params.error) {
      setTimeout(() => App.toast(params.error === 'oauth_failed' ? 'Failed to connect QuickBooks. Please try again.' : params.error, 'error'), 500);
    }
    this.render();
  },

  render() {
    const c = document.getElementById('pageContent');
    c.innerHTML = `
      <div class="login-page">
        <div class="login-card">
          <h1>TransactFlow</h1>
          <p class="subtitle">Bulk Import Excel/CSV to QuickBooks Online</p>
          <div class="login-tabs">
            <button class="login-tab ${this.tab === 'login' ? 'active' : ''}" onclick="LoginPage.switchTab('login')">Sign In</button>
            <button class="login-tab ${this.tab === 'register' ? 'active' : ''}" onclick="LoginPage.switchTab('register')">Sign Up</button>
          </div>
          <div id="loginError" class="login-error"></div>
          <form id="loginForm">
            <div id="nameGroup" class="form-group" style="display:${this.tab === 'register' ? 'block' : 'none'}">
              <label for="name">Full Name</label>
              <input type="text" id="name" placeholder="John Doe" required>
            </div>
            <div class="form-group">
              <label for="email">Email</label>
              <input type="email" id="email" placeholder="you@example.com" required>
            </div>
            <div class="form-group">
              <label for="password">Password</label>
              <input type="password" id="password" placeholder="Min 6 characters" required>
            </div>
            <button type="submit" class="btn btn-primary btn-lg" style="width:100%">${this.tab === 'login' ? 'Sign In' : 'Create Account'}</button>
          </form>
          <p style="text-align:center;margin-top:16px;font-size:13px;color:var(--gray-400);">
            Secured connection &bull; No credit card required
          </p>
        </div>
      </div>
    `;
    document.getElementById('loginForm').addEventListener('submit', (e) => this.submit(e));
  },

  switchTab(tab) {
    this.tab = tab;
    this.render();
  },

  async submit(e) {
    e.preventDefault();
    const errEl = document.getElementById('loginError');
    errEl.classList.remove('show');
    errEl.textContent = '';

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    try {
      let result;
      if (this.tab === 'login') {
        result = await API.login(email, password);
      } else {
        const name = document.getElementById('name').value.trim();
        if (!name) { errEl.textContent = 'Name is required'; errEl.classList.add('show'); return; }
        result = await API.register(name, email, password);
      }
      localStorage.setItem('token', result.token);
      localStorage.setItem('user', JSON.stringify(result.user));
      App.user = result.user;
      window.location.hash = '#/dashboard';
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.add('show');
    }
  }
};

window.LoginPage = LoginPage;
