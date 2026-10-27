export interface PageMatch {
  pageNumber: number;
  occurrenceCount: number;
  snippet?: string | null;
}

export interface PdfSearchResult {
  documentId: number;
  fileName: string;
  fileSize: number;
  pageCount: number;
  uploadedAt: string;
  searchedPinCode: string;
  totalOccurrencesInDoc: number;
  matchingPages: PageMatch[];
}

export interface PdfPagesResponse {
  pdfDocumentId: number;
  fileName: string;
  pinCode: string;
  pages: PageMatch[];
}

export interface SelectedRowItem {
  documentId: number;
  pageNumber: number;
  snippet?: string | null;
  fileName?: string;
}

export interface ExtractRowRequest {
  documentId?: number;
  pinCode: string;
  pageNumber?: number;
  snippet?: string | null;
  customTargetFileName?: string | null;
  selectedRows?: SelectedRowItem[];
  targetDocumentId?: number | null;
}

export interface ExtractRowResponse {
  success: boolean;
  message: string;
  newDocumentId: number;
  newFileName: string;
  removedDocumentId?: number;
  removedPageNumber?: number;
  pinCode: string;
  extractedRowCount?: number;
  wasAppended?: boolean;
  totalRecordsInDocument?: number;
  removedRows?: SelectedRowItem[];
}
