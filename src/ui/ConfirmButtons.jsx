import { Check, Pencil } from './icons.jsx';

// One of only two decision points the UI ever shows the user (the other is the
// stage-7 decision). It confirms a summary — it never offers navigation.
export default function ConfirmButtons({ onConfirm, onReject }) {
  return (
    <div className="confirm">
      <div className="confirm-inner">
        <span className="confirm-label">הסיכום מדויק?</span>
        <button className="btn btn-ok" onClick={onConfirm}>
          <Check />
          מדויק
        </button>
        <button className="btn" onClick={onReject}>
          <Pencil />
          רוצה לתקן
        </button>
      </div>
    </div>
  );
}
