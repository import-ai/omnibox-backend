import { MigrationInterface, QueryRunner } from 'typeorm';

// The single `file_reader` function was split into per-format kinds. Existing
// pending/running/canceled tasks were emitted with the old `file_reader` name,
// so the wizard can no longer route them (canceled ones would also fail if
// rerun). Remap them to the new per-format kind based
// on the uploaded file's extension, mirroring EXT_TO_FILE_READER_FN in
// src/tasks/wizard-task.service.ts. Tasks whose extension is unsupported (or
// missing) keep the old name and are left untouched.
export class MigrateFileReaderTaskFunctions1781259717294 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE tasks AS t
      SET function = m.fn
      FROM (
        SELECT
          id,
          CASE lower(
            substring(
              coalesce(input->>'original_name', input->>'filename')
              FROM '\\.[^./]+$'
            )
          )
            WHEN '.md' THEN 'file_reader_text'
            WHEN '.txt' THEN 'file_reader_text'
            WHEN '.pptx' THEN 'file_reader_ppt'
            WHEN '.ppt' THEN 'file_reader_ppt'
            WHEN '.docx' THEN 'file_reader_word'
            WHEN '.doc' THEN 'file_reader_word'
            WHEN '.pdf' THEN 'file_reader_pdf'
            WHEN '.wav' THEN 'file_reader_audio'
            WHEN '.mp3' THEN 'file_reader_audio'
            WHEN '.opus' THEN 'file_reader_audio'
            WHEN '.m4a' THEN 'file_reader_audio'
            WHEN '.mp4' THEN 'file_reader_video'
            WHEN '.avi' THEN 'file_reader_video'
            WHEN '.mov' THEN 'file_reader_video'
            WHEN '.mkv' THEN 'file_reader_video'
            WHEN '.flv' THEN 'file_reader_video'
            WHEN '.wmv' THEN 'file_reader_video'
            WHEN '.webm' THEN 'file_reader_video'
            WHEN '.png' THEN 'file_reader_image'
            WHEN '.jpg' THEN 'file_reader_image'
            WHEN '.jpeg' THEN 'file_reader_image'
            ELSE NULL
          END AS fn
        FROM tasks
        WHERE function = 'file_reader'
          AND status IN ('pending', 'running', 'canceled')
      ) AS m
      WHERE t.id = m.id
        AND m.fn IS NOT NULL;
    `);
  }

  public down(): Promise<void> {
    throw new Error('Not supported.');
  }
}
