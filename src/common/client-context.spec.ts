import {
  getClientContext,
  parseInstallationId,
  runWithClientContext,
} from './client-context';

describe('parseInstallationId', () => {
  it('accepts a well-formed id', () => {
    expect(parseInstallationId('ins_0f8e-AB.12')).toBe('ins_0f8e-AB.12');
  });

  it('trims surrounding whitespace', () => {
    expect(parseInstallationId('  ins_1  ')).toBe('ins_1');
  });

  it('takes the first value of a repeated header', () => {
    expect(parseInstallationId(['ins_1', 'ins_2'])).toBe('ins_1');
  });

  it.each([
    [undefined],
    [null],
    [''],
    ['   '],
    ['ins 1'],
    ['ins/1'],
    ['ins_1;drop'],
    ['a'.repeat(129)],
    [[]],
  ])('rejects %p', (raw) => {
    expect(
      parseInstallationId(raw as string | string[] | undefined),
    ).toBeNull();
  });

  it('accepts exactly 128 characters', () => {
    expect(parseInstallationId('a'.repeat(128))).toBe('a'.repeat(128));
  });
});

describe('client context', () => {
  it('is empty outside a request', () => {
    expect(getClientContext()).toEqual({ installationId: null });
  });

  it('exposes the context inside run', () => {
    const seen = runWithClientContext({ installationId: 'ins_1' }, () =>
      getClientContext(),
    );
    expect(seen).toEqual({ installationId: 'ins_1' });
    expect(getClientContext()).toEqual({ installationId: null });
  });

  it('keeps concurrent runs isolated across awaits', async () => {
    const tick = () => new Promise((resolve) => setTimeout(resolve, 5));
    const read = (id: string) =>
      runWithClientContext({ installationId: id }, async () => {
        await tick();
        const first = getClientContext().installationId;
        const nested = await runWithClientContext(
          { installationId: `${id}-inner` },
          async () => {
            await tick();
            return getClientContext().installationId;
          },
        );
        await tick();
        return [first, nested, getClientContext().installationId];
      });

    const [a, b] = await Promise.all([read('ins_a'), read('ins_b')]);
    expect(a).toEqual(['ins_a', 'ins_a-inner', 'ins_a']);
    expect(b).toEqual(['ins_b', 'ins_b-inner', 'ins_b']);
  });
});
