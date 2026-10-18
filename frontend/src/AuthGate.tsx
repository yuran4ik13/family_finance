import { useCallback, useEffect, useState } from 'react';

import App from './App';
import {
  AuthContext,
  fetchCurrentUser,
  logout,
  UNAUTHORIZED_EVENT,
  type CurrentUser,
} from './api';
import LoginPage from './LoginPage';

// Shows the login screen until the backend confirms the user is logged in
function AuthGate() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    fetchCurrentUser()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setChecking(false));
  }, []);

  // Any 401 from the API (session expired) sends the user back to login
  useEffect(() => {
    const handleUnauthorized = () => setUser(null);

    window.addEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);

    return () =>
      window.removeEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
  }, []);

  const handleLogout = useCallback(() => {
    void logout().finally(() => setUser(null));
  }, []);

  if (checking) {
    return null;
  }

  if (!user) {
    return <LoginPage onLogin={setUser} />;
  }

  return (
    <AuthContext.Provider value={{ user, onLogout: handleLogout }}>
      <App />
    </AuthContext.Provider>
  );
}

export default AuthGate;
