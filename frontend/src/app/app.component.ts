import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HeaderComponent } from './components/header/header.component';
import { PdfUploaderComponent } from './components/pdf-uploader/pdf-uploader.component';
import { PinSearchComponent } from './components/pin-search/pin-search.component';
import { SearchResultsComponent } from './components/search-results/search-results.component';
import { DocumentListComponent } from './components/document-list/document-list.component';
import { PdfViewerComponent } from './components/pdf-viewer/pdf-viewer.component';
import { PdfStateService } from './services/pdf-state.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    HeaderComponent,
    PdfUploaderComponent,
    PinSearchComponent,
    SearchResultsComponent,
    DocumentListComponent,
    PdfViewerComponent
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit {
  activeTab: 'search' | 'documents' = 'search';

  constructor(private stateService: PdfStateService) {}

  ngOnInit(): void {
    // Automatically load all documents when app starts
    this.stateService.loadAllDocuments();
  }

  setTab(tab: 'search' | 'documents'): void {
    this.activeTab = tab;
  }
}
