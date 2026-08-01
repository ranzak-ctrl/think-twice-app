// Decision board — rendered by code from state.board (built in stage 7).
// The model never renders this table; it only reports the rows as data.

export default function DecisionBoard({ board }) {
  if (!board?.length) return null;
  return (
    <div className="board">
      <table>
        <thead>
          <tr>
            <th>אפשרות</th>
            <th>יתרון</th>
            <th>חיסרון</th>
          </tr>
        </thead>
        <tbody>
          {board.map((row, i) => (
            <tr key={i}>
              <td>{row.option}</td>
              <td>{row.pro}</td>
              <td>{row.con}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
