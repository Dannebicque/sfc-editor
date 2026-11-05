import type { Lang } from '../i18n';
import { en } from './en';
import { fr } from './fr';
import type { LegalDoc } from './types';

export { LEGAL } from './config';
export { expand, missingFields, type Segment } from './render';
export { isLegalDocId, LEGAL_DOC_IDS, type LegalBlock, type LegalDoc, type LegalDocId } from './types';

export const LEGAL_DOCS: Record<Lang, LegalDoc[]> = { fr, en };
