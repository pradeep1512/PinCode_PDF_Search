import {
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  ChangeDetectorRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import * as pdfjsLib from 'pdfjs-dist';
import { PdfStateService, ActiveDocumentState } from '../../services/pdf-state.service';
import { PdfApiService } from '../../services/pdf-api.service';
import { PageMatch } from '../../models/search-result.model';

// Set PDF.js worker path to local public asset
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
}

interface HighlightBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

@Component({
  selector: 'app-pdf-viewer',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="viewer-wrapper">
      <!-- Viewer Top Toolbar -->
      <div class="viewer-toolbar">
        <!-- Left: Document Info -->
        <div class="toolbar-left">
          <div class="doc-badge" *ngIf="activeDoc">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
            </svg>
            <span class="file-name" [title]="activeDoc.fileName">{{ activeDoc.fileName }}</span>
          </div>
          <span class="no-doc-label" *ngIf="!activeDoc">No Document Selected</span>
        </div>

        <!-- Middle: Page Navigation -->
        <div class="toolbar-center" *ngIf="pdfDoc">
          <button 
            (click)="prevPage()" 
            [disabled]="currentPage <= 1" 
            class="nav-btn" 
            title="Previous Page">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
          </button>

          <div class="page-counter">
            <input 
              type="number" 
              [ngModel]="currentPage" 
              (keyup.enter)="onPageInput($event)"
              min="1" 
              [max]="totalPages" 
              class="page-input" />
            <span class="slash">/</span>
            <span class="total-pages">{{ totalPages }}</span>
          </div>

          <button 
            (click)="nextPage()" 
            [disabled]="currentPage >= totalPages" 
            class="nav-btn" 
            title="Next Page">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </button>
        </div>

        <!-- Right: Zoom & Download Controls -->
        <div class="toolbar-right" *ngIf="pdfDoc">
          <div class="zoom-controls">
            <button (click)="zoomOut()" [disabled]="zoomScale <= 0.6" class="tool-btn" title="Zoom Out">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                <line x1="8" y1="11" x2="14" y2="11"></line>
              </svg>
            </button>
            <span class="zoom-level">{{ Math.round(zoomScale * 100) }}%</span>
            <button (click)="zoomIn()" [disabled]="zoomScale >= 2.5" class="tool-btn" title="Zoom In">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                <line x1="11" y1="8" x2="11" y2="14"></line>
                <line x1="8" y1="11" x2="14" y2="11"></line>
              </svg>
            </button>
            <button (click)="resetZoom()" class="tool-btn reset-btn" title="Fit to 100%">
              100%
            </button>
          </div>

          <div class="divider"></div>

          <button (click)="downloadPdf()" class="tool-btn download-btn" title="Download PDF">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
          </button>
        </div>
      </div>

      <!-- Matching PIN Banner & Occurrence Navigation -->
      <div class="pin-match-banner" *ngIf="searchedPin && matchingPages.length > 0">
        <div class="match-banner-content">
          <div class="match-info">
            <span class="pin-tag">PIN: {{ searchedPin }}</span>
            <span class="match-summary">
              Found on {{ matchingPages.length }} page{{ matchingPages.length > 1 ? 's' : '' }} in this document:
            </span>
          </div>

          <div class="match-page-chips">
            <button 
              *ngFor="let p of matchingPages" 
              (click)="goToPage(p.pageNumber)" 
              class="banner-chip"
              [class.chip-active]="p.pageNumber === currentPage">
              Page {{ p.pageNumber }}
              <span class="badge-count">{{ p.occurrenceCount }}x</span>
            </button>
          </div>

          <div class="match-nav-arrows" *ngIf="matchingPages.length > 1">
            <button (click)="prevMatch()" class="match-nav-btn" title="Previous matching page">
              &larr; Prev Match
            </button>
            <button (click)="nextMatch()" class="match-nav-btn" title="Next matching page">
              Next Match &rarr;
            </button>
          </div>
        </div>
      </div>

      <!-- Main Viewer Area -->
      <div class="viewer-body" #viewerContainer>
        <!-- Loading Indicator -->
        <div *ngIf="isLoading" class="loader-overlay">
          <div class="spinner-large"></div>
          <span class="loading-msg">{{ loadingMessage }}</span>
        </div>

        <!-- Empty State (No Document Selected) -->
        <div *ngIf="!activeDoc && !isLoading" class="no-doc-placeholder">
          <div class="empty-icon-wrap">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
          </div>
          <h3>No PDF Selected</h3>
          <p>Upload a PDF document or choose a matching document from the search results to view it here.</p>
        </div>

        <!-- Rendered Canvas & Highlight Layer Container -->
        <div class="canvas-viewport" [style.display]="activeDoc && !isLoading ? 'flex' : 'none'">
          <div class="canvas-shadow-box">
            <canvas #pdfCanvas></canvas>

            <!-- Dynamic Highlight Overlays for searched PIN code -->
            <div 
              *ngFor="let box of highlightBoxes" 
              class="pin-highlight"
              [style.left.px]="box.left"
              [style.top.px]="box.top"
              [style.width.px]="box.width"
              [style.height.px]="box.height">
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .viewer-wrapper {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: #0f172a;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1);
    }
    .viewer-toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.65rem 1rem;
      background: #1e293b;
      color: #f1f5f9;
      border-bottom: 1px solid #334155;
      gap: 0.75rem;
      flex-wrap: wrap;
    }
    .toolbar-left {
      display: flex;
      align-items: center;
      min-width: 0;
      flex: 1;
    }
    .doc-badge {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      color: #38bdf8;
      min-width: 0;
    }
    .file-name {
      font-size: 0.88rem;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 250px;
      color: #f8fafc;
    }
    .no-doc-label {
      font-size: 0.85rem;
      color: #94a3b8;
    }
    .toolbar-center {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .nav-btn, .tool-btn {
      background: #334155;
      color: #f8fafc;
      border: 1px solid #475569;
      border-radius: 6px;
      padding: 0.35rem 0.5rem;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .nav-btn:hover:not(:disabled), .tool-btn:hover:not(:disabled) {
      background: #475569;
      color: #38bdf8;
    }
    .nav-btn:disabled, .tool-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
    .page-counter {
      display: flex;
      align-items: center;
      gap: 0.3rem;
      font-size: 0.85rem;
      color: #cbd5e1;
    }
    .page-input {
      width: 44px;
      text-align: center;
      background: #0f172a;
      border: 1px solid #475569;
      border-radius: 4px;
      color: #f8fafc;
      padding: 0.25rem;
      font-size: 0.85rem;
    }
    .page-input:focus {
      outline: none;
      border-color: #38bdf8;
    }
    .slash {
      color: #64748b;
    }
    .total-pages {
      color: #94a3b8;
    }
    .toolbar-right {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .zoom-controls {
      display: flex;
      align-items: center;
      gap: 0.35rem;
    }
    .zoom-level {
      font-size: 0.8rem;
      color: #cbd5e1;
      min-width: 40px;
      text-align: center;
      font-variant-numeric: tabular-nums;
    }
    .reset-btn {
      font-size: 0.75rem;
      padding: 0.3rem 0.45rem;
    }
    .divider {
      width: 1px;
      height: 20px;
      background: #475569;
      margin: 0 0.25rem;
    }
    .download-btn:hover {
      color: #34d399 !important;
      border-color: #059669 !important;
    }

    /* Matching PIN Banner */
    .pin-match-banner {
      background: #1e3a8a;
      border-bottom: 1px solid #2563eb;
      padding: 0.5rem 1rem;
      color: #dbeafe;
    }
    .match-banner-content {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      flex-wrap: wrap;
    }
    .match-info {
      display: flex;
      align-items: center;
      gap: 0.6rem;
    }
    .pin-tag {
      background: #3b82f6;
      color: white;
      padding: 0.15rem 0.5rem;
      border-radius: 4px;
      font-size: 0.78rem;
      font-weight: 700;
      letter-spacing: 0.05em;
    }
    .match-summary {
      font-size: 0.82rem;
      color: #bfdbfe;
    }
    .match-page-chips {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      flex-wrap: wrap;
    }
    .banner-chip {
      background: rgba(255, 255, 255, 0.15);
      border: 1px solid rgba(255, 255, 255, 0.25);
      border-radius: 4px;
      color: white;
      font-size: 0.75rem;
      padding: 0.2rem 0.45rem;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 0.25rem;
      transition: all 0.15s ease;
    }
    .banner-chip:hover {
      background: rgba(255, 255, 255, 0.3);
      border-color: white;
    }
    .chip-active {
      background: #fbbf24 !important;
      color: #78350f !important;
      border-color: #f59e0b !important;
      font-weight: 700;
    }
    .badge-count {
      font-size: 0.68rem;
      opacity: 0.85;
    }
    .match-nav-arrows {
      display: flex;
      gap: 0.35rem;
    }
    .match-nav-btn {
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.2);
      color: #e0e7ff;
      border-radius: 4px;
      font-size: 0.72rem;
      padding: 0.2rem 0.5rem;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .match-nav-btn:hover {
      background: rgba(255, 255, 255, 0.25);
      color: white;
    }

    /* Viewer Body */
    .viewer-body {
      flex: 1;
      position: relative;
      overflow: auto;
      display: flex;
      align-items: flex-start;
      justify-content: center;
      padding: 1.5rem;
      min-height: 500px;
      background: #0f172a;
    }
    .loader-overlay {
      position: absolute;
      inset: 0;
      background: rgba(15, 23, 42, 0.85);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 1rem;
      color: #94a3b8;
      z-index: 10;
    }
    .spinner-large {
      width: 36px;
      height: 36px;
      border: 3px solid #334155;
      border-top-color: #38bdf8;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .loading-msg {
      font-size: 0.9rem;
      color: #cbd5e1;
    }
    .no-doc-placeholder {
      text-align: center;
      color: #64748b;
      max-width: 380px;
      margin: auto;
      padding: 2rem;
    }
    .empty-icon-wrap {
      color: #475569;
      margin-bottom: 1rem;
    }
    .no-doc-placeholder h3 {
      color: #e2e8f0;
      margin: 0 0 0.5rem 0;
      font-size: 1.15rem;
    }
    .no-doc-placeholder p {
      font-size: 0.85rem;
      line-height: 1.5;
      margin: 0;
    }
    .canvas-viewport {
      display: flex;
      justify-content: center;
      width: 100%;
    }
    .canvas-shadow-box {
      position: relative;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.6), 0 8px 10px -6px rgba(0, 0, 0, 0.5);
      border-radius: 4px;
      line-height: 0;
    }
    canvas {
      display: block;
      border-radius: 4px;
      background: white;
    }
    .pin-highlight {
      position: absolute;
      background: rgba(254, 240, 138, 0.65);
      border: 2px solid #eab308;
      border-radius: 3px;
      pointer-events: none;
      animation: highlightPulse 2s infinite;
      box-shadow: 0 0 8px rgba(234, 179, 8, 0.6);
    }
    @keyframes highlightPulse {
      0%, 100% { opacity: 0.9; }
      50% { opacity: 0.45; }
    }
  `]
})
export class PdfViewerComponent implements OnInit, OnDestroy {
  @ViewChild('pdfCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('viewerContainer') viewerContainerRef!: ElementRef<HTMLDivElement>;

  activeDoc: ActiveDocumentState | null = null;
  searchedPin: string = '';
  matchingPages: PageMatch[] = [];

  pdfDoc: any = null;
  currentPage = 1;
  totalPages = 1;
  zoomScale = 1.0;
  isLoading = false;
  loadingMessage = 'Loading PDF...';

  highlightBoxes: HighlightBox[] = [];
  Math = Math;

  private subscriptions: Subscription[] = [];
  private renderTask: any = null;

  constructor(
    private stateService: PdfStateService,
    private apiService: PdfApiService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    // 1. Listen for active document switch
    this.subscriptions.push(
      this.stateService.activeDocument$.subscribe(doc => {
        if (!doc) {
          this.activeDoc = null;
          this.pdfDoc = null;
          this.highlightBoxes = [];
          this.cdr.detectChanges();
          return;
        }

        // If it's a new document or first load
        const isNewDoc = !this.activeDoc || this.activeDoc.id !== doc.id;
        this.activeDoc = doc;

        if (isNewDoc) {
          this.loadPdf(doc.id, doc.initialPage || 1);
        } else if (doc.initialPage && doc.initialPage !== this.currentPage) {
          this.goToPage(doc.initialPage);
        }
      })
    );

    // 2. Listen for searched PIN code
    this.subscriptions.push(
      this.stateService.searchedPinCode$.subscribe(pin => {
        this.searchedPin = pin;
        if (this.pdfDoc) {
          this.renderCurrentPage();
        }
      })
    );

    // 3. Listen for active document matching pages
    this.subscriptions.push(
      this.stateService.activeDocMatchingPages$.subscribe(pages => {
        this.matchingPages = pages || [];
        this.cdr.detectChanges();
      })
    );

    // 4. Listen for jump to page requests
    this.subscriptions.push(
      this.stateService.targetPageJump$.subscribe(pageNum => {
        if (pageNum && pageNum !== this.currentPage && this.pdfDoc) {
          this.goToPage(pageNum);
        }
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
    if (this.renderTask) {
      this.renderTask.cancel();
    }
  }

  loadPdf(docId: number, targetPage: number = 1): void {
    this.isLoading = true;
    this.loadingMessage = `Loading ${this.activeDoc?.fileName || 'document'}...`;
    this.highlightBoxes = [];
    this.cdr.detectChanges();

    const pdfUrl = this.apiService.getOpenPdfUrl(docId);

    const loadingTask = pdfjsLib.getDocument({
      url: pdfUrl,
      withCredentials: false
    });

    loadingTask.promise.then(
      (pdf) => {
        this.pdfDoc = pdf;
        this.totalPages = pdf.numPages;
        this.currentPage = Math.min(Math.max(1, targetPage), this.totalPages);
        this.isLoading = false;
        this.cdr.detectChanges();
        this.renderCurrentPage();
      },
      (error) => {
        console.error('Error loading PDF document:', error);
        this.isLoading = false;
        this.loadingMessage = 'Failed to load PDF document.';
        this.cdr.detectChanges();
      }
    );
  }

  async renderCurrentPage(): Promise<void> {
    if (!this.pdfDoc || !this.canvasRef) {
      return;
    }

    if (this.renderTask) {
      try {
        this.renderTask.cancel();
      } catch (e) {
        // Ignore cancellation error
      }
    }

    try {
      const page = await this.pdfDoc.getPage(this.currentPage);
      const canvas = this.canvasRef.nativeElement;
      const context = canvas.getContext('2d');
      if (!context) return;

      const viewport = page.getViewport({ scale: this.zoomScale });

      // Support high DPI displays
      const outputScale = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = Math.floor(viewport.width) + 'px';
      canvas.style.height = Math.floor(viewport.height) + 'px';

      const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined;

      const renderContext = {
        canvasContext: context,
        transform: transform,
        viewport: viewport
      };

      this.renderTask = page.render(renderContext);
      await this.renderTask.promise;

      // Extract highlights if PIN code is active
      await this.highlightPinOccurrences(page, viewport);
      this.cdr.detectChanges();
    } catch (err: any) {
      if (err?.name !== 'RenderingCancelledException') {
        console.error('Error rendering page:', err);
      }
    }
  }

  private async highlightPinOccurrences(page: any, viewport: any): Promise<void> {
    this.highlightBoxes = [];
    const pin = this.searchedPin?.trim();
    if (!pin) return;

    try {
      const textContent = await page.getTextContent();
      const boxes: HighlightBox[] = [];

      for (const item of textContent.items) {
        if (!item.str || typeof item.str !== 'string') continue;

        const str = item.str;
        const matchIndex = str.indexOf(pin);

        if (matchIndex !== -1) {
          // Compute bounding box coordinates via item transform
          const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
          const fontHeight = Math.sqrt(tx[2] * tx[2] + tx[3] * tx[3]);
          const fontWidth = Math.sqrt(tx[0] * tx[0] + tx[1] * tx[1]);
          const charWidth = item.width ? (item.width * viewport.scale) / str.length : fontWidth * 0.6;

          const boxLeft = tx[4] + matchIndex * charWidth;
          const boxTop = tx[5] - fontHeight;
          const boxWidth = pin.length * charWidth;
          const boxHeight = fontHeight * 1.25;

          boxes.push({
            left: Math.max(0, boxLeft - 2),
            top: Math.max(0, boxTop - 2),
            width: boxWidth + 4,
            height: boxHeight + 4
          });
        }
      }

      this.highlightBoxes = boxes;
    } catch (e) {
      console.warn('Could not extract text layer for highlighting:', e);
    }
  }

  goToPage(pageNum: number): void {
    if (pageNum >= 1 && pageNum <= this.totalPages) {
      this.currentPage = pageNum;
      this.renderCurrentPage();
    }
  }

  prevPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.renderCurrentPage();
    }
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.renderCurrentPage();
    }
  }

  onPageInput(event: any): void {
    const val = parseInt(event.target.value, 10);
    if (!isNaN(val)) {
      this.goToPage(val);
    }
  }

  zoomIn(): void {
    if (this.zoomScale < 2.5) {
      this.zoomScale = Math.round((this.zoomScale + 0.15) * 100) / 100;
      this.renderCurrentPage();
    }
  }

  zoomOut(): void {
    if (this.zoomScale > 0.6) {
      this.zoomScale = Math.round((this.zoomScale - 0.15) * 100) / 100;
      this.renderCurrentPage();
    }
  }

  resetZoom(): void {
    this.zoomScale = 1.0;
    this.renderCurrentPage();
  }

  prevMatch(): void {
    if (this.matchingPages.length === 0) return;
    const earlier = this.matchingPages
      .filter(p => p.pageNumber < this.currentPage)
      .sort((a, b) => b.pageNumber - a.pageNumber);

    if (earlier.length > 0) {
      this.goToPage(earlier[0].pageNumber);
    } else {
      // Wrap around to last match
      this.goToPage(this.matchingPages[this.matchingPages.length - 1].pageNumber);
    }
  }

  nextMatch(): void {
    if (this.matchingPages.length === 0) return;
    const later = this.matchingPages
      .filter(p => p.pageNumber > this.currentPage)
      .sort((a, b) => a.pageNumber - b.pageNumber);

    if (later.length > 0) {
      this.goToPage(later[0].pageNumber);
    } else {
      // Wrap around to first match
      this.goToPage(this.matchingPages[0].pageNumber);
    }
  }

  downloadPdf(): void {
    if (!this.activeDoc) return;
    const url = this.apiService.getOpenPdfUrl(this.activeDoc.id);
    const a = document.createElement('a');
    a.href = url;
    a.download = this.activeDoc.fileName;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}
