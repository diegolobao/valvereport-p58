// Simple html2pdf wrapper for A4 with 2cm margins
import html2pdf from 'html2pdf.js';

export type PdfOptions = {
  fileName: string;
  marginCm?: number;
  headerFooter?: {
    title: string;
    tag: string;
    period: string; // e.g., "Tag: SDV-XXXX | Período: 01/01/2025 até 31/01/2025"
    logoUrl?: string; // defaults to '/logo_petrobras.png'
  };
};

async function loadImageDataUrl(url: string): Promise<{ dataUrl: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width || 1;
      canvas.height = img.naturalHeight || img.height || 1;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Canvas 2D context unavailable'));
      ctx.drawImage(img, 0, 0);
      try {
        const dataUrl = canvas.toDataURL('image/png');
        resolve({ dataUrl, width: canvas.width, height: canvas.height });
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = (e) => reject(e);
    img.src = url;
  });
}

export async function exportElementToPdf(el: HTMLElement, { fileName, marginCm = 2.0, headerFooter }: PdfOptions) {
  // --- CÁLCULO DAS MARGENS ---
  const headerFooterGapCm = 0.5;
  const twoPointsInCm = 0.0706; // 2pt convertidos para cm

  // A margem TOTAL agora inclui o espaço para o cabeçalho, o gap E o espaçamento extra da linha.
  const marginTop = headerFooter ? marginCm + headerFooterGapCm + twoPointsInCm : marginCm;
  // A margem inferior continua a mesma, com o gap de 0.5cm.
  const marginBottom = headerFooter ? marginCm + headerFooterGapCm : marginCm;

  const opt: any = {
    // A margem aqui reserva o espaço TOTAL necessário.
    margin: [marginTop, marginCm, marginBottom, marginCm], // [top, right, bottom, left] in 'cm'
    filename: fileName,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, letterRendering: true },
    jsPDF: { unit: 'cm', format: 'a4', orientation: 'portrait' },
    pagebreak: { mode: ['css'], avoid: ['img', 'h1', 'h2', 'h3'] },
  };

  const worker = html2pdf().set(opt).from(el);

  worker.toPdf().get('pdf').then(async (pdf: any) => {
    const totalPages: number = pdf.internal.getNumberOfPages();
    const pageWidth: number = pdf.internal.pageSize.getWidth(); // cm
    const pageHeight: number = pdf.internal.pageSize.getHeight(); // cm

    let logo: { dataUrl: string; width: number; height: number } | null = null;
    if (headerFooter) {
      const logoUrl = headerFooter.logoUrl || (import.meta.env.BASE_URL + 'logo_petrobras.png');
      try {
        logo = await loadImageDataUrl(logoUrl);
      } catch {
        logo = null;
      }
    }

    for (let i = 1; i <= totalPages; i++) {
      pdf.setPage(i);

      if (headerFooter) {
        // --- DESENHO DO CABEÇALHO ---
        // O conteúdo do cabeçalho é desenhado dentro da margem principal (marginCm = 2.0).
        const topY = 0.8;
        const leftX = marginCm;

        if (logo) {
          let logoW = 4.8;
          let logoH = 1.6;
          const ratio = logo.height > 0 ? logo.width / logo.height : 3.0;
          logoH = logoW / ratio;
          if (logoH > 1.8) {
            logoH = 1.8;
            logoW = logoH * ratio;
          }
          pdf.addImage(logo.dataUrl, 'PNG', leftX, topY, logoW, logoH);
        }

        const textX = leftX + (logo ? 4.8 + 0.5 : 0);
        let cursorY = topY + 0.6;
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(12);
        pdf.text(headerFooter.title, textX, cursorY, { baseline: 'alphabetic' });
        cursorY += 0.55;
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(9);
        pdf.text(`${headerFooter.tag} | ${headerFooter.period}`, textX, cursorY, { baseline: 'alphabetic' });

        // Posição da Linha do Cabeçalho
        // A linha é desenhada 2pt abaixo da margem principal para dar mais espaço ao texto.
        pdf.setDrawColor(0, 0, 0);
        pdf.setLineWidth(0.02);
        const headerLineY = marginCm + twoPointsInCm;
        pdf.line(marginCm, headerLineY, pageWidth - marginCm, headerLineY);
      }

      // --- DESENHO DO RODAPÉ ---
      if (headerFooter) {
        // A linha do rodapé começa no final do gap, a 2cm (marginCm) da borda inferior.
        const footerLineY = pageHeight - marginCm;
        pdf.setDrawColor(0, 0, 0);
        pdf.setLineWidth(0.02);
        pdf.line(marginCm, footerLineY, pageWidth - marginCm, footerLineY);

        // O texto do rodapé começa abaixo da linha.
        let y = footerLineY + 0.4;

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(8);
        pdf.text('OBSERVAÇÕES:', marginCm, y);

        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8);
        const gap = 0.4;
        y += gap;
        pdf.text('* Considera-se falha apenas o que impacta na função de segurança, ou seja, no fechamento das SDVs e abertura das BDVs;', marginCm, y, { maxWidth: pageWidth - 2 * marginCm });
        y += gap;
        pdf.text('* O tempo máximo registrado será de 60s;', marginCm, y, { maxWidth: pageWidth - 2 * marginCm });
        y += gap;
        pdf.text('* Para os registros destacados em "vermelho", verificar integridade das chaves fim de curso.', marginCm, y, { maxWidth: pageWidth - 2 * marginCm });

        const pageStr = `${i} / ${totalPages}`;
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8);
        const footerBottomPad = 0.8;
        pdf.text(pageStr, pageWidth - marginCm, pageHeight - footerBottomPad, { align: 'right' });
      }
    }
  }).then(() => {
    // O save é chamado após a modificação do PDF.
    worker.save();
  }).catch((e: any) => { // <-- CORREÇÃO: Adicionado o tipo 'any' para o parâmetro 'e'
    console.error('Falha ao gerar PDF com cabeçalho/rodapé, tentando fallback...', e);
    // Fallback para o método simples caso a customização falhe.
    html2pdf().set(opt).from(el).save();
  });
}