export enum ProcessingStatus {
  Pending = 0,
  Processing = 1,
  Completed = 2,
  Failed = 3
}

export interface PdfDocument {
  id: number;
  fileName: string;
  fileSize: number;
  pageCount: number;
  uploadedAt: string;
  status: ProcessingStatus;
  statusText?: string;
  errorMessage?: string | null;
  totalPinCodesIndexed?: number;
}

export interface UploadResponse {
  totalReceived: number;
  successCount: number;
  failureCount: number;
  uploadedDocuments: PdfDocument[];
  errors: string[];
}
