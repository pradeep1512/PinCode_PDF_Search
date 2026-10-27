import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PdfStateService } from '../../services/pdf-state.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule],
  template: `
    <header class="app-header">
      <div class="brand">
        <div class="logo-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <circle cx="12" cy="15" r="3"></circle>
            <path d="M12 12v-2"></path>
          </svg>
        </div>
        <div class="brand-text">
          <h1>DocPIN Finder</h1>
          <span class="subtitle">Indian PIN Code PDF Intelligence & Document Switcher</span>
        </div>
      </div>

      <div class="header-status" *ngIf="activeDoc$ | async as activeDoc">
        <span class="badge active-badge">
          <span class="dot"></span>
          Viewing: <strong>{{ activeDoc.fileName }}</strong>
        </span>
      </div>
    </header>
  `,
  styles: [`
    .app-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.85rem 1.75rem;
      background: #1e293b;
      color: #f8fafc;
      border-bottom: 1px solid #334155;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 0.85rem;
    }
    .logo-icon {
      background: linear-gradient(135deg, #3b82f6, #6366f1);
      width: 42px;
      height: 42px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      box-shadow: 0 2px 4px rgba(59, 130, 246, 0.3);
    }
    .brand-text h1 {
      margin: 0;
      font-size: 1.25rem;
      font-weight: 700;
      letter-spacing: -0.02em;
    }
    .brand-text .subtitle {
      font-size: 0.75rem;
      color: #94a3b8;
    }
    .header-status {
      display: flex;
      align-items: center;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.35rem 0.85rem;
      border-radius: 20px;
      font-size: 0.82rem;
    }
    .active-badge {
      background: rgba(16, 185, 129, 0.15);
      border: 1px solid rgba(16, 185, 129, 0.4);
      color: #34d399;
    }
    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #10b981;
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.5; transform: scale(1.2); }
    }
  `]
})
export class HeaderComponent {
  private stateService = inject(PdfStateService);
  activeDoc$ = this.stateService.activeDocument$;
}
