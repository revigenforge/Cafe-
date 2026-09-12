import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import App from './App.jsx';
import { AppProvider } from './context/AppContext.jsx';
import { ToastProvider } from './components/ui.jsx';
import { IS_DEMO } from './api/client.js';
import './styles/app.css';

/* The demo ships as one file that has to work from a static host or
   straight off disk. The History API throws on file:// origins, and a
   static host would 404 on /leads without a rewrite rule, so the demo
   routes through the hash. The real app keeps clean paths. */
const Router = IS_DEMO ? HashRouter : BrowserRouter;

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Router>
      <ToastProvider>
        <AppProvider>
          <App />
        </AppProvider>
      </ToastProvider>
    </Router>
  </React.StrictMode>
);
