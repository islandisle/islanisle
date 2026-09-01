import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/theme.css';

// No initTheme() here (unlike frontend-tourist): this page has no manual
// light/dark toggle, so theme.css's prefers-color-scheme media queries are
// enough on their own — nothing needs to set data-theme on <html>.

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
