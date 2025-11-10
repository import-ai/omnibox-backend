/**
 * Format file size in bytes to human-readable format
 * @param bytes - File size in bytes
 * @returns Human-readable file size string (e.g., "20 MB", "1.5 GB")
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  const size = bytes / Math.pow(k, i);
  const formattedSize = i === 0 ? size.toString() : size.toFixed(1);

  return `${formattedSize} ${units[i]}`;
}
