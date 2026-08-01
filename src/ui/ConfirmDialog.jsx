import { useEffect, useRef } from 'react';

// Small modal for destructive actions. Escape and backdrop click both cancel.
export default function ConfirmDialog({ title, body, actions, onClose }) {
  const cardRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    cardRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        tabIndex={-1}
        ref={cardRef}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="dialog-title">{title}</h2>
        <p>{body}</p>
        <div className="dialog-actions">{actions}</div>
      </div>
    </div>
  );
}
