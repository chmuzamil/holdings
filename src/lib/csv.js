// A small CSV reader (RFC 4180 plus what spreadsheets really export): quoted
// fields with "" escapes, line breaks inside quotes, a leading BOM, CRLF or
// LF line endings, and comma, semicolon, tab or pipe delimiters.

const DELIMITERS = [',', ';', '\t', '|']

/** Picks the delimiter that splits the first line into the most columns (outside quotes). */
export function detectDelimiter(text) {
  const clean = text.replace(/^\uFEFF/, '')
  let firstLine = ''
  let quoted = false
  for (const char of clean) {
    if (char === '"') quoted = !quoted
    else if ((char === '\n' || char === '\r') && !quoted) break
    firstLine += quoted && char !== '"' ? '' : char
  }
  let best = ','
  let bestCount = 0
  for (const delimiter of DELIMITERS) {
    const count = firstLine.split(delimiter).length - 1
    if (count > bestCount) {
      best = delimiter
      bestCount = count
    }
  }
  return best
}

/** Rows of cells. Empty lines are skipped; cells are not trimmed inside quotes. */
export function parseCsv(text, delimiter = detectDelimiter(text)) {
  const input = text.replace(/^\uFEFF/, '')
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  let wasQuoted = false

  const endCell = () => {
    row.push(wasQuoted ? cell : cell.trim())
    cell = ''
    wasQuoted = false
  }
  const endRow = () => {
    endCell()
    if (row.some((value) => value !== '')) rows.push(row)
    row = []
  }

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]
    if (quoted) {
      if (char === '"') {
        if (input[index + 1] === '"') {
          cell += '"'
          index += 1
        } else {
          quoted = false
        }
      } else {
        cell += char
      }
      continue
    }
    if (char === '"' && cell.trim() === '') {
      quoted = true
      wasQuoted = true
      cell = ''
    } else if (char === delimiter) {
      endCell()
    } else if (char === '\r') {
      if (input[index + 1] === '\n') index += 1
      endRow()
    } else if (char === '\n') {
      endRow()
    } else {
      cell += char
    }
  }
  if (cell !== '' || row.length) endRow()
  return rows
}

/** Quotes a value for writing CSV. */
export function csvCell(value) {
  const text = String(value ?? '')
  return /[",\n\r;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}
