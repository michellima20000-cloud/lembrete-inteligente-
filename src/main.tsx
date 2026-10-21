import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Register companion Service Worker for persistent background alarms & web notifications
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw-custom.js', { scope: '/' })
      .then((reg) => {
        // Force update check
        reg.update().catch(() => {});
      })
      .catch((err) => {
        console.warn('Service Worker registration note:', err);
      });
  });
}

createRoot(document.getElementById('root')!).render(<App />);

