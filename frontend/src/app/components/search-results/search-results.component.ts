import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PdfStateService } from '../../services/pdf-state.service';
import { PdfApiService } from '../../services/pdf-api.service';
import { PageMatch, PdfSearchResult, SelectedRowItem } from '../../models/search-result.model';

interface ExtractedNotice {
  message: string;
  newDocId: number;
  newFileName: string;
}

@Component({
  selector: 'app-search-results',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="results-container">
      <!-- Extraction Success Toast / Banner -->
      <div *ngIf="extractedBanner" class="extract-alert">
        <div class="alert-left">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          <span class="alert-msg">{{ extractedBanner.message }}</span>
        </div>
        <div class="alert-actions">
          <button (click)="openExtracted(extractedBanner.newDocId, extractedBanner.newFileName)" class="btn-open-extracted">
            Open in Viewer &rarr;
          </button>
          <button (click)="extractedBanner = null" class="btn-dismiss">&times;</button>
        </div>
      </div>

      <!-- Results Header -->
      <div class="results-header" *ngIf="searchedPin$ | async as pin">
        <div class="header-left">
          <h3>
            Matching PDFs for PIN 
            <span class="highlight-pin">{{ pin }}</span>
          </h3>
          <span class="results-count" *ngIf="results$ | async as results">
            {{ results.length }} document{{ results.length === 1 ? '' : 's' }} found
          </span>
        </div>
      </div>

      <!-- Multi-Select & Batch Export Bar -->
      <!-- Multi-Select & Batch Export Bar -->
      <div class="batch-bar" *ngIf="!(isSearching$ | async) && (results$ | async) as results">
        <ng-container *ngIf="results.length > 0">
          <div class="batch-left">
            <label class="select-all-label">
              <input 
                type="checkbox" 
                [checked]="isAllSelected(results)" 
                (change)="toggleSelectAll(results)" 
                class="row-checkbox" />
              <span>Select All / Deselect All</span>
            </label>
            <span class="selected-badge" *ngIf="selectedRows$ | async as selRows">
              {{ selRows.length }} of {{ getTotalMatchesCount(results) }} selected
            </span>
          </div>

          <div class="batch-actions">
            <!-- Consolidated PDF Export Button: enabled when at least 1 record is selected -->
            <button 
              (click)="exportSelectedToSinglePdf()" 
              [disabled]="((selectedRows$ | async)?.length || 0) === 0 || isExtractingBatch" 
              class="btn-extract-batch"
              title="Combine all selected records into one single consolidated PDF file">
              <span *ngIf="isExtractingBatch" class="btn-spinner"></span>
              <svg *ngIf="!isExtractingBatch" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="12" y1="18" x2="12" y2="12"></line>
                <line x1="9" y1="15" x2="15" y2="15"></line>
              </svg>
              <span>Export Selected to Single PDF</span>
              <span class="btn-count-badge" *ngIf="((selectedRows$ | async)?.length || 0) > 0">
                ({{ (selectedRows$ | async)?.length }})
              </span>
            </button>
            
            <button 
              *ngIf="((selectedRows$ | async)?.length || 0) > 0"
              (click)="clearSelection()" 
              class="btn-clear-selection"
              title="Deselect all records">
              Deselect All
            </button>
          </div>
        </ng-container>
      </div>

      <!-- Loading State -->
      <div *ngIf="isSearching$ | async" class="loading-state">
        <div class="spinner"></div>
        <span>Searching indexed PDFs in database...</span>
      </div>

      <!-- No Match Found State -->
      <div *ngIf="!(isSearching$ | async) && (searchedPin$ | async) && (results$ | async)?.length === 0" class="empty-state">
        <div class="empty-icon">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            <line x1="8" y1="11" x2="14" y2="11"></line>
          </svg>
        </div>
        <p class="empty-title">No matching PDFs found</p>
        <p class="empty-desc">
          None of the uploaded documents contain PIN code <strong>{{ searchedPin$ | async }}</strong>. 
          Try another PIN code or upload more documents.
        </p>
      </div>

      <!-- Results List -->
      <div *ngIf="!(isSearching$ | async) && (results$ | async) as results" class="results-list">
        <div 
          *ngFor="let item of results" 
          class="result-card" 
          [class.active-card]="isActive(item.documentId)">
          
          <div class="card-header">
            <div class="doc-info">
              <div class="doc-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                </svg>
              </div>
              <div class="doc-name-group">
                <span class="doc-name" [title]="item.fileName">{{ item.fileName }}</span>
                <span class="doc-meta">
                  {{ item.pageCount }} pages &bull; {{ (item.fileSize / 1024).toFixed(1) }} KB
                </span>
              </div>
            </div>

            <div class="card-actions">
              <!-- Switch/Open PDF Button -->
              <button 
                *ngIf="!isActive(item.documentId)" 
                (click)="switchDocument(item)" 
                class="btn-switch" 
                title="Open this PDF in the viewer">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="9 18 15 12 9 6"></polyline>
                </svg>
                Switch PDF
              </button>

              <span *ngIf="isActive(item.documentId)" class="status-active-badge">
                <span class="active-dot"></span>
                Currently Open
              </span>
            </div>
          </div>

          <!-- Matching PIN rows list with extract button -->
          <div class="card-body">
            <div class="matches-stat">
              <span class="stat-badge">
                <strong>{{ item.totalOccurrencesInDoc }}</strong> occurrence{{ item.totalOccurrencesInDoc === 1 ? '' : 's' }} across {{ item.matchingPages.length }} page{{ item.matchingPages.length === 1 ? '' : 's' }}
              </span>
            </div>

            <div class="matching-rows-list">
              <div 
                *ngFor="let page of item.matchingPages" 
                class="occurrence-row"
                [class.row-selected]="isRowSelected(item.documentId, page.pageNumber)">
                
                <!-- Checkbox to select row for batch extraction -->
                <div class="row-check-box">
                  <input 
                    type="checkbox" 
                    [checked]="isRowSelected(item.documentId, page.pageNumber)" 
                    (change)="toggleRow(item, page)"
                    class="row-checkbox"
                    [title]="'Select row on Page ' + page.pageNumber + ' to extract into new PDF'" />
                </div>

                <div class="row-main">
                  <div class="row-meta">
                    <button 
                      (click)="onPageChipClick(item, page.pageNumber)" 
                      class="page-indicator-btn"
                      title="Jump to this page in the viewer">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                      </svg>
                      Page {{ page.pageNumber }}
                      <span class="count-tag">({{ page.occurrenceCount }}x)</span>
                    </button>
                  </div>

                  <div class="row-snippet" *ngIf="page.snippet" [title]="page.snippet">
                    &ldquo;{{ page.snippet }}&rdquo;
                  </div>
                </div>

                <div class="row-action">
                  <!-- Export this single row to a new PDF file -->
                  <button 
                    (click)="extractRow(item, page)" 
                    [disabled]="extractingKey === (item.documentId + '_' + page.pageNumber) || isExtractingBatch"
                    class="btn-extract-row" 
                    title="Export this item to a new PDF document">
                    <span *ngIf="extractingKey === (item.documentId + '_' + page.pageNumber)" class="btn-spinner"></span>
                    <svg *ngIf="extractingKey !== (item.documentId + '_' + page.pageNumber)" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                      <polyline points="14 2 14 8 20 8"></polyline>
                      <line x1="12" y1="18" x2="12" y2="12"></line>
                      <line x1="9" y1="15" x2="15" y2="15"></line>
                    </svg>
                    Export PDF
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .results-container {
      margin-top: 1rem;
    }
    .extract-alert {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #ecfdf5;
      border: 1px solid #6ee7b7;
      color: #065f46;
      border-radius: 8px;
      padding: 0.65rem 0.85rem;
      margin-bottom: 0.85rem;
      font-size: 0.8rem;
      gap: 0.5rem;
      animation: fadeIn 0.3s ease;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(-4px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .alert-left {
      display: flex;
      align-items: center;
      gap: 0.45rem;
      min-width: 0;
      flex: 1;
    }
    .alert-msg {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-weight: 500;
    }
    .alert-actions {
      display: flex;
      align-items: center;
      gap: 0.35rem;
    }
    .btn-open-extracted {
      background: #059669;
      color: white;
      border: none;
      border-radius: 4px;
      padding: 0.28rem 0.6rem;
      font-size: 0.75rem;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
      transition: background 0.15s ease;
    }
    .btn-open-extracted:hover {
      background: #047857;
    }
    .btn-dismiss {
      background: none;
      border: none;
      color: #059669;
      font-size: 1.1rem;
      cursor: pointer;
      line-height: 1;
      padding: 0 4px;
    }
    .results-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.65rem;
      padding-bottom: 0.5rem;
      border-bottom: 1px solid #e2e8f0;
    }
    .header-left h3 {
      margin: 0;
      font-size: 0.95rem;
      font-weight: 600;
      color: #1e293b;
    }
    .highlight-pin {
      color: #2563eb;
      background: #eff6ff;
      padding: 0.15rem 0.4rem;
      border-radius: 4px;
      font-family: monospace;
    }
    .results-count {
      font-size: 0.78rem;
      color: #64748b;
    }
    .batch-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 0.5rem 0.75rem;
      margin-bottom: 0.6rem;
      gap: 0.5rem;
      flex-wrap: wrap;
    }
    .batch-left {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .select-all-label {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      font-size: 0.78rem;
      font-weight: 600;
      color: #334155;
      cursor: pointer;
      user-select: none;
    }
    .selected-badge {
      font-size: 0.72rem;
      font-weight: 600;
      background: #dbeafe;
      color: #1e40af;
      padding: 0.15rem 0.45rem;
      border-radius: 10px;
    }
    .batch-actions {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      flex-wrap: wrap;
    }
    .btn-extract-batch {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      background: #059669;
      color: #ffffff;
      border: none;
      border-radius: 6px;
      padding: 0.32rem 0.7rem;
      font-size: 0.75rem;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
      transition: all 0.15s ease;
    }
    .btn-extract-batch:hover:not(:disabled) {
      background: #047857;
    }
    .btn-extract-batch:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    .btn-clear-selection {
      background: none;
      border: none;
      color: #64748b;
      font-size: 0.74rem;
      cursor: pointer;
      padding: 0.2rem 0.4rem;
      border-radius: 4px;
    }
    .btn-clear-selection:hover {
      color: #1e293b;
      background: #e2e8f0;
    }

    .row-checkbox {
      width: 15px;
      height: 15px;
      accent-color: #2563eb;
      cursor: pointer;
      margin: 0;
    }
    .loading-state {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 1.5rem;
      justify-content: center;
      color: #64748b;
      font-size: 0.85rem;
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
    .empty-state {
      text-align: center;
      padding: 2rem 1rem;
      background: #f8fafc;
      border-radius: 12px;
      border: 1px dashed #cbd5e1;
      margin-top: 0.5rem;
    }
    .empty-icon {
      color: #94a3b8;
      margin-bottom: 0.5rem;
    }
    .empty-title {
      font-weight: 600;
      color: #334155;
      margin: 0 0 0.35rem 0;
      font-size: 0.9rem;
    }
    .empty-desc {
      color: #64748b;
      font-size: 0.8rem;
      margin: 0;
      line-height: 1.4;
    }
    .results-list {
      display: flex;
      flex-direction: column;
      gap: 0.85rem;
    }
    .result-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      overflow: hidden;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
      transition: all 0.2s ease;
    }
    .result-card:hover {
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.07);
      border-color: #cbd5e1;
    }
    .active-card {
      border-color: #3b82f6;
      box-shadow: 0 0 0 1.5px rgba(59, 130, 246, 0.3);
    }
    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.65rem 0.85rem;
      background: #f8fafc;
      border-bottom: 1px solid #e2e8f0;
      gap: 0.5rem;
    }
    .doc-info {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      min-width: 0;
      flex: 1;
    }
    .doc-icon {
      color: #ef4444;
      display: flex;
      align-items: center;
    }
    .doc-name-group {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .doc-name {
      font-size: 0.82rem;
      font-weight: 600;
      color: #0f172a;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .doc-meta {
      font-size: 0.72rem;
      color: #64748b;
    }
    .card-actions {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      flex-shrink: 0;
    }
    .btn-switch {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      background: #3b82f6;
      color: white;
      border: none;
      border-radius: 5px;
      padding: 0.3rem 0.6rem;
      font-size: 0.75rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .btn-switch:hover {
      background: #2563eb;
    }
    .status-active-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      background: #dcfce7;
      color: #15803d;
      font-size: 0.72rem;
      font-weight: 600;
      padding: 0.2rem 0.5rem;
      border-radius: 12px;
      border: 1px solid #bbf7d0;
    }
    .active-dot {
      width: 6px;
      height: 6px;
      background: #16a34a;
      border-radius: 50%;
    }
    .card-body {
      padding: 0.75rem 0.85rem;
    }
    .matches-stat {
      margin-bottom: 0.6rem;
    }
    .stat-badge {
      font-size: 0.75rem;
      color: #475569;
    }
    .matching-rows-list {
      display: flex;
      flex-direction: column;
      gap: 0.45rem;
    }
    .occurrence-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
      padding: 0.45rem 0.6rem;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      transition: all 0.15s ease;
    }
    .occurrence-row:hover {
      background: #f1f5f9;
      border-color: #cbd5e1;
    }
    .occurrence-row.row-selected {
      background: #eff6ff;
      border-color: #93c5fd;
    }
    .row-check-box {
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .row-main {
      min-width: 0;
      flex: 1;
    }
    .row-meta {
      display: flex;
      align-items: center;
      margin-bottom: 0.2rem;
    }
    .page-indicator-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      border-radius: 4px;
      padding: 0.15rem 0.45rem;
      font-size: 0.72rem;
      font-weight: 600;
      color: #1d4ed8;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .page-indicator-btn:hover {
      background: #2563eb;
      color: white;
    }
    .count-tag {
      font-size: 0.68rem;
      opacity: 0.85;
    }
    .row-snippet {
      font-size: 0.72rem;
      color: #475569;
      line-height: 1.35;
      font-style: italic;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 220px;
    }
    .row-action {
      flex-shrink: 0;
    }
    .row-action {
      flex-shrink: 0;
      display: flex;
      gap: 0.3rem;
      flex-wrap: wrap;
      justify-content: flex-end;
    }
    .btn-extract-row {
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
      background: #ffffff;
      border: 1px solid #cbd5e1;
      color: #334155;
      border-radius: 5px;
      padding: 0.3rem 0.55rem;
      font-size: 0.72rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s ease;
      white-space: nowrap;
    }
    .btn-extract-row:hover:not(:disabled) {
      background: #f0fdf4;
      border-color: #86efac;
      color: #166534;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
    }
    .btn-extract-row:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .btn-count-badge {
      background: rgba(255, 255, 255, 0.28);
      padding: 0.05rem 0.4rem;
      border-radius: 999px;
      font-size: 0.72rem;
      font-weight: 700;
    }

    .btn-spinner {
      width: 12px;
      height: 12px;
      border: 2px solid #cbd5e1;
      border-top-color: #10b981;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
  `]
})
export class SearchResultsComponent {
  public stateService = inject(PdfStateService);
  private apiService = inject(PdfApiService);

  searchedPin$ = this.stateService.searchedPinCode$;
  results$ = this.stateService.searchResults$;
  isSearching$ = this.stateService.isSearching$;
  selectedRows$ = this.stateService.selectedRows$;

  extractingKey: string | null = null;
  isExtractingBatch = false;
  extractedBanner: ExtractedNotice | null = null;

  isActive(docId: number): boolean {
    return this.stateService.currentActiveDocId === docId;
  }

  switchDocument(result: PdfSearchResult): void {
    const firstPage = result.matchingPages.length > 0 ? result.matchingPages[0].pageNumber : 1;
    this.stateService.openDocument(result.documentId, result.fileName, result.pageCount, firstPage);
  }

  onPageChipClick(result: PdfSearchResult, pageNumber: number): void {
    if (this.isActive(result.documentId)) {
      this.stateService.jumpToPage(pageNumber);
    } else {
      this.stateService.openDocument(result.documentId, result.fileName, result.pageCount, pageNumber);
    }
  }

  // --- Multi-select helpers powered by shared stateService ---
  getRowKey(docId: number, pageNumber: number): string {
    return `${docId}_${pageNumber}`;
  }

  isRowSelected(docId: number, pageNumber: number): boolean {
    return this.stateService.isRowSelected(docId, pageNumber);
  }

  toggleRow(item: PdfSearchResult, page: PageMatch): void {
    this.stateService.toggleRowSelection({
      documentId: item.documentId,
      pageNumber: page.pageNumber,
      fileName: item.fileName,
      snippet: page.snippet
    });
  }

  getTotalMatchesCount(results: PdfSearchResult[]): number {
    return results.reduce((acc, doc) => acc + doc.matchingPages.length, 0);
  }

  isAllSelected(results: PdfSearchResult[]): boolean {
    const total = this.getTotalMatchesCount(results);
    const count = this.stateService.selectedRows.length;
    return total > 0 && count >= total;
  }

  toggleSelectAll(results: PdfSearchResult[]): void {
    if (this.isAllSelected(results)) {
      this.stateService.clearSelectedRows();
    } else {
      this.stateService.selectAllRows(results);
    }
  }

  clearSelection(): void {
    this.stateService.clearSelectedRows();
  }

  // Single row export → creates PDF and downloads once
  extractRow(result: PdfSearchResult, page: PageMatch): void {
    const key = this.getRowKey(result.documentId, page.pageNumber);
    this.extractingKey = key;
    const pin = result.searchedPinCode || this.stateService.currentPinCode;
    const targetFileName = `PIN_${pin}_Selected_Records.pdf`;

    this.apiService.extractRow({
      documentId: result.documentId,
      pinCode: pin,
      pageNumber: page.pageNumber,
      snippet: page.snippet,
      customTargetFileName: targetFileName,
      selectedRows: [{
        documentId: result.documentId,
        pageNumber: page.pageNumber,
        fileName: result.fileName,
        snippet: page.snippet
      }]
    }).subscribe({
      next: (res) => {
        this.extractingKey = null;
        if (res.success) {
          // Download the consolidated PDF once
          this.apiService.downloadPdfFile(res.newDocumentId, res.newFileName || targetFileName);

          this.extractedBanner = {
            message: `Exported 1 record from '${result.fileName}' (Page ${page.pageNumber}) → '${res.newFileName}'. Download started!`,
            newDocId: res.newDocumentId,
            newFileName: res.newFileName
          };
          this.stateService.loadAllDocuments();
        }
      },
      error: (err) => {
        this.extractingKey = null;
        console.error('Failed to export row to PDF:', err);
        alert(err?.error?.error || err?.error?.message || 'Failed to export row to PDF file.');
      }
    });
  }

  // Export all selected items into ONE consolidated PDF (always one output file and one download)
  exportSelectedToSinglePdf(): void {
    const selectedList = this.stateService.selectedRows;
    if (!selectedList || selectedList.length === 0) return;

    const pin = this.stateService.currentPinCode;
    const targetFileName = `PIN_${pin}_Selected_Records.pdf`;
    this.isExtractingBatch = true;

    this.apiService.extractRow({
      pinCode: pin,
      customTargetFileName: targetFileName,
      selectedRows: selectedList
    }).subscribe({
      next: (res) => {
        this.isExtractingBatch = false;
        if (res.success) {
          // Trigger browser download of the consolidated PDF once
          this.apiService.downloadPdfFile(res.newDocumentId, res.newFileName || targetFileName);

          // Clear selection state
          this.stateService.clearSelectedRows();

          const count = res.extractedRowCount || selectedList.length;
          this.extractedBanner = {
            message: count === 1
              ? `Exported 1 selected item to '${res.newFileName}'. Download started!`
              : `Exported all ${count} selected items combined into single PDF '${res.newFileName}'. Download started!`,
            newDocId: res.newDocumentId,
            newFileName: res.newFileName
          };
          this.stateService.loadAllDocuments();
        }
      },
      error: (err) => {
        this.isExtractingBatch = false;
        console.error('Failed to export selected items to PDF:', err);
        alert(err?.error?.error || err?.error?.message || 'Failed to export selected items to PDF.');
      }
    });
  }

  openExtracted(newDocId: number, newFileName: string): void {
    this.stateService.openDocument(newDocId, newFileName, 1, 1);
    this.extractedBanner = null;
  }
}
