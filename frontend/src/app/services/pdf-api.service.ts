import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { PdfDocument, UploadResponse } from '../models/pdf-document.model';
import { ExtractRowRequest, ExtractRowResponse, PdfPagesResponse, PdfSearchResult } from '../models/search-result.model';

@Injectable({
  providedIn: 'root'
})
export class PdfApiService {
  private readonly baseUrl = 'http://localhost:5000/api/pdf';

  constructor(private http: HttpClient) {}

  uploadFiles(files: File[]): Observable<UploadResponse> {
    const formData = new FormData();
    files.forEach(file => formData.append('files', file, file.name));
    return this.http.post<UploadResponse>(`${this.baseUrl}/upload`, formData);
  }

  searchByPinCode(pinCode: string): Observable<PdfSearchResult[]> {
    const params = new HttpParams().set('pinCode', pinCode.trim());
    return this.http.get<PdfSearchResult[]>(`${this.baseUrl}/search`, { params });
  }

  getOpenPdfUrl(id: number): string {
    return `${this.baseUrl}/${id}/open`;
  }

  getPdfBlob(id: number): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/${id}/open`, { responseType: 'blob' });
  }

  downloadPdfFile(id: number, fileName: string): void {
    const url = `${this.baseUrl}/${id}/download`;
    this.http.get(url, { responseType: 'blob' }).subscribe({
      next: (blob) => {
        const objectUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = objectUrl;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(objectUrl);
      },
      error: (err) => console.error('Failed to download PDF:', err)
    });
  }

  getMatchingPages(id: number, pinCode: string): Observable<PdfPagesResponse> {
    const params = new HttpParams().set('pinCode', pinCode.trim());
    return this.http.get<PdfPagesResponse>(`${this.baseUrl}/${id}/pages`, { params });
  }

  extractRow(request: ExtractRowRequest): Observable<ExtractRowResponse> {
    return this.http.post<ExtractRowResponse>(`${this.baseUrl}/extract-row`, request);
  }

  getDocument(id: number): Observable<PdfDocument> {
    return this.http.get<PdfDocument>(`${this.baseUrl}/${id}`);
  }

  getStatus(id: number): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/${id}/status`);
  }

  reindex(id: number): Observable<any> {
    return this.http.post<any>(`${this.baseUrl}/${id}/reindex`, {});
  }

  getAllDocuments(): Observable<PdfDocument[]> {
    return this.http.get<PdfDocument[]>(this.baseUrl);
  }

  deleteDocument(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }
}
