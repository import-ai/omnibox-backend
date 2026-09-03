import { getMp4DurationSeconds } from './audio-duration';

function atom(type: string, payload: Buffer) {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(payload.length + 8, 0);
  header.write(type, 4, 4, 'ascii');
  return Buffer.concat([header, payload]);
}

function makeMp4DurationFixture(timescale: number, duration: number) {
  const mvhd = Buffer.alloc(20);
  mvhd.writeUInt32BE(timescale, 12);
  mvhd.writeUInt32BE(duration, 16);
  return Buffer.concat([
    atom('ftyp', Buffer.alloc(8)),
    atom('moov', atom('mvhd', mvhd)),
  ]);
}

describe('getMp4DurationSeconds', () => {
  it('reads the duration from an MPEG-4 mvhd atom', () => {
    expect(getMp4DurationSeconds(makeMp4DurationFixture(1000, 12_500))).toBe(
      12.5,
    );
  });

  it('returns null for data without a valid MPEG-4 movie header', () => {
    expect(getMp4DurationSeconds(Buffer.from('not-audio'))).toBeNull();
  });
});
