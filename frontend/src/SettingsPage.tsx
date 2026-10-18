import { useEffect, useState, type FormEvent } from 'react';

import { apiFetch, errorMessage, useAuth } from './api';
import './SettingsPage.css';

type Settings = {
  email: string;
  role: 'OWNER' | 'USER' | 'DEMO';
  createdAt: string;
  monobankConnected: boolean;
  transferMarkers: string;
  familyIncomeMarkers: string;
};

type SecurityEvent = {
  event: string;
  ip: string | null;
  createdAt: string;
};

const EVENT_LABELS: Record<string, string> = {
  register: 'Account created',
  login_success: 'Signed in',
  login_failed: 'Failed sign-in attempt',
  logout_all: 'Signed out on all devices',
  password_changed: 'Password changed',
  monobank_connected: 'Monobank connected',
  monobank_removed: 'Monobank disconnected',
  data_exported: 'Data downloaded',
};

type Props = {
  onBankConnectionChange: (connected: boolean) => void;
};

function Status({ message }: { message: { text: string; ok: boolean } | null }) {
  if (!message) {
    return null;
  }

  return (
    <p
      className={`settings__status ${message.ok ? 'settings__status--ok' : 'settings__status--error'}`}
      role={message.ok ? 'status' : 'alert'}
    >
      {message.text}
    </p>
  );
}

