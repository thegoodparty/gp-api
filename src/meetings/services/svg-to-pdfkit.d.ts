declare module 'svg-to-pdfkit' {
  interface SVGtoPDFOptions {
    width?: number
    height?: number
    preserveAspectRatio?: string
    useCSS?: boolean
    fontCallback?: (
      family: string,
      bold: boolean,
      italic: boolean,
      options: Record<string, unknown>,
    ) => string | Buffer
    imageCallback?: (link: string) => string | Buffer
    colorCallback?: (
      colorAndOpacity: [string | number[], number],
      element: unknown,
    ) => [string, number]
    documentCallback?: (element: unknown) => void
    warningCallback?: (warning: string) => void
    assumePt?: boolean
    precision?: number
  }

  function SVGtoPDF(
    doc: PDFKit.PDFDocument,
    svg: string,
    x?: number,
    y?: number,
    options?: SVGtoPDFOptions,
  ): PDFKit.PDFDocument

  export default SVGtoPDF
}
