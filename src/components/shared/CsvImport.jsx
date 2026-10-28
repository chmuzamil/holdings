import { useRef, useState } from 'react'
import { Download, Upload } from 'lucide-react'
import { parseCsv } from '../../lib/csv'
import { countLabel, guessMapping, IMPORT_TYPES, previewImport, templateCsv } from '../../lib/csv-import'
import { download } from '../../lib/download'

const SHOWN_ROWS = 100
const STATUS_LABEL = { add: 'Will add', duplicate: 'Already here', 'duplicate-in-file': 'Twice in file', invalid: 'Problem' }

// Column choices are remembered for this browser session, per file layout.
const mappingKey = (type, headers) => `holdings-csv-mapping:${type}:${headers.join('|')}`
function rememberedMapping(type, headers) {
  try {
    const saved = JSON.parse(sessionStorage.getItem(mappingKey(type, headers)) || 'null')
    return saved && typeof saved === 'object' ? saved : null
  } catch {
    return null
  }
}
function rememberMapping(type, headers, mapping) {
  try {
    sessionStorage.setItem(mappingKey(type, headers), JSON.stringify(mapping))
  } catch {
    // Not important if the browser won't store it.
  }
}

/** Import domains, subscriptions or servers from a spreadsheet, parsed in this browser. */
export function CsvImport({ records, onImport }) {
  const [type, setType] = useState('domains')
  const [file, setFile] = useState(null)
  const [mapping, setMapping] = useState({})
  const [message, setMessage] = useState({ tone: '', text: '' })
  const input = useRef(null)

  const { fields } = IMPORT_TYPES[type]
  const preview = file ? previewImport(file.rows, mapping, type, records[type] ?? []) : null

  async function choose(chosen) {
    if (!chosen) return
    setMessage({ tone: '', text: '' })
    try {
      const [headers = [], ...rows] = parseCsv(await chosen.text())
      if (!rows.length) throw new Error('The file has a header row but no data.')
      setFile({ name: chosen.name, headers, rows })
      setMapping(rememberedMapping(type, headers) ?? guessMapping(headers, type))
    } catch (error) {
      setFile(null)
      setMessage({ tone: 'error', text: `Couldn't read that file: ${error.message}` })
    }
  }

  function changeType(next) {
    setType(next)
    if (file) setMapping(rememberedMapping(next, file.headers) ?? guessMapping(file.headers, next))
  }

  function updateMapping(key, column) {
    const next = { ...mapping, [key]: Number(column) }
    setMapping(next)
    rememberMapping(type, file.headers, next)
  }

  function confirm() {
    const toAdd = preview.rows.filter((row) => row.status === 'add').map((row) => row.record)
    onImport(type, toAdd)
    setMessage({ tone: 'ok', text: `Added ${countLabel(type, toAdd.length)}. Skipped ${preview.summary.duplicate} already here and ${preview.summary.invalid} with problems.` })
    setFile(null)
  }

  return (
    <div className="panel settings-wide">
      <div className="panel-heading">
        <h2>Import from a spreadsheet (CSV)</h2>
        <p>
          Add domains, subscriptions or servers from a CSV file. It is read in this browser; nothing is uploaded. You see
          every row before anything is added. Costs are in US dollars and dates as YYYY-MM-DD.
        </p>
      </div>

      <div className="settings-form account-form">
        <label>
          <span>What&apos;s in the file</span>
          <select value={type} onChange={(event) => changeType(event.target.value)}>
            {Object.entries(IMPORT_TYPES).map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}
          </select>
        </label>
        <div className="settings-actions notify-actions">
          <button className="primary-button" type="button" onClick={() => input.current?.click()}>
            <Upload size={16} />
            Choose CSV file
          </button>
          <button className="ghost-button" type="button" onClick={() => download(`holdings-${type}-template.csv`, templateCsv(type), 'text/csv')}>
            <Download size={16} />
            Download template
          </button>
        </div>
        <input
          ref={input}
          type="file"
          accept=".csv,text/csv"
          hidden
          onChange={(event) => {
            choose(event.target.files?.[0])
            event.target.value = ''
          }}
        />
      </div>

      {file && preview && (
        <div className="csv-wizard">
          <h3 className="section-title">1. Match the columns in {file.name}</h3>
          <div className="settings-form account-form">
            {fields.map((field) => (
              <label key={field.key}>
                <span>{field.label}{field.required ? ' (needed)' : ''}</span>
                <select value={mapping[field.key] ?? -1} onChange={(event) => updateMapping(field.key, event.target.value)}>
                  <option value={-1}>Not in the file</option>
                  {file.headers.map((header, column) => <option key={column} value={column}>{header || `Column ${column + 1}`}</option>)}
                </select>
              </label>
            ))}
          </div>

          <h3 className="section-title">2. Check the rows</h3>
          <p className="settings-status" role="status">
            Will add <strong>{preview.summary.add}</strong>, skip <strong>{preview.summary.duplicate}</strong> already here,
            and leave out <strong>{preview.summary.invalid}</strong> with problems.
          </p>
          <div className="csv-table-wrap">
            <table className="csv-table">
              <thead>
                <tr>
                  <th scope="col">Line</th>
                  <th scope="col">{fields[0].label}</th>
                  <th scope="col">Result</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.slice(0, SHOWN_ROWS).map((row) => (
                  <tr key={row.line} className={`csv-${row.status}`}>
                    <td>{row.line}</td>
                    <td>{row.raw.name || '—'}</td>
                    <td>
                      <strong>{STATUS_LABEL[row.status]}</strong>
                      {row.errors.map((error) => <div key={error}>{error}</div>)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.rows.length > SHOWN_ROWS && <p className="settings-status">Showing the first {SHOWN_ROWS} of {preview.rows.length} rows; the counts above cover all of them.</p>}

          <div className="settings-actions">
            <button className="primary-button" type="button" disabled={!preview.summary.add} onClick={confirm}>
              {preview.summary.add ? `Add ${countLabel(type, preview.summary.add)}` : 'Nothing to add'}
            </button>
            <button className="ghost-button" type="button" onClick={() => setFile(null)}>Cancel</button>
          </div>
        </div>
      )}
      {message.text && <p className={message.tone === 'error' ? 'auth-error' : 'settings-status'} role={message.tone === 'error' ? 'alert' : 'status'}>{message.text}</p>}
    </div>
  )
}
