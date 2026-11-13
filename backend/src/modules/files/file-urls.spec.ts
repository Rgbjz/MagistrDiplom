import { contentDisposition, safeContentType } from './file-urls';

describe('file download headers', () => {
  it('never serves runnable types as themselves', () => {
    for (const t of [
      'text/html',
      'text/html; charset=utf-8',
      'image/svg+xml',
      'application/xhtml+xml',
      'text/xml',
      'application/javascript',
      'text/javascript',
    ]) {
      expect(safeContentType(t)).toBe('application/octet-stream');
    }
    expect(safeContentType(null)).toBe('application/octet-stream');
  });

  it('keeps ordinary types', () => {
    expect(safeContentType('application/pdf')).toBe('application/pdf');
    expect(safeContentType('image/png')).toBe('image/png');
    expect(safeContentType('text/css')).toBe('text/css');
  });

  it('HTML homework is always a download, never inline', () => {
    expect(contentDisposition('index.html', 'text/html')).toMatch(
      /^attachment;/,
    );
  });
});
