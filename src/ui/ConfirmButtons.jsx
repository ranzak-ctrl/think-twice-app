import { Check, Pencil } from './icons.jsx';

// One of only two decision points the UI ever shows the user (the other is the
// stage-7 decision). It confirms a summary — it never offers navigation.
//
// `closing`: this summary is the last one — confirming it ends the interview
// (the closing stage, src/core/router.js). The person is told so before they
// press it, not after (router-guard, 16.10.2026).
export default function ConfirmButtons({ onConfirm, onReject, closing = false }) {
  return (
    <div className="confirm">
      <div className="confirm-inner">
        <span className="confirm-label">
          {closing ? 'הסיכום מדויק? אישור יסיים את הראיון.' : 'הסיכום מדויק?'}
        </span>
        <button className="btn btn-ok" onClick={onConfirm}>
          <Check />
          {closing ? 'מדויק, לסיום' : 'מדויק'}
        </button>
        <button className="btn" onClick={onReject}>
          <Pencil />
          רוצה לתקן
        </button>
      </div>
    </div>
  );
}
