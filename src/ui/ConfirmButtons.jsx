export default function ConfirmButtons({ onConfirm, onReject }) {
  return (
    <div
      style={{
        borderTop: '1px solid #e0e0e0',
        padding: '12px 20px',
        display: 'flex',
        gap: 10,
        justifyContent: 'center',
        background: '#fffbf0',
      }}
    >
      <span style={{ alignSelf: 'center', fontSize: 14, color: '#555' }}>
        הסיכום מדויק?
      </span>
      <button
        onClick={onConfirm}
        style={{
          background: '#1a7a3c',
          color: '#fff',
          border: 'none',
          borderRadius: 8,
          padding: '8px 20px',
          fontSize: 15,
          cursor: 'pointer',
        }}
      >
        מדויק ✓
      </button>
      <button
        onClick={onReject}
        style={{
          background: '#fff',
          color: '#1a1a1a',
          border: '1px solid #ccc',
          borderRadius: 8,
          padding: '8px 20px',
          fontSize: 15,
          cursor: 'pointer',
        }}
      >
        רוצה לתקן
      </button>
    </div>
  );
}
