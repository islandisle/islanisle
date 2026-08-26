import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { initTheme } from './theme';
import { startAutoRetry } from './offlineQueue';
import { markBookingFulfilledRaw, markOrderStatusRaw } from './api/client';
import './styles/theme.css';

initTheme();

// Offline support — see public/sw.js (cached viewing) and offlineQueue.js
// (queue-and-retry for "mark fulfilled" / order status) for the two
// halves. Optional progressive enhancement: if service worker
// registration fails, the app just runs without offline caching.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
startAutoRetry({
  markBookingFulfilled: (payload) => markBookingFulfilledRaw(payload.bookingId, payload.paymentCollected),
  markOrderStatus: (payload) => markOrderStatusRaw(payload.orderId, payload.status, payload.paymentCollected),
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
