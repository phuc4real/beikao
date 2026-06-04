import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './app/App';
// Be Vietnam Pro carries ALL Vietnamese text (correct stacked diacritics);
// Playfair Display is for the Latin "BEIKAO" wordmark only.
import '@fontsource/be-vietnam-pro/400.css';
import '@fontsource/be-vietnam-pro/600.css';
import '@fontsource/be-vietnam-pro/700.css';
import '@fontsource/be-vietnam-pro/800.css';
import '@fontsource/be-vietnam-pro/900.css';
import '@fontsource/playfair-display/latin-800.css'; // wordmark is Latin-only
import './index.css';
import './styles/theme.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
