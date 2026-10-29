import React from 'react';
import ReactDOM from 'react-dom/client';
import { AppProviders } from './app/providers/app-providers.js';
import { AppRouter } from './app/router/app-router.js';
import './styles/index.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Failed to find root DOM element');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <AppProviders>
      <AppRouter />
    </AppProviders>
  </React.StrictMode>,
);
