import { describe, it, expect } from 'vitest'
import {
  fileApiUrl,
  isFileApiUrl,
  resolveFileApiUrl,
  resolveRelativeFilePath,
  FILE_API_PREFIX,
} from './paths'

describe('fileApiUrl', () => {
  it('joins segments and encodes each one', () => {
    expect(fileApiUrl('report', 'a.pdf')).toBe('/api/files/report/a.pdf')
  })
  it('encodes spaces and special chars per-segment', () => {
    expect(fileApiUrl('report', 'a b.pdf')).toBe('/api/files/report/a%20b.pdf')
    expect(fileApiUrl('report', 'a/b.pdf')).toBe('/api/files/report/a%2Fb.pdf')
  })
})

describe('isFileApiUrl', () => {
  it('accepts the /api/files/ prefix', () => {
    expect(isFileApiUrl('/api/files/anything')).toBe(true)
  })
  it('rejects other paths', () => {
    expect(isFileApiUrl('/uploads/x')).toBe(false)
    expect(isFileApiUrl('https://example.com/api/files/x')).toBe(false)
    expect(isFileApiUrl(null)).toBe(false)
    expect(isFileApiUrl(undefined)).toBe(false)
    expect(isFileApiUrl(42)).toBe(false)
  })
})

describe('resolveRelativeFilePath — path traversal defense', () => {
  it('rejects ".." segments', () => {
    expect(resolveRelativeFilePath('../store/documents.json')).toBeNull()
    expect(resolveRelativeFilePath('report/../store/x.json')).toBeNull()
    expect(resolveRelativeFilePath('report/..')).toBeNull()
  })
  it('rejects "." segments', () => {
    expect(resolveRelativeFilePath('./report/a.pdf')).toBeNull()
    expect(resolveRelativeFilePath('report/./a.pdf')).toBeNull()
  })
  it('rejects null-byte injection', () => {
    expect(resolveRelativeFilePath('report/a\0.pdf')).toBeNull()
  })
  it('rejects empty path segments', () => {
    expect(resolveRelativeFilePath('report//a.pdf')).toBeNull()
    expect(resolveRelativeFilePath('//etc/passwd')).toBeNull()
  })
  it('accepts valid relative paths', () => {
    const got = resolveRelativeFilePath('report/test.pdf')
    expect(got).not.toBeNull()
    expect(got!.endsWith('/data/files/report/test.pdf')).toBe(true)
  })
  it('decodes URL-encoded segments and re-validates', () => {
    // "..%2F" decodes to "../" — must still be rejected even after decode
    expect(resolveRelativeFilePath('%2E%2E/store/x.json')).toBeNull()
    // "%20" -> space is fine
    const got = resolveRelativeFilePath('report/a%20b.pdf')
    expect(got).not.toBeNull()
    expect(got!.endsWith('/data/files/report/a b.pdf')).toBe(true)
  })
})

describe('resolveFileApiUrl', () => {
  it('only resolves the /api/files/ prefix', () => {
    const ok = resolveFileApiUrl(FILE_API_PREFIX + 'report/x.pdf')
    expect(ok).not.toBeNull()
    expect(ok!.endsWith('/data/files/report/x.pdf')).toBe(true)
  })
  it('returns null for wrong prefix', () => {
    expect(resolveFileApiUrl('/uploads/report/x.pdf')).toBeNull()
    expect(resolveFileApiUrl('/api/other/x')).toBeNull()
  })
  it('rejects traversal even through the api wrapper', () => {
    expect(resolveFileApiUrl(FILE_API_PREFIX + '../store/quota.json')).toBeNull()
  })
})
