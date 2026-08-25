import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { initTheme } from './theme';
import { startAutoRetry } from './offlineQueue';
import { createBookingRaw, createOrderRaw } from './api/client';
import './styles/theme.css';

initTheme();

// Offline support — see public/sw.js (cached viewing) and offlineQueue.js
// (queue-and-retry for booking/order submissions) for the two halves of
// this. The service worker is optional progressive enhancement: if
// registration fails (unsupported browser, non-HTTPS in some contexts),
// the app just runs without offline caching rather than breaking.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
startAutoRetry({ booking: createBookingRaw, order: createOrderRaw });

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
