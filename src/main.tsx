import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

const simple = !/^\/pro\/?$/.test(window.location.pathname);
if (simple) document.title = 'Fincept Simple';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App simple={simple} />
  </React.StrictMode>
);

