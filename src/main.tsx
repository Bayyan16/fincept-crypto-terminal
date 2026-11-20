import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

function isSimpleRoute() {
  return !/^\/pro\/?$/.test(window.location.pathname);
}

function FinceptApp() {
  const [simple, setSimple] = React.useState(isSimpleRoute);

  React.useEffect(() => {
    const handleHistoryChange = () => setSimple(isSimpleRoute());
    window.addEventListener('popstate', handleHistoryChange);
    return () => window.removeEventListener('popstate', handleHistoryChange);
  }, []);

  React.useEffect(() => {
    document.title = simple ? 'Fincept Simple' : 'Fincept Pro';
  }, [simple]);

  const changeEdition = (nextSimple: boolean) => {
    window.history.pushState(null, '', nextSimple ? '/' : '/pro/');
    setSimple(nextSimple);
  };

  return <App simple={simple} onEditionChange={changeEdition} />;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <FinceptApp />
  </React.StrictMode>
);
