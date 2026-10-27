import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { PdfDocument } from '../models/pdf-document.model';
import { PageMatch, PdfSearchResult, SelectedRowItem } from '../models/search-result.model';
import { PdfApiService } from './pdf-api.service';

export interface ActiveDocumentState {
  id: number;
  fileName: string;
  pageCount: number;
  initialPage?: number;
}

@Injectable({
  providedIn: 'root'
})
export class PdfStateService {
  // Currently opened PDF
  private activeDocumentSubject = new BehaviorSubject<ActiveDocumentState | null>(null);
  activeDocument$: Observable<ActiveDocumentState | null> = this.activeDocumentSubject.asObservable();

  // Current PIN code searched
  private searchedPinCodeSubject = new BehaviorSubject<string>('');
  searchedPinCode$: Observable<string> = this.searchedPinCodeSubject.asObservable();

  // Search results list
  private searchResultsSubject = new BehaviorSubject<PdfSearchResult[]>([]);
  searchResults$: Observable<PdfSearchResult[]> = this.searchResultsSubject.asObservable();

  // Selected records for batch export across all result cards
  private selectedRowsSubject = new BehaviorSubject<SelectedRowItem[]>([]);
  selectedRows$: Observable<SelectedRowItem[]> = this.selectedRowsSubject.asObservable();

  // Matching pages in the currently active document
  private activeDocMatchingPagesSubject = new BehaviorSubject<PageMatch[]>([]);
  activeDocMatchingPages$: Observable<PageMatch[]> = this.activeDocMatchingPagesSubject.asObservable();

  // Target page jump request
  private targetPageJumpSubject = new BehaviorSubject<number | null>(null);
  targetPageJump$: Observable<number | null> = this.targetPageJumpSubject.asObservable();

  // All uploaded documents list
  private allDocumentsSubject = new BehaviorSubject<PdfDocument[]>([]);
  allDocuments$: Observable<PdfDocument[]> = this.allDocumentsSubject.asObservable();

  // Global loading and error states
  private isSearchingSubject = new BehaviorSubject<boolean>(false);
  isSearching$: Observable<boolean> = this.isSearchingSubject.asObservable();

  private searchErrorSubject = new BehaviorSubject<string | null>(null);
  searchError$: Observable<string | null> = this.searchErrorSubject.asObservable();

  constructor(private apiService: PdfApiService) {}

  setPinCode(pin: string): void {
    this.searchedPinCodeSubject.next(pin.trim());
  }

  get currentPinCode(): string {
    return this.searchedPinCodeSubject.value;
  }

  get currentActiveDocId(): number | null {
    return this.activeDocumentSubject.value?.id ?? null;
  }

  setSearchResults(results: PdfSearchResult[]): void {
    this.searchResultsSubject.next(results);
    this.updateActiveDocMatchingPages();
  }

  clearSearch(): void {
    this.searchedPinCodeSubject.next('');
    this.searchResultsSubject.next([]);
    this.activeDocMatchingPagesSubject.next([]);
    this.searchErrorSubject.next(null);
    this.clearSelectedRows();
  }

  // --- Shared Selection State Management ---
  get selectedRows(): SelectedRowItem[] {
    return this.selectedRowsSubject.value;
  }

  isRowSelected(docId: number, pageNumber: number): boolean {
    return this.selectedRowsSubject.value.some(
      r => r.documentId === docId && r.pageNumber === pageNumber
    );
  }

  toggleRowSelection(item: SelectedRowItem): void {
    const current = this.selectedRowsSubject.value;
    const index = current.findIndex(
      r => r.documentId === item.documentId && r.pageNumber === item.pageNumber
    );
    if (index >= 0) {
      const updated = [...current];
      updated.splice(index, 1);
      this.selectedRowsSubject.next(updated);
    } else {
      this.selectedRowsSubject.next([...current, item]);
    }
  }

  selectAllRows(results: PdfSearchResult[]): void {
    const allItems: SelectedRowItem[] = [];
    results.forEach(doc => {
      doc.matchingPages.forEach(p => {
        allItems.push({
          documentId: doc.documentId,
          pageNumber: p.pageNumber,
          fileName: doc.fileName,
          snippet: p.snippet
        });
      });
    });
    this.selectedRowsSubject.next(allItems);
  }

