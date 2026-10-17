import { useId, useRef, useState } from 'react';
import { ArrowUpRight, ChevronDown, LoaderCircle } from 'lucide-react';
import { useGitHubAuth } from '@/hooks/useGitHubAuth';
import { Button } from '../ui/button';
import './github-owner-setup.css';

/** This is app configuration, never a personal access token or client secret. */
export function GitHubOwnerSetup({ collapsed = false }: { collapsed?: boolean }) {
  const auth = useGitHubAuth();
  const inputId = useId();
  const hintId = useId();
  const [clientId, setClientId] = useState('');
  const [saving, setSaving] = useState(false);
  const [inputError, setInputError] = useState('');
  const inFlight = useRef(false);

  async function save() {
    if (inFlight.current) return;
    const value = clientId.trim();
    if (!/^[a-zA-Z0-9]{10,128}$/.test(value) || /^[a-fA-F0-9]{40}$/.test(value)) {
      setInputError('Copy the public Client ID from your OAuth App settings on GitHub.');
      return;
    }
    inFlight.current = true;
    setSaving(true);
    setInputError('');
    try {
      if (await auth.configure(value)) setClientId('');
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  const content = (
    <div className="github-owner-setup" role="group" aria-label="Set up GitHub sign-in">
      <h3>Set up GitHub sign-in</h3>
      <p className="github-owner-intro">
        Register GitSomething once as an OAuth App. After that, sign in through your browser.
      </p>
      <ol className="github-owner-steps">
        <li>
          <button
            type="button"
            className="github-owner-register"
            onClick={() => void auth.openSetup()}
          >
            Register GitSomething on GitHub <ArrowUpRight size={14} aria-hidden="true" />
          </button>
          <dl className="github-owner-values">
            <div>
              <dt>Application name</dt>
              <dd>GitSomething</dd>
            </div>
            <div>
              <dt>Homepage URL</dt>
              <dd>https://github.com/imranelak1/GitSomething</dd>
            </div>
            <div>
              <dt>Callback URL</dt>
              <dd>http://127.0.0.1</dd>
            </div>
          </dl>
        </li>
        <li>
          In the app settings, enable <strong>Device Flow</strong>, then copy the{' '}
          <strong>Client ID</strong>.
        </li>
        <li>
          <label htmlFor={inputId}>GitHub OAuth client ID</label>
          <input
            id={inputId}
            value={clientId}
            onChange={(event) => {
              setClientId(event.target.value);
              setInputError('');
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void save();
              }
            }}
            placeholder="Paste your public Client ID"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={128}
            disabled={saving || auth.stage === 'starting'}
            aria-describedby={hintId}
            aria-invalid={Boolean(inputError)}
          />
          <p id={hintId} className="github-owner-hint">
            Use the Client ID, never the client secret. This public setting is saved on this
            computer.
          </p>
          {inputError && (
            <p className="github-owner-input-error" role="alert">
              {inputError}
            </p>
          )}
          <Button
            type="button"
            className="github-signin-button github-owner-save"
            onClick={() => void save()}
            disabled={saving || auth.stage === 'starting' || !clientId.trim()}
          >
            {saving && (
              <LoaderCircle size={15} className="github-auth-spinner" aria-hidden="true" />
            )}
            {saving ? 'Saving GitHub setup…' : 'Save GitHub setup'}
          </Button>
        </li>
      </ol>
    </div>
  );

  return collapsed ? (
    <details className="github-owner-disclosure">
      <summary>
        GitHub app setup <ChevronDown size={14} aria-hidden="true" />
      </summary>
      {content}
    </details>
  ) : (
    content
  );
}
