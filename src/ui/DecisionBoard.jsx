// Decision board — rendered by code from state.board (built in stage 8).
// The model never renders this table; it only reports the rows as data.

export default function DecisionBoard({ board }) {
  if (!board?.length) return null;
  return (
    <div style={{ padding: '8px 20px' }}>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: 14,
          background: '#fff',
          border: '1px solid #e0e0e0',
          borderRadius: 8,
          overflow: 'hidden',
        }}
      >
        <thead>
          <tr style={{ background: '#f3f3f3' }}>
            <th style={thStyle}>אפשרות</th>
            <th style={thStyle}>יתרון</th>
            <th style={thStyle}>חיסרון</th>
          </tr>
        </thead>
        <tbody>
          {board.map((row, i) => (
            <tr key={i} style={{ borderTop: '1px solid #eee' }}>
              <td style={{ ...tdStyle, fontWeight: 'bold' }}>{row.option}</td>
              <td style={tdStyle}>{row.pro}</td>
              <td style={tdStyle}>{row.con}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const thStyle = { textAlign: 'right', padding: '8px 12px', fontWeight: 'bold', color: '#333' };
const tdStyle = { textAlign: 'right', padding: '8px 12px', color: '#333', verticalAlign: 'top' };
