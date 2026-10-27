import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PdfStateService } from '../../services/pdf-state.service';

@Component({
  selector: 'app-pin-search',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="search-card">
      <div class="search-title">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <span>Search by Indian PIN Code</span>
      </div>

      <div class="search-box">
        <div class="input-wrapper">
          <input 
            type="text" 
            [(ngModel)]="pinCodeInput" 
            (keyup.enter)="onSearch()"
            placeholder="e.g. 400001" 
            maxlength="6"
            class="pin-input"
            [class.input-error]="errorMessage" />
          
          <button 
            *ngIf="pinCodeInput" 
            (click)="onClear()" 
            class="clear-btn" 
            title="Clear">
            &times;
          </button>
        </div>

        <button 
          (click)="onSearch()" 
          [disabled]="isSearching$ | async" 
          class="btn-search">
          <span *ngIf="!(isSearching$ | async)">Search</span>
          <span *ngIf="isSearching$ | async" class="btn-spinner"></span>
        </button>
      </div>

      <!-- Quick PIN presets for rapid testing -->
      <div class="presets-section">
        <span class="preset-label">Sample PINs:</span>
        <div class="preset-chips">
          <button 
            type="button" 
            *ngFor="let pin of presetPins" 
            (click)="selectPreset(pin.code)"
            class="chip-btn"
            [class.active-chip]="pinCodeInput === pin.code">
            {{ pin.code }} <small>({{ pin.city }})</small>
          </button>
        </div>
      </div>

      <!-- Validation Error -->
      <div *ngIf="errorMessage" class="error-text">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <span>{{ errorMessage }}</span>
      </div>
    </div>
  `,
  styles: [`
    .search-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 1.15rem;
      margin-bottom: 1.25rem;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    }
    .search-title {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.92rem;
      font-weight: 600;
      color: #1e293b;
      margin-bottom: 0.85rem;
    }
    .search-title svg {
      color: #3b82f6;
    }
    .search-box {
      display: flex;
      gap: 0.6rem;
    }
    .input-wrapper {
      position: relative;
      flex: 1;
    }
    .pin-input {
      width: 100%;
      box-sizing: border-box;
      padding: 0.65rem 2rem 0.65rem 0.85rem;
      font-size: 0.95rem;
      border: 1.5px solid #cbd5e1;
      border-radius: 8px;
      font-family: inherit;
      letter-spacing: 0.08em;
      transition: all 0.2s ease;
    }
    .pin-input:focus {
      outline: none;
      border-color: #3b82f6;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
    }
    .input-error {
      border-color: #ef4444 !important;
    }
    .clear-btn {
      position: absolute;
      right: 8px;
      top: 50%;
      transform: translateY(-50%);
      background: none;
      border: none;
      font-size: 1.25rem;
      color: #94a3b8;
      cursor: pointer;
      line-height: 1;
      padding: 0 4px;
    }
    .clear-btn:hover {
      color: #475569;
    }
    .btn-search {
      padding: 0.65rem 1.25rem;
      background: #2563eb;
      color: white;
      font-weight: 600;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-size: 0.88rem;
      transition: background 0.2s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      min-width: 80px;
    }
    .btn-search:hover:not(:disabled) {
      background: #1d4ed8;
    }
    .btn-search:disabled {
      opacity: 0.65;
      cursor: not-allowed;
    }
    .btn-spinner {
      width: 16px;
      height: 16px;
      border: 2px solid rgba(255, 255, 255, 0.4);
      border-top-color: white;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .presets-section {
      margin-top: 0.85rem;
      font-size: 0.78rem;
    }
    .preset-label {
      color: #64748b;
      margin-bottom: 0.35rem;
      display: block;
      font-weight: 500;
    }
    .preset-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
    }
    .chip-btn {
      background: #f1f5f9;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 0.25rem 0.5rem;
      font-size: 0.75rem;
      color: #334155;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .chip-btn:hover {
      background: #e2e8f0;
      border-color: #cbd5e1;
    }
    .chip-btn.active-chip {
      background: #eff6ff;
      border-color: #93c5fd;
      color: #1d4ed8;
      font-weight: 600;
    }
    .error-text {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      color: #ef4444;
      font-size: 0.78rem;
      margin-top: 0.5rem;
    }
  `]
})
export class PinSearchComponent implements OnInit {
  private stateService = inject(PdfStateService);

  pinCodeInput: string = '';
  errorMessage: string | null = null;
  isSearching$ = this.stateService.isSearching$;

  presetPins = [
    { code: '400001', city: 'Mumbai' },
    { code: '110001', city: 'Delhi' },
    { code: '560001', city: 'Bengaluru' },
    { code: '600001', city: 'Chennai' },
    { code: '700001', city: 'Kolkata' }
  ];

  ngOnInit(): void {
    this.stateService.searchedPinCode$.subscribe(pin => {
      this.pinCodeInput = pin;
    });

    this.stateService.searchError$.subscribe(err => {
      this.errorMessage = err;
    });
  }

  onSearch(): void {
    const trimmed = this.pinCodeInput.trim();
    if (!trimmed) {
      this.errorMessage = 'Please enter a 6-digit Indian PIN code.';
      return;
    }

    if (!/^[1-9][0-9]{5}$/.test(trimmed)) {
      this.errorMessage = 'Must be exactly 6 digits starting with 1-9 (e.g. 400001).';
      return;
    }

    this.errorMessage = null;
    this.stateService.search(trimmed);
  }

  selectPreset(pinCode: string): void {
    this.pinCodeInput = pinCode;
    this.onSearch();
  }

  onClear(): void {
    this.pinCodeInput = '';
    this.errorMessage = null;
    this.stateService.clearSearch();
  }
}
