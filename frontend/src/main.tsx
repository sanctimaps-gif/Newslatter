import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import { IS_GOOGLE } from './services/google';
import App from './App';
import './styles/index.css';

createRoot(document.getElementById('root')!).render(
  // Sur GitHub Pages, le routage passe par « # » : toutes les pages s'ouvrent sans réglage serveur.
  <StrictMode>{IS_GOOGLE ? <HashRouter><App /></HashRouter> : <BrowserRouter><App /></BrowserRouter>}</StrictMode>,
);
