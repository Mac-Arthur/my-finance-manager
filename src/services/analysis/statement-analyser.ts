import { Injectable, InjectionToken } from '@angular/core';
import { AnalysisDraft, AnalysisEngine, AnalysisInput } from '../../models/analysis';
import { environment } from '../../environments/environment';

/** The PDF is encrypted. `incorrect` is true when a password was tried and rejected. */
export class PasswordRequiredError extends Error {
  override readonly name = 'PasswordRequiredError';
  constructor(readonly incorrect: boolean) { super(incorrect ? 'That password did not open the PDF. Check it and try again.' : 'This PDF is password-protected. Enter its password to read it.'); }
}

/** Replace this provider with a backend adapter when remote AI processing is enabled. */
@Injectable({ providedIn: 'root' })
export class LocalStatementAnalyser implements AnalysisEngine {
  async analyse(input: AnalysisInput, progress: (message: string) => void): Promise<AnalysisDraft> {
    const { parseCsv, rowsToDraft } = await import('./parse-statement');
    progress('Reading the statement…');
    if (input.kind === 'csv') {
      const draft = parseCsv(await input.file.text(), input.mapping);
      progress('Checking amounts and suggesting categories…');
      return draft;
    }
    if (input.kind === 'xlsx') {
      const { parseXlsx } = await import('./xlsx-statement');
      const draft = parseXlsx(await input.file.arrayBuffer(), input.mapping);
      progress('Checking amounts and suggesting categories…');
      return draft;
    }
    // Legacy build on purpose: pdf.js v6's default build needs bleeding-edge APIs (Uint8Array#toHex,
    // Math.sumPrecise) and fails on Chrome < 140 and many phones. Keep angular.json's worker in sync.
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('assets/pdfjs/pdf.worker.min.mjs', document.baseURI).href;
    const task = pdfjs.getDocument({ data: new Uint8Array(await input.file.arrayBuffer()), useSystemFonts: true, password: input.password });
    try {
      const pdf = await task.promise;
      if (pdf.numPages > environment.maxPdfPages) throw new Error(`Please split PDFs longer than ${environment.maxPdfPages} pages.`);
      const pages: import('./pdf-table').PdfCell[][] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        progress(`Reading PDF page ${i} of ${pdf.numPages}…`);
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        // Rotated runs are watermarks ("FOR OFFICIAL PURPOSE") laid across the table; they are never statement data.
        const cells = content.items.filter(item => 'str' in item)
          .filter(item => Math.abs(item.transform[1]) < 0.01 && Math.abs(item.transform[2]) < 0.01 && item.transform[0] > 0)
          .map(item => ({ text: item.str.trim(), x: item.transform[4], y: item.transform[5], w: item.width, h: item.height || Math.abs(item.transform[3]) }))
          .filter(c => c.text);
        if (!cells.length) throw new Error(`Page ${i} has no readable text. Scanned PDFs need OCR, which is not connected yet. Try a searchable PDF or CSV.`);
        pages.push(cells);
        page.cleanup();
      }
      progress('Reconstructing transaction columns…');
      const { pdfTable } = await import('./pdf-table');
      const extracted = pdfTable(pages);
      const draft = rowsToDraft(extracted.table, extracted.text, extracted.meta);
      draft.warnings.push(...(extracted.warnings ?? []));
      draft.warnings.push('PDF table extraction is experimental. Compare every row with the original before confirming.');
      return draft;
    } catch (error) {
      // pdf.js code 2 = INCORRECT_PASSWORD, 1 = NEED_PASSWORD.
      if (error instanceof Error && error.name === 'PasswordException') throw new PasswordRequiredError((error as Error & { code?: number }).code === 2 || !!input.password);
      throw error;
    } finally { await task.destroy(); }
  }
}
export const STATEMENT_ANALYSER = new InjectionToken<AnalysisEngine>('STATEMENT_ANALYSER', {
  providedIn: 'root', factory: () => new LocalStatementAnalyser(),
});
