import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './ui/App.jsx';
import PasswordGate from './ui/PasswordGate.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <PasswordGate>
      <App />
    </PasswordGate>
  </React.StrictMode>
);
