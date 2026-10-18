import { useEffect, useState, type FormEvent } from 'react';

import {
  fetchAuthConfig,
  login,
  register,
  type CurrentUser,
} from './api';
import './LoginPage.css';

type Props = {
  onLogin: (user: CurrentUser) => void;
};

const MIN_PASSWORD_LENGTH = 12;

function LoginPage({ onLogin }: Props) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [registrationEnabled, setRegistrationEnabled] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordRepeat, setPasswordRepeat] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchAuthConfig()
      .then((config) => setRegistrationEnabled(config.registrationEnabled))
      .catch(() => setRegistrationEnabled(false));
  }, []);

  const isRegister = mode === 'register';

  const switchMode = () => {
    setMode(isRegister ? 'login' : 'register');
    setError('');
    setPassword('');
    setPasswordRepeat('');
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');

    if (isRegister && password !== passwordRepeat) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);

    try {
      const user = isRegister
        ? await register(email, password)
        : await login(email, password);

      setPassword('');
      setPasswordRepeat('');
      onLogin(user);
    } catch (authError) {
      setError(
        authError instanceof Error ? authError.message : 'Something went wrong',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login">
      <form className="login__card" onSubmit={handleSubmit}>
        <div className="brand login__brand">
          <div className="brand__mark">F</div>
          <div>
            <strong>Family Finance</strong>
            <span>Private dashboard</span>
          </div>
        </div>

        <h1 className="login__title">
          {isRegister ? 'Create account' : 'Sign in'}
        </h1>

        <label className="login__field">
          <span>Email</span>
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoFocus
          />
        </label>

        <label className="login__field">
          <span>Password</span>
          <input
            type="password"
            autoComplete={isRegister ? 'new-password' : 'current-password'}
            minLength={isRegister ? MIN_PASSWORD_LENGTH : undefined}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>

        {isRegister && (
          <>
            <label className="login__field">
              <span>Repeat password</span>
              <input
                type="password"
                autoComplete="new-password"
                value={passwordRepeat}
                onChange={(event) => setPasswordRepeat(event.target.value)}
                required
              />
            </label>

            <p className="login__hint">
              At least {MIN_PASSWORD_LENGTH} characters. A phrase of a few
              words is easy to remember and hard to guess.
            </p>
          </>
        )}

        {error && (
          <p className="login__error" role="alert">
            {error}
          </p>
        )}

        <button
          className="sync__button login__submit"
          type="submit"
          disabled={loading}
        >
          {loading
            ? isRegister
              ? 'Creating…'
              : 'Signing in…'
            : isRegister
              ? 'Create account'
              : 'Sign in'}
        </button>

        {registrationEnabled && (
          <button type="button" className="login__switch" onClick={switchMode}>
            {isRegister
              ? 'Already have an account? Sign in'
              : 'No account yet? Create one'}
          </button>
        )}
      </form>
    </div>
  );
}

export default LoginPage;
