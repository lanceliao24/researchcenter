declare module 'pdf-parse' {
  interface PDFData {
    numpages: number
    text: string
    info: Record<string, unknown>
  }
  function pdfParse(dataBuffer: Buffer): Promise<PDFData>
  export = pdfParse
}
