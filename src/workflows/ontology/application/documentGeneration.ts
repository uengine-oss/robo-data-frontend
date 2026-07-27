export type OntologyDocumentInputType = 'text' | 'pdf' | 'url'

export interface OntologyDocumentGenerationForm {
  inputType: OntologyDocumentInputType
  text: string
  pdfUrl: string
  selectedGlossaryIds: string[]
}

export type OntologyDocumentGenerationBody = Readonly<{
  inputType: 'text' | 'pdf'
  text?: string
  pdfUrl?: string
  pdfContent?: string
  glossary_ids?: readonly string[]
}>

export interface OntologyDocumentGenerationTarget {
  inputType: OntologyDocumentInputType
  body: OntologyDocumentGenerationBody
}

export class OntologyDocumentGenerationValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OntologyDocumentGenerationValidationError'
  }
}

export function isPdfDocument(file: Pick<File, 'name' | 'type'>): boolean {
  return file.type === 'application/pdf'
    || (file.type === '' && file.name.toLowerCase().endsWith('.pdf'))
}

export function canCreateOntologyDocumentGenerationTarget(
  form: OntologyDocumentGenerationForm,
  useAllGlossaries: boolean,
  hasPdfFile: boolean,
): boolean {
  const hasInput = form.inputType === 'text'
    ? form.text.trim().length > 0
    : form.inputType === 'url'
      ? form.pdfUrl.trim().length > 0
      : hasPdfFile
  return hasInput && (useAllGlossaries || form.selectedGlossaryIds.length > 0)
}

export function createOntologyDocumentGenerationTarget(
  form: OntologyDocumentGenerationForm,
  useAllGlossaries: boolean,
  pdfContent?: string,
): OntologyDocumentGenerationTarget {
  const glossaryIds = [...form.selectedGlossaryIds]
  if (!useAllGlossaries && glossaryIds.length === 0) {
    throw new OntologyDocumentGenerationValidationError('용어집을 1개 이상 선택해주세요.')
  }

  const glossaryBody = useAllGlossaries
    ? {}
    : { glossary_ids: Object.freeze(glossaryIds) }

  if (form.inputType === 'text') {
    if (!form.text.trim()) {
      throw new OntologyDocumentGenerationValidationError('분석할 문서 내용을 입력해주세요.')
    }
    return Object.freeze({
      inputType: 'text',
      body: Object.freeze({
        inputType: 'text',
        text: form.text,
        ...glossaryBody,
      }),
    })
  }

  if (form.inputType === 'url') {
    if (!form.pdfUrl.trim()) {
      throw new OntologyDocumentGenerationValidationError('PDF URL을 입력해주세요.')
    }
    return Object.freeze({
      inputType: 'url',
      body: Object.freeze({
        inputType: 'pdf',
        pdfUrl: form.pdfUrl,
        ...glossaryBody,
      }),
    })
  }

  if (!pdfContent) {
    throw new OntologyDocumentGenerationValidationError('생성할 PDF 파일을 선택해주세요.')
  }
  return Object.freeze({
    inputType: 'pdf',
    body: Object.freeze({
      inputType: 'pdf',
      pdfContent,
      ...glossaryBody,
    }),
  })
}
