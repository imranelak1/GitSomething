import React from 'react';
import ReactDOM from 'react-dom/client';
import { MotionConfig } from 'motion/react';
import '@fontsource/geist/400.css';
import '@fontsource/geist/500.css';
import '@fontsource/geist/600.css';
import '@fontsource/manrope/400.css';
import '@fontsource/manrope/500.css';
import '@fontsource/manrope/600.css';
import '@fontsource/manrope/700.css';
import '@fontsource/manrope/800.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/600.css';
import '@fontsource/space-grotesk/700.css';
import '@fontsource/geist-mono/400.css';
import './styles.css';
import './workspace.css';
import './onboarding-integration.css';
import App from './App';
import { GitHubAuthProvider } from './hooks/useGitHubAuth';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MotionConfig reducedMotion="user">
      <GitHubAuthProvider>
        <App />
      </GitHubAuthProvider>
    </MotionConfig>
  </React.StrictMode>,
);