function SettingsPage({ onBankConnectionChange }: Props) {
  const { user, onLogout } = useAuth();
  const readOnly = user.role === 'DEMO';

  const [settings, setSettings] = useState<Settings | null>(null);
  const [events, setEvents] = useState<SecurityEvent[]>([]);

  const [token, setToken] = useState('');
  const [bankBusy, setBankBusy] = useState(false);
  const [bankStatus, setBankStatus] = useState<{ text: string; ok: boolean } | null>(null);

  const [transferMarkers, setTransferMarkers] = useState('');
  const [familyIncomeMarkers, setFamilyIncomeMarkers] = useState('');
  const [rulesStatus, setRulesStatus] = useState<{ text: string; ok: boolean } | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordStatus, setPasswordStatus] = useState<{ text: string; ok: boolean } | null>(null);

  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleteStatus, setDeleteStatus] = useState<{ text: string; ok: boolean } | null>(null);

  const loadSecurityLog = async () => {
    const response = await apiFetch('/api/settings/security-log');

    if (response.ok) {
      setEvents(await response.json());
    }
  };

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const response = await apiFetch('/api/settings');

      if (!response.ok || cancelled) {
        return;
      }

      const data: Settings = await response.json();

      setSettings(data);
      setTransferMarkers(data.transferMarkers);
      setFamilyIncomeMarkers(data.familyIncomeMarkers);
      await loadSecurityLog();
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const setBankConnected = (connected: boolean) => {
    setSettings((current) =>
      current ? { ...current, monobankConnected: connected } : current,
    );
    onBankConnectionChange(connected);
  };

  const connectBank = async (event: FormEvent) => {
    event.preventDefault();
    setBankBusy(true);
    setBankStatus({ text: 'Checking the token with Monobank…', ok: true });

    try {
      const response = await apiFetch('/api/settings/monobank', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.trim() }),
      });

      if (!response.ok) {
        setBankStatus({ text: await errorMessage(response, 'Could not save the token'), ok: false });
        return;
      }

      setToken('');
      setBankConnected(true);
      setBankStatus({ text: 'Monobank connected. Press "Sync Monobank" to load your data.', ok: true });
      await loadSecurityLog();
    } catch {
      setBankStatus({ text: 'Could not reach the server. Check your connection.', ok: false });
    } finally {
      setBankBusy(false);
    }
  };

  const disconnectBank = async () => {
    if (!window.confirm('Disconnect Monobank? Already loaded transactions stay.')) {
      return;
    }

    setBankBusy(true);

    try {
      const response = await apiFetch('/api/settings/monobank', { method: 'DELETE' });

      if (response.ok) {
        setBankConnected(false);
        setBankStatus({ text: 'Monobank disconnected. The token was deleted.', ok: true });
        await loadSecurityLog();
      }
    } catch {
      setBankStatus({ text: 'Could not reach the server. Check your connection.', ok: false });
    } finally {
      setBankBusy(false);
    }
  };

  const saveRules = async (event: FormEvent) => {
    event.preventDefault();

    const response = await apiFetch('/api/settings/markers', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transferMarkers, familyIncomeMarkers }),
    });

    setRulesStatus(
      response.ok
        ? { text: 'Saved. Use "Recategorize" on the Rules page to apply to old transactions.', ok: true }
        : { text: await errorMessage(response, 'Could not save'), ok: false },
    );
  };

  const changePassword = async (event: FormEvent) => {
    event.preventDefault();

    const response = await apiFetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword }),
    });

    if (response.ok) {
      setCurrentPassword('');
      setNewPassword('');
      setPasswordStatus({ text: 'Password changed. Other devices were signed out.', ok: true });
      await loadSecurityLog();
    } else {
      setPasswordStatus({ text: await errorMessage(response, 'Could not change password'), ok: false });
    }
  };

  const logoutEverywhere = async () => {
    if (!window.confirm('Sign out on all devices, including this one?')) {
      return;
    }

    await apiFetch('/api/auth/logout-all', { method: 'POST' });
    onLogout();
  };

  const downloadData = async () => {
    const response = await apiFetch('/api/account/export');

    if (!response.ok) {
      window.alert(await errorMessage(response, 'Export failed'));
      return;
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = 'family-finance-export.json';
    link.click();
    URL.revokeObjectURL(url);
    await loadSecurityLog();
  };

  const deleteAccount = async (event: FormEvent) => {
    event.preventDefault();

    if (!window.confirm('Delete your account and ALL your data forever? This cannot be undone.')) {
      return;
    }

    const response = await apiFetch('/api/account', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: deletePassword, confirm: deleteConfirm }),
    });

    if (response.ok) {
      onLogout();
    } else {
      setDeleteStatus({ text: await errorMessage(response, 'Could not delete the account'), ok: false });
    }
  };

  if (!settings) {
    return <section className="page-section">Loading…</section>;
  }

  return (
    <div className="settings">
      {readOnly && (
        <p className="settings__notice">
          This is a read-only demo account: settings can be viewed but not changed.
        </p>
      )}

      {/* ---------- BANK ---------- */}
      <section className="page-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Bank connection</span>
            <h2>Monobank</h2>
            <p>
              Your personal token lets the app read your statement. It is
              stored encrypted and is never shown again, not even to you.
            </p>
          </div>

          <span
            className={`settings__badge ${settings.monobankConnected ? 'settings__badge--ok' : ''}`}
          >
            {settings.monobankConnected ? 'Connected' : 'Not connected'}
          </span>
        </div>

        <form className="settings__row" onSubmit={connectBank}>
          <input
            className="rule-form__input settings__grow"
            type="password"
            autoComplete="off"
            placeholder={settings.monobankConnected ? 'Paste a new token to replace it' : 'Paste your token'}
            value={token}
            onChange={(event) => setToken(event.target.value)}
            disabled={readOnly || bankBusy}
            required
          />
          <button className="rule-form__button" disabled={readOnly || bankBusy || !token.trim()}>
            {settings.monobankConnected ? 'Replace' : 'Connect'}
          </button>
          {settings.monobankConnected && (
            <button
              type="button"
              className="settings__danger-link"
              onClick={() => void disconnectBank()}
              disabled={readOnly || bankBusy}
            >
              Disconnect
            </button>
          )}
        </form>

        <p className="settings__help">
          Get a token at{' '}
          <a href="https://api.monobank.ua" target="_blank" rel="noopener noreferrer">
            api.monobank.ua
          </a>
          . It can only read your statement, it can't move money.
        </p>

        <Status message={bankStatus} />
      </section>

      {/* ---------- PERSONAL RULES ---------- */}
      <section className="page-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Categorization</span>
            <h2>Personal rules</h2>
            <p>
              Words that appear in your transfers, comma separated. Only you
              see them; they help the app sort your transactions.
            </p>
          </div>
        </div>

        <form className="settings__stack" onSubmit={saveRules}>
          <label className="settings__label">
            Transfers between my own cards / family
            <input
              className="rule-form__input"
              placeholder="від: Your Name, from: Partner"
              value={transferMarkers}
              maxLength={1000}
              onChange={(event) => setTransferMarkers(event.target.value)}
              disabled={readOnly}
            />
          </label>

          <label className="settings__label">
            Income from family
            <input
              className="rule-form__input"
              placeholder="від: Mom"
              value={familyIncomeMarkers}
              maxLength={1000}
              onChange={(event) => setFamilyIncomeMarkers(event.target.value)}
              disabled={readOnly}
            />
          </label>

          <div>
            <button className="rule-form__button" disabled={readOnly}>
              Save rules
            </button>
          </div>
        </form>

        <Status message={rulesStatus} />
      </section>

      {/* ---------- SECURITY ---------- */}
      <section className="page-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Security</span>
            <h2>Password &amp; sessions</h2>
            <p>Signed in as {settings.email}</p>
          </div>
        </div>

        <form className="settings__row" onSubmit={changePassword}>
          <input
            className="rule-form__input settings__grow"
            type="password"
            autoComplete="current-password"
            placeholder="Current password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            disabled={readOnly}
            required
          />
          <input
            className="rule-form__input settings__grow"
            type="password"
            autoComplete="new-password"
            placeholder="New password (12+ characters)"
            minLength={12}
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            disabled={readOnly}
            required
          />
          <button className="rule-form__button" disabled={readOnly}>
            Change password
          </button>
        </form>

        <Status message={passwordStatus} />

        <button
          type="button"
          className="settings__secondary"
          onClick={() => void logoutEverywhere()}
          disabled={readOnly}
        >
          Sign out on all devices
        </button>

        <h3 className="settings__subheading">Recent activity</h3>
        <p className="settings__help">
          If you see a sign-in you don't recognise, change your password.
        </p>

        <div className="settings__log">
          {events.length === 0 && <p className="settings__help">No events yet.</p>}
          {events.map((event, index) => (
            <div
              className={`settings__log-row ${event.event === 'login_failed' ? 'settings__log-row--warn' : ''}`}
              key={`${event.createdAt}-${index}`}
            >
              <span>{EVENT_LABELS[event.event] ?? event.event}</span>
              <span className="settings__muted">{event.ip ?? ''}</span>
              <span className="settings__muted">
                {new Date(event.createdAt).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- MY DATA ---------- */}
      <section className="page-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Your data</span>
            <h2>Download or delete</h2>
            <p>
              Your data belongs to you. Download a full copy at any time, or
              delete your account together with everything stored about you.
            </p>
          </div>
        </div>

        <button
          type="button"
          className="settings__secondary"
          onClick={() => void downloadData()}
        >
          Download all my data (JSON)
        </button>

        <form className="settings__danger-zone" onSubmit={deleteAccount}>
          <h3 className="settings__subheading">Delete account</h3>
          <p className="settings__help">
            Deletes your account, cards, transactions, rules and bank token
            forever. Type <strong>DELETE</strong> and your password to confirm.
          </p>

          <div className="settings__row">
            <input
              className="rule-form__input settings__grow"
              placeholder="Type DELETE"
              value={deleteConfirm}
              onChange={(event) => setDeleteConfirm(event.target.value)}
              disabled={readOnly}
              required
            />
            <input
              className="rule-form__input settings__grow"
              type="password"
              autoComplete="current-password"
              placeholder="Your password"
              value={deletePassword}
              onChange={(event) => setDeletePassword(event.target.value)}
              disabled={readOnly}
              required
            />
            <button
              className="settings__danger-button"
              disabled={readOnly || deleteConfirm !== 'DELETE' || !deletePassword}
            >
              Delete forever
            </button>
          </div>

          <Status message={deleteStatus} />
        </form>
      </section>
    </div>
  );
}

export default SettingsPage;
