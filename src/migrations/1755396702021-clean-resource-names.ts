import { MigrationInterface, QueryRunner } from 'typeorm';

function isUrlEncoded(str: string): boolean {
  try {
    const decoded = decodeURIComponent(str);
    const reEncoded = encodeURIComponent(decoded);
    return str !== decoded || str === reEncoded;
  } catch {
    return false;
  }
}

function looksLikeMojibake(str: string): boolean {
  const weirdChars = /�/;
  if (weirdChars.test(str)) return true;

  const highChars = str.match(/[\x80-\xFF]/g) || [];
  return highChars.length > str.length / 3;
}

export class CleanResourceNames1755396702021 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const records = await queryRunner.query(`
      SELECT id, name 
      FROM resources 
      WHERE name IS NOT NULL AND name != ''
    `);

    for (const row of records) {
      try {
        let name = row.name;
        const originalName = name;

        if (isUrlEncoded(name)) {
          name = decodeURIComponent(name);
        }

        if (looksLikeMojibake(name)) {
          name = Buffer.from(name, 'latin1').toString('utf8');
        }

        if (name !== originalName) {
          await queryRunner.query(
            `UPDATE resources SET name = $1 WHERE id = $2`,
            [name, row.id],
          );
        }
      } catch (e) {
        console.error({
          message: 'Error processing resource name',
          id: row.id,
          name: row.name,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/require-await
  public async down(queryRunner: QueryRunner): Promise<void> {
    throw new Error('Not supported.');
  }
}
