import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PdfStateService } from '../../services/pdf-state.service';
import { PdfApiService } from '../../services/pdf-api.service';
import { PdfDocument, ProcessingStatus } from '../../models/pdf-document.model';

@Component({
  selector: 'app-document-list',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="docs-container">
      <div class="docs-header">
        <div class="header-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
          </svg>
          <span>All Uploaded PDFs</span>
        </div>
        <button (click)="refresh()" class="btn-refresh" title="Refresh document list">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M23 4v6h-6"></path>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
          </svg>
        </button>
      </div>

      <div *ngIf="(documents$ | async)?.length === 0" class="empty-docs">
        <p>No PDF documents uploaded yet.</p>
        <small>Use the upload box above to add your first document.</small>
      </div>

      <div class="docs-list" *ngIf="(documents$ | async) as docs">
        <div 
          *ngFor="let doc of docs" 
          class="doc-item" 
          [class.active-item]="isActive(doc.id)">
          
          <div class="item-main">
            <div class="item-name" [title]="doc.fileName">
              {{ doc.fileName }}
            </div>
            
            <div class="item-meta">
              <span>{{ doc.pageCount }} pgs</span>
              <span>&bull;</span>
              <span>{{ (doc.fileSize / 1024).toFixed(0) }} KB</span>
              <span>&bull;</span>
              <span class="status-tag" [ngClass]="getStatusClass(doc.status)">
                {{ getStatusLabel(doc.status) }}
              </span>
            </div>

            <div *ngIf="doc.errorMessage" class="error-snippet" [title]="doc.errorMessage">
              {{ doc.errorMessage }}
            </div>
          </div>

          <div class="item-actions">
            <!-- Open In Viewer -->
            <button 
              (click)="openInViewer(doc)" 
              class="action-btn open-btn" 
              title="Open document">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
            </button>

            <!-- Reindex -->
            <button 
              (click)="reindex(doc.id)" 
              class="action-btn reindex-btn" 
              title="Re-extract and re-index PIN codes">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="23 4 23 10 17 10"></polyline>
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
              </svg>
            </button>

            <!-- Delete -->
            <button 
              (click)="deleteDoc(doc.id)" 
              class="action-btn delete-btn" 
              title="Delete document">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .docs-container {
      margin-top: 1rem;
    }
    .docs-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.75rem;
    }
    .header-title {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.9rem;
      font-weight: 600;
      color: #334155;
    }
    .header-title svg {
      color: #64748b;
    }
    .btn-refresh {
      background: none;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 0.25rem 0.45rem;
      color: #64748b;
      cursor: pointer;
      display: flex;
      align-items: center;
    }
    .btn-refresh:hover {
      background: #f1f5f9;
      color: #1e293b;
    }
    .empty-docs {
      padding: 1rem;
      text-align: center;
      background: #f8fafc;
      border-radius: 8px;
      border: 1px dashed #cbd5e1;
      color: #64748b;
      font-size: 0.82rem;
    }
    .empty-docs p {
      margin: 0 0 0.25rem 0;
    }
    .docs-list {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      max-height: 280px;
      overflow-y: auto;
    }
    .doc-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: white;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 0.65rem 0.85rem;
      transition: all 0.15s ease;
    }
    .doc-item:hover {
      border-color: #cbd5e1;
      background: #fafafa;
    }
    .active-item {
      border-color: #3b82f6 !important;
      background: #eff6ff !important;
    }
    .item-main {
      min-width: 0;
      flex: 1;
    }
    .item-name {
      font-size: 0.82rem;
      font-weight: 600;
      color: #1e293b;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 190px;
    }
    .item-meta {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      font-size: 0.72rem;
      color: #64748b;
      margin-top: 2px;
    }
    .status-tag {
      font-size: 0.68rem;
      padding: 0.1rem 0.35rem;
      border-radius: 4px;
      font-weight: 500;
    }
    .status-completed {
      background: #dcfce7;
      color: #15803d;
    }
    .status-processing {
      background: #fef3c7;
      color: #b45309;
    }
    .status-failed {
      background: #fee2e2;
      color: #b91c1c;
    }
    .status-pending {
      background: #f1f5f9;
      color: #475569;
    }
    .error-snippet {
      font-size: 0.7rem;
      color: #ef4444;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 190px;
      margin-top: 2px;
    }
    .item-actions {
      display: flex;
      gap: 0.3rem;
      margin-left: 0.5rem;
    }
    .action-btn {
      background: #f1f5f9;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 0.35rem;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #475569;
      transition: all 0.15s ease;
    }
    .action-btn:hover {
      background: #e2e8f0;
    }
    .open-btn:hover {
      background: #dbeafe;
      color: #1d4ed8;
      border-color: #bfdbfe;
    }
    .reindex-btn:hover {
      background: #fef3c7;
      color: #b45309;
      border-color: #fde68a;
    }
    .delete-btn:hover {
      background: #fee2e2;
      color: #dc2626;
      border-color: #fecaca;
    }
  `]
})
export class DocumentListComponent implements OnInit {
  private stateService = inject(PdfStateService);
  private apiService = inject(PdfApiService);

  documents$ = this.stateService.allDocuments$;

  ngOnInit(): void {
    this.refresh();
  }

  refresh(): void {
    this.stateService.loadAllDocuments();
  }

  isActive(docId: number): boolean {
    return this.stateService.currentActiveDocId === docId;
  }

  openInViewer(doc: PdfDocument): void {
    this.stateService.openDocument(doc.id, doc.fileName, doc.pageCount, 1);
  }

  reindex(id: number): void {
    this.apiService.reindex(id).subscribe({
      next: () => {
        this.refresh();
        const currentPin = this.stateService.currentPinCode;
        if (currentPin) {
          this.stateService.search(currentPin);
        }
      },
      error: (err) => console.error('Failed to reindex document', err)
    });
  }

  deleteDoc(id: number): void {
    if (!confirm('Are you sure you want to delete this document and its indexed PIN codes?')) {
      return;
    }

    this.apiService.deleteDocument(id).subscribe({
      next: () => {
        this.refresh();
        if (this.stateService.currentActiveDocId === id) {
          this.stateService.clearSearch();
        }
      },
      error: (err) => console.error('Failed to delete document', err)
    });
  }

  getStatusClass(status: ProcessingStatus): string {
    switch (status) {
      case ProcessingStatus.Completed: return 'status-completed';
      case ProcessingStatus.Processing: return 'status-processing';
      case ProcessingStatus.Failed: return 'status-failed';
      default: return 'status-pending';
    }
  }

  getStatusLabel(status: ProcessingStatus): string {
    switch (status) {
      case ProcessingStatus.Completed: return 'Indexed';
      case ProcessingStatus.Processing: return 'Indexing...';
      case ProcessingStatus.Failed: return 'Failed';
      default: return 'Pending';
    }
  }
}
