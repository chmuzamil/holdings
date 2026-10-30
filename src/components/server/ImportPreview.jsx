import { useState } from 'react'

const RESULT = { add: 'Will add', update: 'Will update', same: 'Up to date', invalid: 'Left out' }
const actionable = (row) => row.status === 'add' || row.status === 'update'

/** The preview table for an import: one row per domain or server, with a checkbox for each change. */
export function ImportPreview({ rows, emptyText, nameLabel = 'Domain', onConfirm, onCancel }) {
  const [chosen, setChosen] = useState(() => Object.fromEntries(rows.map((row) => [row.key ?? row.name, actionable(row)])))
  const selected = rows.filter((row) => chosen[row.key ?? row.name] && actionable(row))

  return (
    <div className="csv-wizard">
      {rows.length === 0 ? <p className="settings-status">{emptyText}</p> : (
        <div className="csv-table-wrap">
          <table className="csv-table">
            <thead>
              <tr>
                <th scope="col"><span className="sr-only">Include</span></th>
                <th scope="col">{nameLabel}</th>
                <th scope="col">Result</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key ?? row.name} className={`csv-${row.status === 'invalid' ? 'invalid' : actionable(row) ? 'add' : 'duplicate'}`}>
                  <td>
                    {actionable(row) && (
                      <input
                        type="checkbox"
                        checked={Boolean(chosen[row.key ?? row.name])}
                        onChange={(event) => setChosen((current) => ({ ...current, [row.key ?? row.name]: event.target.checked }))}
                        aria-label={`Include ${row.name}`}
                      />
                    )}
                  </td>
                  <td>{row.name}</td>
                  <td><strong>{RESULT[row.status]}</strong>{row.changes.length > 0 && <div>{row.changes.join(', ')}</div>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="settings-actions">
        <button className="primary-button" type="button" disabled={!selected.length} onClick={() => onConfirm(selected)}>
          {selected.length ? `Import ${selected.length}` : 'Nothing to import'}
        </button>
        <button className="ghost-button" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}
