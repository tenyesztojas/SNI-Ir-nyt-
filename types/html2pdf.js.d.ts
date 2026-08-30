declare module "html2pdf.js" {
  interface Html2PdfOptions {
    margin?: number | number[];
    filename?: string;
    image?: { type?: string; quality?: number };
    html2canvas?: Record<string, unknown>;
    jsPDF?: { unit?: string; format?: string; orientation?: string };
    pagebreak?: Record<string, unknown>;
  }

  interface Html2PdfChain {
    set(options: Html2PdfOptions): Html2PdfChain;
    from(element: HTMLElement): Html2PdfChain;
    save(): Promise<void>;
    output(type: string): Promise<unknown>;
  }

  // html2pdf() with no args returns the builder chain
  function html2pdf(): Html2PdfChain;
  // html2pdf(element, opts) is a shorthand that runs and returns Promise<void> directly
  function html2pdf(element: HTMLElement, options?: Html2PdfOptions): Promise<void>;

  export = html2pdf;
}
