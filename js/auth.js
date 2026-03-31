// Auth — manejo de sesión y pantalla de login
const Auth = {
  async check() {
    const user = await getCurrentUser();
    if (!user) {
      this.showLogin();
      return false;
    }
    return true;
  },

  showLogin() {
    // Ocultar nav y header en el login
    document.getElementById('bottom-nav').classList.add('hidden');
    document.querySelector('.page-header').classList.add('hidden');

    const app = document.getElementById('app');
    app.innerHTML = `
      <div class="login-container">
        <div class="login-card">
          <img src="/assets/logo.svg" alt="Mumú" class="login-logo">
          <form id="login-form">
            <div class="form-group">
              <label for="email">Email</label>
              <input type="email" id="email" required autocomplete="email">
            </div>
            <div class="form-group">
              <label for="password">Contraseña</label>
              <input type="password" id="password" required autocomplete="current-password">
            </div>
            <button type="submit" class="btn btn-primary btn-full">Entrar</button>
            <p id="login-error" class="error-text" hidden></p>
          </form>
        </div>
      </div>
    `;

    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('email').value;
      const password = document.getElementById('password').value;
      const errorEl = document.getElementById('login-error');

      const { error } = await signIn(email, password);
      if (error) {
        errorEl.textContent = 'Email o contraseña incorrectos';
        errorEl.hidden = false;
      } else {
        location.reload();
      }
    });
  }
};