  clearSelectedRows(): void {
    this.selectedRowsSubject.next([]);
  }

  removeRowFromSearchResults(documentId: number, pageNumber: number): void {
    this.removeRowsFromSearchResults([{ documentId, pageNumber }]);
  }

  removeRowsFromSearchResults(items: { documentId: number, pageNumber: number }[]): void {
    const removalSet = new Set(items.map(i => `${i.documentId}_${i.pageNumber}`));
    const current = this.searchResultsSubject.value;

    const updated = current
      .map(doc => {
        const remainingPages = doc.matchingPages.filter(p => !removalSet.has(`${doc.documentId}_${p.pageNumber}`));
        const totalOccurrences = remainingPages.reduce((sum, p) => sum + (p.occurrenceCount || 1), 0);
        return {
          ...doc,
          totalOccurrencesInDoc: totalOccurrences,
          matchingPages: remainingPages
        };
      })
      .filter(doc => doc.matchingPages.length > 0);

    this.searchResultsSubject.next(updated);
    this.updateActiveDocMatchingPages();
  }

  /**
   * Switch to a new PDF document.
   * Preserves current search results and active search term!
   */
  openDocument(docId: number, fileName: string, pageCount: number = 1, targetPage: number = 1): void {
    this.activeDocumentSubject.next({
      id: docId,
      fileName,
      pageCount,
      initialPage: targetPage
    });

    this.jumpToPage(targetPage);
    this.updateActiveDocMatchingPages();
  }

  jumpToPage(pageNum: number): void {
    this.targetPageJumpSubject.next(pageNum);
  }

  private updateActiveDocMatchingPages(): void {
    const activeDoc = this.activeDocumentSubject.value;
    const pin = this.searchedPinCodeSubject.value;

    if (!activeDoc || !pin) {
      this.activeDocMatchingPagesSubject.next([]);
      return;
    }

    const currentResults = this.searchResultsSubject.value;
    const matchInResults = currentResults.find(r => r.documentId === activeDoc.id);

    if (matchInResults) {
      this.activeDocMatchingPagesSubject.next(matchInResults.matchingPages);
    } else {
      // Query API directly for pages
      this.apiService.getMatchingPages(activeDoc.id, pin).subscribe({
        next: (resp) => {
          this.activeDocMatchingPagesSubject.next(resp.pages || []);
        },
        error: () => {
          this.activeDocMatchingPagesSubject.next([]);
        }
      });
    }
  }

  loadAllDocuments(): void {
    this.apiService.getAllDocuments().subscribe({
      next: (docs) => this.allDocumentsSubject.next(docs),
      error: (err) => console.error('Failed to load documents list', err)
    });
  }

  search(pinCode: string): void {
    const pin = pinCode.trim();
    if (!pin) {
      this.clearSearch();
      return;
    }

    // Validation for 6 digits starting with 1-9
    if (!/^[1-9][0-9]{5}$/.test(pin)) {
      this.searchErrorSubject.next('PIN code must be a valid 6-digit Indian postal code starting with 1-9.');
      return;
    }

    this.searchErrorSubject.next(null);
    this.isSearchingSubject.next(true);
    this.clearSelectedRows();
    this.setPinCode(pin);

    this.apiService.searchByPinCode(pin).subscribe({
      next: (results) => {
        this.setSearchResults(results);
        this.isSearchingSubject.next(false);

        // If no document is currently open and there are results, open the first matching document
        const currentActive = this.activeDocumentSubject.value;
        if (!currentActive && results.length > 0) {
          const first = results[0];
          const firstPage = first.matchingPages.length > 0 ? first.matchingPages[0].pageNumber : 1;
          this.openDocument(first.documentId, first.fileName, first.pageCount, firstPage);
        }
      },
      error: (err) => {
        this.isSearchingSubject.next(false);
        const errMsg = err?.error?.error || err?.error?.message || 'Failed to perform PIN code search.';
        this.searchErrorSubject.next(errMsg);
      }
    });
  }
}
