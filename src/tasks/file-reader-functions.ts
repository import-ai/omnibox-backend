import * as path from 'path';

// Maps an uploaded file's extension to the per-format file_reader function kind
// that the matching wizard (base or pro) is able to handle. Extensions absent
// from this map are unsupported by either wizard, so no task is emitted for them.
export const EXT_TO_FILE_READER_FN: Record<string, string> = {
  // base wizard
  '.md': 'file_reader_text',
  '.txt': 'file_reader_text',
  '.pptx': 'file_reader_ppt',
  '.ppt': 'file_reader_ppt',
  '.dps': 'file_reader_ppt',
  '.dpt': 'file_reader_ppt',
  '.odp': 'file_reader_ppt',
  '.docx': 'file_reader_word',
  '.doc': 'file_reader_word',
  '.wps': 'file_reader_word',
  '.wpt': 'file_reader_word',
  '.rtf': 'file_reader_word',
  '.odt': 'file_reader_word',
  // wizard-pro
  '.pdf': 'file_reader_pdf',
  '.wav': 'file_reader_audio',
  '.mp3': 'file_reader_audio',
  '.opus': 'file_reader_audio',
  '.m4a': 'file_reader_audio',
  '.mp4': 'file_reader_video',
  '.avi': 'file_reader_video',
  '.mov': 'file_reader_video',
  '.mkv': 'file_reader_video',
  '.flv': 'file_reader_video',
  '.wmv': 'file_reader_video',
  '.webm': 'file_reader_video',
  '.png': 'file_reader_image',
  '.jpg': 'file_reader_image',
  '.jpeg': 'file_reader_image',
};

/**
 * The file_reader function kind for a file name, ignoring surrounding
 * whitespace. Returns undefined for non-string names and for extensions that
 * no wizard can read.
 */
export function fileReaderFunctionForName(name: unknown): string | undefined {
  if (typeof name !== 'string') {
    return undefined;
  }
  return EXT_TO_FILE_READER_FN[path.extname(name.trim()).toLowerCase()];
}
