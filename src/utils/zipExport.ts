import JSZip from 'jszip';
import { CodeFile } from '../types';

/**
 * Downloads a single code file.
 */
export function downloadSingleFile(file: CodeFile): void {
  const blob = new Blob([file.content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Packs multiple code files into a zip and triggers browser download.
 */
export async function downloadFilesAsZip(files: CodeFile[], zipName = 'project-code-files.zip'): Promise<void> {
  const zip = new JSZip();

  files.forEach((file) => {
    zip.file(file.name, file.content);
  });

  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = zipName.endsWith('.zip') ? zipName : `${zipName}.zip`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
