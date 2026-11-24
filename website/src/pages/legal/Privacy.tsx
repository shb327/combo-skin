import { PRIVACY } from '@/legal/privacy'
import { LegalDocumentView } from './LegalDocumentView'

export function Privacy() {
  return <LegalDocumentView doc={PRIVACY} contents />
}
