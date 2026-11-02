import type { Night, DigestRow } from '../digest/types.js';

const dash = (v: string | null) => (v === null || v === '' ? '—' : v);

// Retries of 3 or more and a latest status of `fail` are the two things a morning reader needs
// to see first, so both get the warn class.
function flagged(row: DigestRow) {
  return row.retries >= 3 || row.lastStatus === 'fail';
}

export function DigestPage({ night }: { night: Night }) {
  return (
    <>
      <h1>digest · {night.night}</h1>
      {night.badLines > 0 && <p class="mute">{night.badLines} unreadable line(s) skipped</p>}
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
              <th>fails</th>
              <th>last</th>
              <th>last error</th>
              <th>first at</th>
              <th>last at</th>
            </tr>
          </thead>
          <tbody>
            {night.rows.map((row) => {
              const warn = flagged(row);
              const cls = warn ? 'warn' : undefined;
              return (
                <tr>
                  <td class={cls}>{row.job}</td>
                  <td>{dash(row.owner)}</td>
                  <td>{row.runs}</td>
                  <td class={row.retries >= 3 ? 'warn' : undefined}>{row.retries}</td>
                  <td class={row.fails > 0 ? 'warn' : undefined}>{row.fails}</td>
                  <td class={row.lastStatus === 'fail' ? 'warn' : undefined}>{row.lastStatus}</td>
                  <td>{dash(row.lastError)}</td>
                  <td>{row.firstAt}</td>
                  <td>{row.lastAt}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}
