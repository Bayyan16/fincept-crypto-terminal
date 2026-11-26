import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { TestnetTradingPanel } from './components/TestnetTradingPanel';

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

const isManagedTestnetRoute = /^\/testnet\/?$/.test(window.location.pathname);
if (isManagedTestnetRoute) document.title = 'Fincept Managed Testnet';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isManagedTestnetRoute
      ? <TestnetTradingPanel onBack={() => window.location.assign('/')} />
      : <FinceptApp />}
  </React.StrictMode>
);
