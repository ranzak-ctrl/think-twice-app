import React from 'react';
import ReactDOM from 'react-dom/client';
import './ui/styles.css';
import App from './ui/App.jsx';
import PasswordGate from './ui/PasswordGate.jsx';

// The gate wraps the app, and the app can push it back open: a 401 from the proxy
// means the shared password is missing or wrong, and that is a locked door rather
// than a broken model. `locked` is lifted to here so a refusal mid-interview
// reopens the prompt over the conversation instead of leaving the person retrying
// a turn that will never go through.
function Root() {
  const [locked, setLocked] = React.useState(false);
  return (
    <PasswordGate locked={locked} onUnlock={() => setLocked(false)}>
      <App onUnauthorized={() => setLocked(true)} />
    </PasswordGate>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
