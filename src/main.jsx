import React from 'react';
import ReactDOM from 'react-dom/client';
import './ui/styles.css';
import App from './ui/App.jsx';
import PasswordGate from './ui/PasswordGate.jsx';
import InterviewChoice from './ui/InterviewChoice.jsx';
import { interviewChoiceNeeded } from './ui/interview.js';

// The gate wraps the app, and the app can push it back open: a 401 from the proxy
// means the shared password is missing or wrong, and that is a locked door rather
// than a broken model. `locked` is lifted to here so a refusal mid-interview
// reopens the prompt over the conversation instead of leaving the person retrying
// a turn that will never go through.
// On the QA build an address that names no interview gets the choice of the two,
// behind the same password gate (interview.js). The choice is a link, so picking one
// is a new page load, and App is not mounted until an interview is named.
function Root() {
  const [locked, setLocked] = React.useState(false);
  const choosing = interviewChoiceNeeded(window.location.search);
  return (
    <PasswordGate locked={locked} onUnlock={() => setLocked(false)}>
      {choosing ? <InterviewChoice search={window.location.search} /> : <App onUnauthorized={() => setLocked(true)} />}
    </PasswordGate>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
