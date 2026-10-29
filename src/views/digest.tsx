import type { DigestRow, Night } from '../digest/index.js';

// Missing data is a dash, never an empty cell (styleguide).
const dash = (v: string | null | undefined) => (v === null || v === undefined || v === '' ? '—' : v);

// A retry count of 3 or more, or any failed job, is flagged.
export const isFlagged = (row: DigestRow) => row.retries >= 3 || row.lastStatus === 'fail';

function Flag({ row }: { row: DigestRow }) {
  if (row.lastStatus === 'fail') return <span class="warn">fail</span>;
  if (row.retries >= 3) return <span class="warn">retries {row.retries}</span>;
  return <span class="mute">—</span>;
}

export function DigestPage({ night }: { night: Night }) {
  return (
    <>
      <h1>digest · {night.night}</h1>
      {night.rows.length === 0 ? (
        <p class="mute">nothing ran</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>job</th>
              <th>owner</th>
              <th>runs</th>
              <th>retries</th>
              <th>last</th>
              <th>flag</th>
              <th>last error</th>
              <th>first</th>
              <th>last at</th>
            </tr>
          </thead>
          <tbody>
            {night.rows.map((row) => (
              <tr class={isFlagged(row) ? 'flagged' : undefined}>
                <td>{row.job}</td>
                <td>{dash(row.owner)}</td>
                <td>{row.runs}</td>
                <td>{row.retries}</td>
                <td>{row.lastStatus}</td>
                <td>
                  <Flag row={row} />
                </td>
                <td>{dash(row.lastError)}</td>
                <td>{row.firstAt}</td>
                <td>{row.lastAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {night.badLines > 0 ? <p class="mute">{night.badLines} unreadable line(s) skipped</p> : null}
    </>
  );
}
