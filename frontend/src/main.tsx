import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import { IS_DEMO } from './services/demo';
import App from './App';
import './styles/index.css';

createRoot(document.getElementById('root')!).render(
  // Sur GitHub Pages (démonstration), le routage passe par « # » : toutes les pages s'ouvrent sans serveur.
  <StrictMode>{IS_DEMO ? <HashRouter><App /></HashRouter> : <BrowserRouter><App /></BrowserRouter>}</StrictMode>,
);
