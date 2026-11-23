import {
  effectiveFileNameFunction,
  fileIdEvidenceValues,
  inferFileReaderFunction,
  isEffectiveFileNameFor,
  isPlainRecord,
  payloadResourceId,
  repairFileReaderInput,
  satisfiesWorkerContract,
  withTargetResourceId,
} from 'omniboxd/task-retry/file-reader-retry-input';

describe('legacy file_reader retry input', () => {
  const workerInput = (overrides: Record<string, any> = {}) => ({
    title: 'Title',
    original_name: 'contract.docx',
    filename: 'contract.docx',
    mimetype:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    resource_id: 'resource-1',
    ...overrides,
  });

  describe('payloadResourceId', () => {
    it('reads a non-empty string resource_id', () => {
      expect(payloadResourceId({ resource_id: 'resource-1' })).toBe(
        'resource-1',
      );
    });

    it.each([
      ['missing payload', null],
      ['array payload', []],
      ['empty payload', {}],
      ['empty string', { resource_id: '' }],
      ['number', { resource_id: 42 }],
      ['null', { resource_id: null }],
    ])('returns undefined for %s', (_label, payload) => {
      expect(payloadResourceId(payload)).toBeUndefined();
    });
  });

  describe('withTargetResourceId', () => {
    it('fills a genuinely missing resource_id', () => {
      expect(withTargetResourceId({ title: 't' }, 'resource-1')).toEqual({
        title: 't',
        resource_id: 'resource-1',
      });
    });

    it('keeps an identical resource_id', () => {
      expect(
        withTargetResourceId({ resource_id: 'resource-1' }, 'resource-1'),
      ).toEqual({ resource_id: 'resource-1' });
    });

    it.each([
      ['another id', 'resource-2'],
      ['explicit null', null],
      ['empty string', ''],
      ['non-string', 42],
    ])('rejects a present-but-different resource_id: %s', (_label, value) => {
      expect(
        withTargetResourceId({ resource_id: value }, 'resource-1'),
      ).toBeUndefined();
    });
  });

  describe('inferFileReaderFunction', () => {
    it.each([
      ['报告.PDF', 'file_reader_pdf'],
      ['合同.DOCX', 'file_reader_word'],
      ['notes.txt', 'file_reader_text'],
      ['slides.pptx', 'file_reader_ppt'],
      ['scan.png', 'file_reader_image'],
    ])('maps %s to %s', (name, fn) => {
      expect(inferFileReaderFunction({ original_name: name })).toEqual({
        kind: 'resolved',
        fn,
      });
    });

    it.each([
      ['missing', undefined],
      ['empty', ''],
      ['blank', '   '],
      ['non-string', 42],
    ])('falls back to filename when original_name is %s', (_label, value) => {
      expect(
        inferFileReaderFunction({
          original_name: value,
          filename: 'fallback.txt',
        }),
      ).toEqual({ kind: 'resolved', fn: 'file_reader_text' });
    });

    it('reports unsupported when neither name is usable', () => {
      expect(inferFileReaderFunction({})).toEqual({
        kind: 'unsupported_extension',
      });
      expect(
        inferFileReaderFunction({ original_name: '  ', filename: null }),
      ).toEqual({ kind: 'unsupported_extension' });
    });

    it('reports unsupported for a selected name without an extension', () => {
      expect(inferFileReaderFunction({ original_name: '合同' })).toEqual({
        kind: 'unsupported_extension',
      });
    });

    it('reports unsupported for an unknown extension without falling back', () => {
      expect(
        inferFileReaderFunction({
          original_name: 'a.xyz',
          filename: 'b.txt',
        }),
      ).toEqual({ kind: 'unsupported_extension' });
      expect(inferFileReaderFunction({ filename: 'a.xyz' })).toEqual({
        kind: 'unsupported_extension',
      });
    });

    it('detects a Word/PDF conflict before choosing a worker', () => {
      expect(
        inferFileReaderFunction({
          original_name: '合同.docx',
          filename: 'a.pdf',
        }),
      ).toEqual({ kind: 'conflict' });
    });

    it('detects the reverse conflict too', () => {
      expect(
        inferFileReaderFunction({
          original_name: 'a.pdf',
          filename: '合同.docx',
        }),
      ).toEqual({ kind: 'conflict' });
    });

    it('ignores surrounding whitespace when choosing the worker', () => {
      expect(inferFileReaderFunction({ original_name: ' a.pdf' })).toEqual({
        kind: 'resolved',
        fn: 'file_reader_pdf',
      });
    });
  });

  describe('effectiveFileNameFunction', () => {
    it.each([
      ['a.pdf', 'file_reader_pdf'],
      [' a.pdf', 'file_reader_pdf'],
      ['报告.PDF', 'file_reader_pdf'],
      ['contract.docx', 'file_reader_word'],
    ])('accepts %s', (name, fn) => {
      expect(effectiveFileNameFunction(name)).toBe(fn);
    });

    it.each([
      ['trailing whitespace', 'a.pdf '],
      ['forward slash', 'dir/a.pdf'],
      ['backslash', 'dir\\a.pdf'],
      ['absolute path', '/tmp/a.pdf'],
      ['dot', '.'],
      ['dot dot', '..'],
      ['empty', ''],
      ['blank', '   '],
      ['unknown suffix', 'a.xyz'],
      ['no suffix', 'a'],
      ['non-string', 42],
      ['null', null],
    ])('rejects %s', (_label, name) => {
      expect(effectiveFileNameFunction(name)).toBeUndefined();
    });

    it('matches only the same function kind', () => {
      expect(isEffectiveFileNameFor('a.pdf', 'file_reader_pdf')).toBe(true);
      expect(isEffectiveFileNameFor('a.pdf', 'file_reader_word')).toBe(false);
    });
  });

  describe('satisfiesWorkerContract', () => {
    it('accepts a fully valid input', () => {
      expect(
        satisfiesWorkerContract(
          workerInput(),
          'file_reader_word',
          'resource-1',
        ),
      ).toBe(true);
    });

    it('accepts an input whose filename is absent', () => {
      const rest: Record<string, any> = { ...workerInput() };
      delete rest.filename;
      expect(
        satisfiesWorkerContract(rest, 'file_reader_word', 'resource-1'),
      ).toBe(true);
    });

    it('accepts an unused original_name value when filename is valid', () => {
      expect(
        satisfiesWorkerContract(
          workerInput({ original_name: null }),
          'file_reader_word',
          'resource-1',
        ),
      ).toBe(true);
    });

    it.each([
      ['filename is null', { filename: null }],
      ['filename is empty', { filename: '' }],
      ['filename is blank', { filename: '   ' }],
      ['filename is non-string', { filename: 42 }],
      ['filename has an unknown suffix', { filename: 'a.xyz' }],
      ['filename has trailing whitespace', { filename: 'a.docx ' }],
      ['filename maps to another function', { filename: 'a.pdf' }],
    ])('rejects when %s', (_label, overrides) => {
      expect(
        satisfiesWorkerContract(
          workerInput(overrides),
          'file_reader_word',
          'resource-1',
        ),
      ).toBe(false);
    });

    it.each([
      ['title is missing', { title: undefined }],
      ['title is non-string', { title: 42 }],
      ['original_name is missing', { original_name: undefined }],
      ['mimetype is missing', { mimetype: undefined }],
      ['mimetype is non-string', { mimetype: 42 }],
      ['resource_id is missing', { resource_id: undefined }],
      ['resource_id is another resource', { resource_id: 'resource-2' }],
    ])('rejects when %s', (_label, overrides) => {
      const input: Record<string, any> = workerInput(overrides);
      for (const key of Object.keys(overrides)) {
        if (input[key] === undefined) delete input[key];
      }
      expect(
        satisfiesWorkerContract(input, 'file_reader_word', 'resource-1'),
      ).toBe(false);
    });

    it('rejects an invalid original_name when filename is absent', () => {
      const rest: Record<string, any> = {
        ...workerInput({ original_name: 'a.pdf' }),
      };
      delete rest.filename;
      expect(
        satisfiesWorkerContract(rest, 'file_reader_word', 'resource-1'),
      ).toBe(false);
    });
  });

  describe('fileIdEvidenceValues', () => {
    it('returns every present file-id value from input and payload', () => {
      expect(
        fileIdEvidenceValues(
          { file_id: 'file-1', fileId: 'file-1', other: 'x' },
          { file_id: 'file-1', fileId: 'file-1' },
        ),
      ).toEqual(['file-1', 'file-1', 'file-1', 'file-1']);
    });

    it('returns nothing when no file-id field exists', () => {
      expect(
        fileIdEvidenceValues({ title: 't' }, { resource_id: 'r' }),
      ).toEqual([]);
    });

    it('counts a present but null value', () => {
      expect(fileIdEvidenceValues({ file_id: null }, null)).toEqual([null]);
    });
  });

  describe('repairFileReaderInput', () => {
    const file = (
      overrides: Partial<{ name: string; mimetype: string }> = {},
    ) => ({
      name: 'contract.docx',
      mimetype:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ...overrides,
    });

    it('omits an invalid filename and keeps the confirmed original_name', () => {
      const repaired = repairFileReaderInput(
        workerInput({ filename: null }),
        'file_reader_word',
        'resource-1',
        file(),
      );

      expect(repaired).toBeDefined();
      expect(repaired).not.toHaveProperty('filename');
      expect(repaired).toMatchObject({ original_name: 'contract.docx' });
    });

    it('fills a missing original_name from the file row', () => {
      const repaired = repairFileReaderInput(
        {
          title: 'Title',
          filename: 'notes.txt',
          mimetype: 'text/plain',
          resource_id: 'resource-1',
        },
        'file_reader_text',
        'resource-1',
        file({ name: 'notes.txt', mimetype: 'text/plain' }),
      );

      expect(repaired).toMatchObject({
        original_name: 'notes.txt',
        filename: 'notes.txt',
      });
    });

    it('fills a missing or non-string mimetype from the file row', () => {
      const missing: Record<string, any> = { ...workerInput() };
      delete missing.mimetype;
      expect(
        repairFileReaderInput(
          missing,
          'file_reader_word',
          'resource-1',
          file({ mimetype: 'application/msword' }),
        ),
      ).toMatchObject({ mimetype: 'application/msword' });

      expect(
        repairFileReaderInput(
          workerInput({ mimetype: null }),
          'file_reader_word',
          'resource-1',
          file({ mimetype: 'application/msword' }),
        ),
      ).toMatchObject({ mimetype: 'application/msword' });
    });

    it('rejects when the file row has no usable mimetype', () => {
      const missing: Record<string, any> = { ...workerInput() };
      delete missing.mimetype;
      expect(
        repairFileReaderInput(
          missing,
          'file_reader_word',
          'resource-1',
          file({ mimetype: '' }),
        ),
      ).toBeUndefined();
    });

    it.each([
      ['missing', undefined],
      ['non-string', 42],
    ])(
      'rejects when title is %s, since files have no title',
      (_label, title) => {
        const input: Record<string, any> = workerInput();
        if (title === undefined) delete input.title;
        else input.title = title;
        expect(
          repairFileReaderInput(
            input,
            'file_reader_word',
            'resource-1',
            file(),
          ),
        ).toBeUndefined();
      },
    );

    it('deletes a filename with trailing whitespace and falls back to the file name', () => {
      const repaired = repairFileReaderInput(
        workerInput({ original_name: null, filename: 'a.docx ' }),
        'file_reader_word',
        'resource-1',
        file({ name: 'contract.docx' }),
      );

      expect(repaired).toBeDefined();
      expect(repaired).not.toHaveProperty('filename');
      expect(repaired).toMatchObject({ original_name: 'contract.docx' });
    });

    it('resolves a conflict from the file row name', () => {
      const repaired = repairFileReaderInput(
        workerInput({
          original_name: '合同.docx',
          filename: 'a.pdf',
          mimetype: 'application/pdf',
        }),
        'file_reader_pdf',
        'resource-1',
        file({ name: 'resolved.pdf', mimetype: 'application/pdf' }),
      );

      expect(repaired).toMatchObject({
        original_name: 'resolved.pdf',
        filename: 'a.pdf',
      });
    });

    it('deletes a filename that disagrees with the resolved function', () => {
      const repaired = repairFileReaderInput(
        workerInput({
          original_name: 'a.pdf',
          filename: '合同.docx',
        }),
        'file_reader_pdf',
        'resource-1',
        file({ name: 'a.pdf', mimetype: 'application/pdf' }),
      );

      expect(repaired).toBeDefined();
      expect(repaired).not.toHaveProperty('filename');
      expect(repaired).toMatchObject({ original_name: 'a.pdf' });
    });

    it('preserves unrelated keys, including existing file-id fields', () => {
      const repaired = repairFileReaderInput(
        {
          ...workerInput({ filename: null }),
          file_id: 'file-1',
          fileId: 'file-1',
          language: 'English',
          style: 'brief',
        },
        'file_reader_word',
        'resource-1',
        file(),
      );

      expect(repaired).toMatchObject({
        file_id: 'file-1',
        fileId: 'file-1',
        language: 'English',
        style: 'brief',
      });
    });

    it('does not mutate the original input', () => {
      const input = workerInput({ filename: null });
      repairFileReaderInput(input, 'file_reader_word', 'resource-1', file());

      expect(input.filename).toBeNull();
    });

    it('rejects when the repaired input still fails the contract', () => {
      expect(
        repairFileReaderInput(
          workerInput({ filename: null, resource_id: 'resource-2' }),
          'file_reader_word',
          'resource-1',
          file(),
        ),
      ).toBeUndefined();
    });
  });

  describe('isPlainRecord', () => {
    it('accepts plain objects only', () => {
      expect(isPlainRecord({})).toBe(true);
      expect(isPlainRecord({ a: 1 })).toBe(true);
      expect(isPlainRecord([])).toBe(false);
      expect(isPlainRecord(null)).toBe(false);
      expect(isPlainRecord('x')).toBe(false);
      expect(isPlainRecord(42)).toBe(false);
    });
  });
});
