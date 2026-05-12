import { describe, it, expect } from 'vitest'
import {
  detectKind,
  validateUploadFile,
  safeFilename,
  getExtension,
  MAX_BYTES_BY_TYPE,
} from './upload-validation'

describe('detectKind — magic byte sniffing', () => {
  it('PDF starts with %PDF-', () => {
    expect(detectKind(Buffer.from('%PDF-1.4 ...'))).toBe('pdf')
  })
  it('PNG signature', () => {
    expect(detectKind(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]))).toBe('png')
  })
  it('JPEG signature', () => {
    expect(detectKind(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]))).toBe('jpg')
  })
  it('GIF signature', () => {
    expect(detectKind(Buffer.from('GIF89a'))).toBe('gif')
  })
  it('WEBP needs RIFF + WEBP at offset 8', () => {
    const buf = Buffer.alloc(12)
    Buffer.from('RIFF').copy(buf, 0)
    Buffer.from('WEBP').copy(buf, 8)
    expect(detectKind(buf)).toBe('webp')
  })
  it('ZIP/PPTX signature', () => {
    expect(detectKind(Buffer.from([0x50, 0x4b, 0x03, 0x04]))).toBe('pptx')
  })
  it('plain text content', () => {
    expect(detectKind(Buffer.from('col1,col2\nvalue1,value2'))).toBe('text')
    expect(detectKind(Buffer.from('hello world'))).toBe('text')
  })
  it('binary garbage is unknown', () => {
    expect(detectKind(Buffer.from([0x01, 0x02, 0x03, 0x00]))).toBe('unknown')
  })
})

describe('validateUploadFile', () => {
  const goodCsv = Buffer.from('col1,col2\nfoo,bar\n')
  const goodPdf = Buffer.concat([Buffer.from('%PDF-1.4 '), Buffer.alloc(100)])
  const fakePdf = Buffer.from('not really a pdf')

  it('accepts a valid CSV for survey', () => {
    const r = validateUploadFile(goodCsv, 'data.csv', 'survey')
    expect(r.ok).toBe(true)
  })

  it('accepts a valid PDF for report', () => {
    const r = validateUploadFile(goodPdf, 'doc.pdf', 'report')
    expect(r.ok).toBe(true)
  })

  it('rejects empty file', () => {
    const r = validateUploadFile(Buffer.alloc(0), 'x.csv', 'survey')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain('空')
  })

  it('rejects oversized file', () => {
    const big = Buffer.alloc(MAX_BYTES_BY_TYPE.survey + 1)
    Buffer.from('col1,col2').copy(big, 0)
    const r = validateUploadFile(big, 'big.csv', 'survey')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain('過大')
  })

  it('rejects disallowed extension', () => {
    const r = validateUploadFile(goodPdf, 'doc.exe', 'transcript')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain('副檔名')
  })

  it('rejects mismatched magic byte (CSV ext but PDF content)', () => {
    const r = validateUploadFile(goodPdf, 'fake.csv', 'survey')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain('內容與副檔名不符')
  })

  it('rejects content that does not look like a real PDF', () => {
    const r = validateUploadFile(fakePdf, 'doc.pdf', 'report')
    expect(r.ok).toBe(false)
  })

  it('rejects missing extension', () => {
    const r = validateUploadFile(goodCsv, 'noextension', 'survey')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain('副檔名')
  })
})

describe('safeFilename', () => {
  it('strips path separators', () => {
    expect(safeFilename('../etc/passwd')).not.toContain('/')
    expect(safeFilename('a/b/c.csv')).not.toContain('/')
    expect(safeFilename('a\\b\\c.csv')).not.toContain('\\')
  })
  it('strips control characters', () => {
    expect(safeFilename('foo\x00\x01bar.csv')).toBe('foobar.csv')
  })
  it('strips leading dots', () => {
    expect(safeFilename('...hidden')).toBe('hidden')
  })
  it('caps at 200 chars', () => {
    const long = 'a'.repeat(500) + '.csv'
    expect(safeFilename(long).length).toBeLessThanOrEqual(200)
  })
  it('falls back when input becomes empty after stripping', () => {
    expect(safeFilename('...')).toBe('file')
    expect(safeFilename('...', 'custom')).toBe('custom')
    expect(safeFilename('\x00\x01\x02', 'fallback')).toBe('fallback')
  })

  it('collapses path separators into underscore (not strip)', () => {
    expect(safeFilename('////')).toBe('_')
  })
})

describe('getExtension', () => {
  it('lowercases extension', () => {
    expect(getExtension('A.PDF')).toBe('.pdf')
    expect(getExtension('foo.TXT')).toBe('.txt')
  })
  it('returns empty string when no extension', () => {
    expect(getExtension('noextension')).toBe('')
  })
})
