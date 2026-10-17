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
import './theme.css';
import './teaching.css';
import './navigation.css';
import './workspace-layout.css';
import App from './App';
import { GitHubAuthProvider } from './hooks/useGitHubAuth';
import { ActivityProvider } from './hooks/useActivity';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MotionConfig reducedMotion="user">
      <ActivityProvider>
        <GitHubAuthProvider>
          <App />
        </GitHubAuthProvider>
      </ActivityProvider>
    </MotionConfig>
  </React.StrictMode>,
);
