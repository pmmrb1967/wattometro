// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Browser-only pdf.js setup, loaded only when an invoice is chosen (a dynamic
 * import keeps it out of the first load). The worker is bundled with the app:
 * nothing is fetched from a CDN, and the file never leaves the browser.
 * From the Faturómetro (src/pdf/browser.ts), without the QR code reader.
 */
import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { installReadableStreamIterator } from './polyfills';
import { extractText, toPasswordError, type PageText } from './text';

installReadableStreamIterator();
GlobalWorkerOptions.workerSrc = workerUrl;

/** A PDF's text; throws PdfPasswordError when a (correct) password is needed. */
export async function readPdfText(data: Uint8Array, password?: string): Promise<PageText[]> {
  // pdf.js transfers the buffer to its worker: pass a copy so the caller keeps the original.
  const task = getDocument({ data: data.slice(), password });
  try {
    const pdf: PDFDocumentProxy = await task.promise.catch(toPasswordError);
    return await extractText(pdf);
  } finally {
    await task.destroy();
  }
}
