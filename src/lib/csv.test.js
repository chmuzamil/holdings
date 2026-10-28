import { describe, expect, it } from 'vitest'
import { csvCell, detectDelimiter, parseCsv } from './csv'

describe('parseCsv', () => {
  it('reads simple rows', () => {
    expect(parseCsv('name,cost\nshop.example,12\n')).toEqual([['name', 'cost'], ['shop.example', '12']])
  })

  it('handles quoted fields with commas and escaped quotes', () => {
    expect(parseCsv('name,notes\n"Mail, Inc","Say ""hi"""\n')).toEqual([['name', 'notes'], ['Mail, Inc', 'Say "hi"']])
  })

  it('keeps line breaks inside quoted fields', () => {
    expect(parseCsv('name,notes\nshop.example,"line one\nline two"\nnext.example,x')).toEqual([
      ['name', 'notes'],
      ['shop.example', 'line one\nline two'],
      ['next.example', 'x'],
    ])
  })

  it('strips a BOM and handles CRLF, including inside quotes', () => {
    expect(parseCsv('\uFEFFname,notes\r\nshop.example,"a\r\nb"\r\n')).toEqual([['name', 'notes'], ['shop.example', 'a\r\nb']])
  })

  it('skips empty lines and trims unquoted cells', () => {
    expect(parseCsv('name , cost\n\n  shop.example , 12 \n\n')).toEqual([['name', 'cost'], ['shop.example', '12']])
  })

  it('keeps empty cells and a missing last newline', () => {
    expect(parseCsv('a,b,c\n1,,3')).toEqual([['a', 'b', 'c'], ['1', '', '3']])
  })
})

describe('detectDelimiter', () => {
  it.each([
    ['name,cost\n', ','],
    ['name;cost;renewal\n', ';'],
    ['name\tcost\n', '\t'],
    ['name|cost\n', '|'],
    ['"a;b",c\n', ','],
    ['\uFEFFname;cost\r\n', ';'],
  ])('finds the delimiter in %j', (text, expected) => {
    expect(detectDelimiter(text)).toBe(expected)
  })

  it('is used by parseCsv when none is given', () => {
    expect(parseCsv('name;cost\nshop.example;"1,50"')).toEqual([['name', 'cost'], ['shop.example', '1,50']])
  })
})

describe('csvCell', () => {
  it('quotes only when needed', () => {
    expect(csvCell('plain')).toBe('plain')
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell('line\nbreak')).toBe('"line\nbreak"')
  })
})
