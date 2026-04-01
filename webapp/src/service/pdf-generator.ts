import PDFDocument from 'pdfkit';

export function generatePdf(memo: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 60, bottom: 60, left: 50, right: 50 },
      info: {
        Title: 'Investment Memo — Angel Investor Pitch Evaluator',
        Author: 'Angel Investor Pitch Evaluator',
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    renderMemo(doc, memo);
    doc.end();
  });
}

function renderMemo(doc: PDFKit.PDFDocument, memo: string): void {
  const lines = memo.split('\n');

  for (const line of lines) {
    if (doc.y > doc.page.height - 80) {
      doc.addPage();
    }
    renderLine(doc, line);
  }
}

function renderLine(doc: PDFKit.PDFDocument, line: string): void {
  const trimmed = line.trim();

  if (trimmed.startsWith('### ')) {
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').fontSize(13).text(trimmed.slice(4));
    doc.moveDown(0.3);
    return;
  }

  if (trimmed.startsWith('## ')) {
    doc.moveDown(0.8);
    doc.font('Helvetica-Bold').fontSize(16).text(trimmed.slice(3));
    doc.moveDown(0.4);
    return;
  }

  if (trimmed.startsWith('# ')) {
    doc.moveDown(1);
    doc.font('Helvetica-Bold').fontSize(20).text(trimmed.slice(2));
    doc.moveDown(0.6);
    return;
  }

  if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
    doc.font('Helvetica').fontSize(11).text(`  •  ${trimmed.slice(2)}`, { indent: 10 });
    doc.moveDown(0.2);
    return;
  }

  if (/^\d+\.\s/.test(trimmed)) {
    doc.font('Helvetica').fontSize(11).text(`  ${trimmed}`, { indent: 10 });
    doc.moveDown(0.2);
    return;
  }

  if (trimmed.startsWith('**') && trimmed.endsWith('**')) {
    doc.font('Helvetica-Bold').fontSize(11).text(trimmed.replace(/\*\*/g, ''));
    doc.moveDown(0.2);
    return;
  }

  if (trimmed === '') {
    doc.moveDown(0.3);
    return;
  }

  const cleaned = trimmed.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1');
  doc.font('Helvetica').fontSize(11).text(cleaned);
  doc.moveDown(0.2);
}
