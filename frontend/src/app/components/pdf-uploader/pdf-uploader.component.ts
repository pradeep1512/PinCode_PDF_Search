import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PdfApiService } from '../../services/pdf-api.service';
import { PdfStateService } from '../../services/pdf-state.service';
import { UploadResponse } from '../../models/pdf-document.model';

@Component({
  selector: 'app-pdf-uploader',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="uploader-card">
      <div 
        class="dropzone" 
        [class.dragging]="isDragging"
        (dragover)="onDragOver($event)"
        (dragleave)="onDragLeave($event)"
        (drop)="onDrop($event)"
        (click)="fileInput.click()">
        
        <input 
          #fileInput 
          type="file" 
          multiple 
          accept=".pdf,application/pdf" 
          style="display: none" 
          (change)="onFilesSelected($event)" />

        <div class="upload-icon">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="17 8 12 3 7 8"></polyline>
            <line x1="12" y1="3" x2="12" y2="15"></line>
          </svg>
        </div>

        <div class="upload-prompt">
          <p class="primary-text">
            <strong>Click to upload</strong> or drag & drop PDFs
          </p>
          <p class="secondary-text">Multi-file upload supported. Max 50 MB per PDF.</p>
        </div>
      </div>

      <!-- Uploading Spinner / Progress -->
      <div *ngIf="isUploading" class="uploading-state">
        <div class="spinner"></div>
        <span>Uploading & indexing PDF documents with PIN code extractor...</span>
      </div>

      <!-- Upload Feedback Alerts -->
      <div *ngIf="uploadSuccessMessage" class="alert alert-success">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        <span>{{ uploadSuccessMessage }}</span>
      </div>

      <div *ngIf="uploadErrorMessage" class="alert alert-danger">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <span>{{ uploadErrorMessage }}</span>
      </div>
    </div>
  `,
  styles: [`
    .uploader-card {
      margin-bottom: 1.25rem;
    }
    .dropzone {
      border: 2px dashed #cbd5e1;
      border-radius: 12px;
      padding: 1.25rem 1rem;
      text-align: center;
      cursor: pointer;
      background: #f8fafc;
      transition: all 0.2s ease;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.5rem;
    }
    .dropzone:hover, .dropzone.dragging {
      border-color: #3b82f6;
      background: #eff6ff;
      transform: translateY(-1px);
    }
    .upload-icon {
      color: #3b82f6;
      background: #e0e7ff;
      width: 48px;
      height: 48px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .upload-prompt .primary-text {
      margin: 0;
      font-size: 0.9rem;
      color: #1e293b;
    }
    .upload-prompt .secondary-text {
      margin: 0.25rem 0 0;
      font-size: 0.75rem;
      color: #64748b;
    }
    .uploading-state {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.75rem 1rem;
      background: #f1f5f9;
      border-radius: 8px;
      margin-top: 0.75rem;
      font-size: 0.85rem;
      color: #334155;
    }
    .spinner {
      width: 18px;
      height: 18px;
      border: 2px solid #e2e8f0;
      border-top-color: #3b82f6;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .alert {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.65rem 0.85rem;
      border-radius: 8px;
      margin-top: 0.75rem;
      font-size: 0.82rem;
    }
    .alert-success {
      background: #ecfdf5;
      color: #065f46;
      border: 1px solid #a7f3d0;
    }
    .alert-danger {
      background: #fef2f2;
      color: #991b1b;
      border: 1px solid #fecaca;
    }
  `]
})
export class PdfUploaderComponent {
  isDragging = false;
  isUploading = false;
  uploadSuccessMessage: string | null = null;
  uploadErrorMessage: string | null = null;

  constructor(
    private apiService: PdfApiService,
    private stateService: PdfStateService
  ) {}

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = true;
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = false;
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = false;

    if (event.dataTransfer?.files && event.dataTransfer.files.length > 0) {
      this.handleFiles(Array.from(event.dataTransfer.files));
    }
  }

  onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.handleFiles(Array.from(input.files));
      input.value = ''; // Reset input
    }
  }

  private handleFiles(files: File[]): void {
    const pdfFiles = files.filter(f => f.name.toLowerCase().endsWith('.pdf'));

    if (pdfFiles.length === 0) {
      this.uploadErrorMessage = 'Please select valid PDF documents (.pdf).';
      setTimeout(() => this.uploadErrorMessage = null, 5000);
      return;
    }

    this.isUploading = true;
    this.uploadSuccessMessage = null;
    this.uploadErrorMessage = null;

    this.apiService.uploadFiles(pdfFiles).subscribe({
      next: (res: UploadResponse) => {
        this.isUploading = false;
        if (res.successCount > 0) {
          this.uploadSuccessMessage = `Successfully uploaded & indexed ${res.successCount} PDF document(s).`;
          this.stateService.loadAllDocuments();

          // If no document is currently open, open the first newly uploaded file
          if (!this.stateService.currentActiveDocId && res.uploadedDocuments.length > 0) {
            const first = res.uploadedDocuments[0];
            this.stateService.openDocument(first.id, first.fileName, first.pageCount, 1);
          }

          // If a search was active, re-execute the search to incorporate newly indexed documents!
          const currentPin = this.stateService.currentPinCode;
          if (currentPin) {
            this.stateService.search(currentPin);
          }
        }

        if (res.failureCount > 0) {
          this.uploadErrorMessage = `Failed to process ${res.failureCount} file(s): ${res.errors.join(', ')}`;
        }

        setTimeout(() => {
          this.uploadSuccessMessage = null;
        }, 6000);
      },
      error: (err) => {
        this.isUploading = false;
        this.uploadErrorMessage = err?.error?.error || err?.error?.message || 'Error occurred while uploading files.';
        setTimeout(() => this.uploadErrorMessage = null, 6000);
      }
    });
  }
}
