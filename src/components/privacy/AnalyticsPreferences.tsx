import { useId, useRef, useState, useSyncExternalStore } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import {
  getAnalyticsMode,
  setAnalyticsMode,
  subscribeAnalyticsMode,
  analyticsConfigured,
  type AnalyticsMode,
} from '@/lib/analytics';
import { Button } from '../ui/button';
import './analytics-preferences.css';

interface AnalyticsPreferencesProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountLogin?: string;
}

interface SharingOption {
  value: AnalyticsMode;
  title: string;
  description: string;
}

export function AnalyticsPreferences({
  open,
  onOpenChange,
  accountLogin,
}: AnalyticsPreferencesProps) {
  const mode = useSyncExternalStore<AnalyticsMode>(
    subscribeAnalyticsMode,
    getAnalyticsMode,
    () => 'off',
  );
  const optionId = useId();
  const returnFocus = useRef<HTMLElement | null>(null);
  const selectedRadio = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState('');
  const login = accountLogin?.trim();
  const options: SharingOption[] = [
    {
      value: 'off',
      title: 'Off',
      description: 'Do not send usage analytics from this device. This is the default.',
    },
    {
      value: 'anonymous',
      title: 'Anonymous usage',
      description: 'Share action counts and app version without your GitHub username.',
    },
    {
      value: 'identified',
      title: 'Usage with GitHub username',
      description: login
        ? `Include your public GitHub username, @${login}, with usage events.`
        : 'Your username is included only after GitHub sign-in.',
    },
  ];

  function changeMode(next: AnalyticsMode) {
    try {
      setAnalyticsMode(next);
      setError('');
    } catch {
      setError("We couldn't update this preference. Choose an option again.");
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="analytics-preferences-overlay" />
        <Dialog.Content
          className="analytics-preferences-dialog"
          onOpenAutoFocus={(event) => {
            const active = document.activeElement;
            returnFocus.current =
              active instanceof HTMLElement && active !== document.body ? active : null;
            event.preventDefault();
            selectedRadio.current?.focus({ preventScroll: true });
          }}
          onCloseAutoFocus={(event) => {
            const target = returnFocus.current?.isConnected
              ? returnFocus.current
              : document.querySelector<HTMLElement>('[data-analytics-preferences-trigger]');
            if (target) {
              event.preventDefault();
              target.focus({ preventScroll: true });
            }
          }}
        >
          <header className="analytics-preferences-header">
            <div>
              <Dialog.Title className="analytics-preferences-title">
                Privacy &amp; usage
              </Dialog.Title>
              <Dialog.Description className="analytics-preferences-description">
                Choose whether to share app usage. You can change this anytime.
              </Dialog.Description>
            </div>
            <Dialog.Close
              className="analytics-preferences-close"
              type="button"
              aria-label="Close privacy preferences"
            >
              <X size={18} aria-hidden="true" />
            </Dialog.Close>
          </header>

          <div className="analytics-preferences-body">
            {!analyticsConfigured && (
              <p className="analytics-preferences-unavailable" role="status">
                This build is not configured to send usage analytics. You can still choose a
                preference for this device.
              </p>
            )}

            <fieldset className="analytics-preferences-options">
              <legend className="analytics-preferences-legend">Usage sharing</legend>
              {options.map((option) => {
                const id = `${optionId}-${option.value}`;
                return (
                  <label
                    className="analytics-preferences-option"
                    data-selected={mode === option.value}
                    htmlFor={id}
                    key={option.value}
                  >
                    <input
                      checked={mode === option.value}
                      id={id}
                      name={optionId}
                      onChange={() => changeMode(option.value)}
                      ref={mode === option.value ? selectedRadio : undefined}
                      type="radio"
                      value={option.value}
                      aria-labelledby={`${id}-title`}
                      aria-describedby={`${id}-description`}
                    />
                    <span className="analytics-preferences-option-copy">
                      <span className="analytics-preferences-option-title" id={`${id}-title`}>
                        {option.title}
                      </span>
                      <span
                        className="analytics-preferences-option-description"
                        id={`${id}-description`}
                      >
                        {option.description}
                      </span>
                    </span>
                  </label>
                );
              })}
            </fieldset>

            <section
              className="analytics-preferences-disclosure"
              aria-labelledby={`${optionId}-data`}
            >
              <h3 id={`${optionId}-data`}>What is shared</h3>
              <p>Shared with GitSomething’s maintainers through PostHog in the EU.</p>
              <p>
                Action counts and app version. Only the username option adds your public GitHub
                login.
              </p>
              <p>
                Repository names, paths, code, commit messages, and tokens are not shared. Session
                replay is off.
              </p>
            </section>
            <p className="analytics-preferences-future">
              Changes apply to future events. Turning sharing off does not delete data already
              shared.
            </p>
            {error && (
              <p className="analytics-preferences-error" role="alert">
                {error}
              </p>
            )}
          </div>

          <footer className="analytics-preferences-footer">
            <p>Changes apply immediately.</p>
            <Dialog.Close asChild>
              <Button variant="outline">Done</Button>
            </Dialog.Close>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
