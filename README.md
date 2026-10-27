# DocPIN Finder: PIN Code-Based PDF Search & Document Switcher Application

A high-performance full-stack web application built with **ASP.NET Core Web API (.NET 8 LTS), Entity Framework Core, Microsoft SQL Server, and Angular 18 (Standalone Components with PDF.js)**.

The application allows users to upload multiple searchable and scanned PDF documents, automatically extracts and indexes 6-digit Indian Postal Index Numbers (PIN codes) on a per-page basis, searches across all indexed documents, and allows users to **seamlessly switch between matching PDF documents without full-page reloads**, jumping directly to matching pages and highlighting the searched PIN code occurrences.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Database Schema & Entity Models](#2-database-schema--entity-models)
3. [Key Features & Capabilities](#3-key-features--capabilities)
4. [Project Folder Structure](#4-project-folder-structure)
5. [Prerequisites & Tech Stack](#5-prerequisites--tech-stack)
6. [Step-by-Step Setup & Running](#6-step-by-step-setup--running)
7. [API Endpoints Reference](#7-api-endpoints-reference)
8. [Sample Test Data & Verification](#8-sample-test-data--verification)
9. [OCR Integration for Scanned PDFs](#9-ocr-integration-for-scanned-pdfs)
10. [Security & Performance Best Practices](#10-security--performance-best-practices)

---

## 1. Architecture Overview

```mermaid
flowchart TD
    subgraph Frontend["Angular 18 Frontend (Port 4200)"]
        UI["App Component (Split Dashboard)"]
        Uploader["PdfUploaderComponent (Drag & Drop)"]
        Search["PinSearchComponent (Regex Validated)"]
        Results["SearchResultsComponent (Switch PDF)"]
        DocList["DocumentListComponent (Status & Reindex)"]
        Viewer["PdfViewerComponent (PDF.js Canvas + Highlighting)"]
        State["PdfStateService (RxJS Reactive State)"]
        Api["PdfApiService (HttpClient)"]

        UI --> Uploader
        UI --> Search
        UI --> Results
        UI --> DocList
        UI --> Viewer
        Uploader --> State
        Search --> State
        Results --> State
        DocList --> State
        State --> Api
        Viewer --> State
    end

    subgraph Backend["ASP.NET Core 8 Web API (Port 5000)"]
        Controller["PdfController"]
        Storage["LocalFileStorageService (Magic Byte & Path Traversal Checks)"]
        Extractor["PdfPigTextExtractor (Spatial Word Segmentation)"]
        Indexer["PinCodeIndexerService (Indian PIN Regex & Context Snippets)"]
        OCR["TesseractOcrService (Scanned PDF Pipeline)"]
        EF["PdfDbContext (Entity Framework Core)"]
        Middleware["ExceptionHandlingMiddleware (Centralized Error Responses)"]

        Controller --> Storage
        Controller --> Indexer
        Indexer --> Extractor
        Indexer --> OCR
        Indexer --> EF
    end

    subgraph Database["Microsoft SQL Server"]
        T1["PdfDocuments Table"]
        T2["PdfPinCodes Table (Indexed on PinCode, DocumentId, PageNumber)"]
        T1 ---|1 to Many (Cascade Delete)| T2
    end

    subgraph Disk["Secure File Storage"]
        Files["UploadedPdfs/*.pdf (Unique GUID Stored Names)"]
    end

    Api -->|HTTP REST / Byte-Range 206 Streaming| Controller
    Storage --> Files
    EF --> Database
```

---

## 2. Database Schema & Entity Models

### Database Tables

#### Table: `PdfDocuments`
Stores file metadata, physical location keys, and processing lifecycle status.

| Column | Type | Constraints / Details |
|---|---|---|
| `Id` | `int` | Primary Key, Identity(1,1) |
| `FileName` | `nvarchar(255)` | Not Null (Original client file name) |
| `StoredFileName` | `nvarchar(255)` | Not Null, Unique Index (Randomized GUID + sanitized name) |
| `StoragePath` | `nvarchar(1000)` | Not Null (Physical server file path) |
| `FileSize` | `bigint` | Not Null (Size in bytes) |
| `ContentType` | `nvarchar(100)` | Not Null (`application/pdf`) |
| `PageCount` | `int` | Total pages in document |
| `UploadedAt` | `datetime2` | Indexed, UTC timestamp |
| `Status` | `int` | Enum (`0: Pending`, `1: Processing`, `2: Completed`, `3: Failed`) |
| `ErrorMessage` | `nvarchar(2000)` | Nullable diagnostic error or status note |

#### Table: `PdfPinCodes`
Stores every unique PIN code occurrence per page per document with context snippet for rapid searching.

| Column | Type | Constraints / Details |
|---|---|---|
| `Id` | `int` | Primary Key, Identity(1,1) |
| `PdfDocumentId` | `int` | Foreign Key -> `PdfDocuments(Id)`, On Delete Cascade |
| `PinCode` | `nvarchar(10)` | Not Null, **Non-Clustered Index: `IX_PdfPinCodes_PinCode`** |
| `PageNumber` | `int` | 1-based page number where found |
| `OccurrenceCount` | `int` | Total occurrences on this specific page |
| `ContextSnippet` | `nvarchar(500)` | Text snippet surrounding PIN for preview |

### Performance Indexes
- `IX_PdfPinCodes_PinCode` on `(PinCode)`: Ensures sub-millisecond lookups across millions of indexed postal codes.
- `IX_PdfPinCodes_Document_PinCode` on `(PdfDocumentId, PinCode)`: Speeds up document-level PIN queries.
- `IX_PdfPinCodes_Pin_Doc_Page` on `(PinCode, PdfDocumentId, PageNumber)`: Composite index covering search-to-page navigation.

---

## 3. Key Features & Capabilities

1. **Multi-Document Upload with Security Gatekeeping**:
   - Drag & drop or file selection.
   - Validation against MIME type (`application/pdf`), file extension (`.pdf`), maximum file size (50MB), and genuine PDF magic bytes (`%PDF-` / `0x25, 0x50, 0x44, 0x46, 0x2D`).
   - Server-side unique filenames prevent path traversal and overwrite collisions.
2. **Indian PIN Code Recognition (`\b[1-9][0-9]{5}\b`)**:
   - Validates 6-digit Indian PIN codes (where the first digit is strictly between 1 and 9).
   - Extracts page-level occurrences and contextual text snippets.
3. **Seamless Document Switching (Core Feature)**:
   - When searching for PIN code `400001` while viewing `Address_List_1.pdf`, any matching PDFs (e.g. `Address_List_2.pdf`, `Address_List_3.pdf`) appear in the results list.
   - Clicking **Switch PDF** or **Page X** immediately loads that PDF into the viewer **without reloading the page**.
   - Preserves search term and results list.
   - Updates the active status indicator badge.
4. **Interactive Embedded PDF Viewer (PDF.js)**:
   - High-DPI canvas rendering.
   - Page navigation (prev, next, direct page input).
   - Zoom in, zoom out, fit to 100%.
   - In-viewer matching page chips and Prev/Next match arrows.
   - Dynamic search highlights over matched PIN codes.
   - Direct download button.
5. **Robust Reindexing & Maintenance**:
   - Document library tab allows reindexing documents on demand or deleting documents with disk + DB cleanup.

---

## 4. Project Folder Structure

```
PinCodePdfSearchApp/
├── backend/
│   └── PinCodePdfSearch.Api/
│       ├── Controllers/
│       │   └── PdfController.cs
│       ├── Data/
│       │   ├── PdfDbContext.cs
│       │   └── DbInitializer.cs
│       ├── DTOs/
│       │   ├── PdfDocumentDto.cs
│       │   ├── PdfSearchResultDto.cs
│       │   ├── PdfPagesResponseDto.cs
│       │   ├── PdfStatusDto.cs
│       │   └── UploadResponseDto.cs
│       ├── Entities/
│       │   ├── PdfDocument.cs
│       │   ├── PdfPinCode.cs
│       │   └── ProcessingStatus.cs
│       ├── Exceptions/
│       │   └── AppException.cs
│       ├── Middleware/
│       │   └── ExceptionHandlingMiddleware.cs
│       ├── Services/
│       │   ├── Interfaces/
│       │   │   ├── IFileStorageService.cs
│       │   │   ├── IPdfTextExtractor.cs
│       │   │   ├── IPinCodeIndexerService.cs
│       │   │   └── IOcrService.cs
│       │   └── Implementations/
│       │       ├── LocalFileStorageService.cs
│       │       ├── PdfPigTextExtractor.cs
│       │       ├── PinCodeIndexerService.cs
│       │       └── TesseractOcrService.cs
│       ├── appsettings.json
│       ├── Program.cs
│       └── PinCodePdfSearch.Api.csproj
├── frontend/
│   ├── public/
│   │   └── pdf.worker.min.js
│   ├── src/
│   │   ├── app/
│   │   │   ├── components/
│   │   │   │   ├── header/header.component.ts
│   │   │   │   ├── pdf-uploader/pdf-uploader.component.ts
│   │   │   │   ├── pin-search/pin-search.component.ts
│   │   │   │   ├── search-results/search-results.component.ts
│   │   │   │   ├── document-list/document-list.component.ts
│   │   │   │   └── pdf-viewer/pdf-viewer.component.ts
│   │   │   ├── models/
│   │   │   │   ├── pdf-document.model.ts
│   │   │   │   └── search-result.model.ts
│   │   │   ├── services/
│   │   │   │   ├── pdf-api.service.ts
│   │   │   │   └── pdf-state.service.ts
│   │   │   ├── app.component.ts
│   │   │   ├── app.component.html
│   │   │   ├── app.component.css
│   │   │   └── app.config.ts
│   │   ├── index.html
│   │   ├── main.ts
│   │   └── styles.css
│   ├── angular.json
│   ├── package.json
│   └── tsconfig.json
├── sample-data/
│   ├── Address_List_1.pdf          (Contains 400001 on p1 & p3, 110001 on p2)
│   ├── Address_List_2.pdf          (Contains 560001 on p1, 400001 on p2, 700001 on p3)
│   ├── Address_List_3.pdf          (Contains 600001 on p1, 400001 on p2)
│   ├── Regional_Branches_4.pdf     (Contains 411001 on p1, 500001 on p2, 380001 on p3)
│   └── SamplePdfGenerator/         (C# console app that generated sample test data)
└── README.md
```

---

## 5. Prerequisites & Tech Stack

- **.NET SDK**: .NET 8.0 LTS or higher (`dotnet --version`)
- **Node.js**: v18.x or higher (tested on Node.js v20/v26)
- **Database**: Microsoft SQL Server (LocalDB `(localdb)\MSSQLLocalDB` or `localhost` SQL Server Express / Developer)
- **Key Backend NuGet Packages**:
  - `Microsoft.EntityFrameworkCore.SqlServer` (8.0.11)
  - `Microsoft.EntityFrameworkCore.Design` (8.0.11)
  - `PdfPig` (0.1.9) — Pure C# library for text, font metrics, and page layout extraction
  - `Swashbuckle.AspNetCore` (Swagger/OpenAPI)
- **Frontend Packages**:
  - `@angular/core`, `@angular/common`, `@angular/forms` (18.x)
  - `pdfjs-dist` (3.11.174)

---

## 6. Step-by-Step Setup & Running

### Step 1: Configure SQL Server Connection String
Open `backend/PinCodePdfSearch.Api/appsettings.json`:
```json
{
  "ConnectionStrings": {
    "DefaultConnection": "Server=localhost;Database=PdfPinCodeSearchDb;Trusted_Connection=True;TrustServerCertificate=True;MultipleActiveResultSets=true"
  }
}
```
> **Note for LocalDB**: If using SQL Server LocalDB instead of local SQL Server, change the connection string to:
> `"Server=(localdb)\\MSSQLLocalDB;Database=PdfPinCodeSearchDb;Trusted_Connection=True;TrustServerCertificate=True;"`

*The application automatically creates the database and all tables/indexes on startup (`DbInitializer.InitializeAsync`), so manual migration execution is not required.*

### Step 2: Run the ASP.NET Core Web API
Open a terminal in the backend directory:
```bash
cd backend/PinCodePdfSearch.Api
dotnet run --urls "http://localhost:5000"
```
The API starts on `http://localhost:5000` with Swagger available at:
`http://localhost:5000/swagger`

### Step 3: Run the Angular Frontend
Open a second terminal in the frontend directory:
```bash
cd frontend
npm start
```
Navigate your browser to:
`http://localhost:4200`

---

## 7. API Endpoints Reference

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/pdf/upload` | Upload multiple PDFs (`multipart/form-data`) and trigger automatic PIN indexing. |
| `GET` | `/api/pdf/search?pinCode=400001` | Search all indexed PDFs for a 6-digit Indian PIN code. |
| `GET` | `/api/pdf/{id}/open` | Stream the PDF to the browser with HTTP 206 Partial Content / Range support. |
| `GET` | `/api/pdf/{id}/pages?pinCode=400001` | Retrieve page-level occurrences and snippets for the specified PDF and PIN code. |
| `GET` | `/api/pdf/{id}` | Retrieve document metadata and total indexed PIN count. |
| `GET` | `/api/pdf/{id}/status` | Check document indexing status (`Pending`, `Processing`, `Completed`, `Failed`). |
| `POST` | `/api/pdf/{id}/reindex` | Re-run text extraction and PIN indexing. |
| `GET` | `/api/pdf` | List all uploaded documents with status and metadata. |
| `POST` | `/api/pdf/extract-row` | Remove a searched PIN code row from the document and generate a new PDF file with the extracted record. |
| `DELETE` | `/api/pdf/{id}` | Delete document from database and storage disk. |

---

## 8. Sample Test Data & Verification

4 realistic multi-page test PDF documents are pre-generated in the `sample-data/` folder:

| File Name | Pages | Included Indian PIN Codes |
|---|---|---|
| `Address_List_1.pdf` | 3 pages | `400001` (Mumbai - p1 & p3), `110001` (Delhi - p2) |
| `Address_List_2.pdf` | 3 pages | `560001` (Bengaluru - p1), `400001` (Mumbai - p2), `700001` (Kolkata - p3) |
| `Address_List_3.pdf` | 2 pages | `600001` (Chennai - p1), `400001` (Mumbai - p2) |
| `Regional_Branches_4.pdf` | 3 pages | `411001` (Pune - p1), `500001` (Hyderabad - p2), `380001` (Ahmedabad - p3) |

### Testing Document Switching in the UI:
1. Open the Angular app at `http://localhost:4200`.
2. Drag and drop all 4 sample PDFs into the upload box.
3. Search for PIN code `400001` (or click the **400001 (Mumbai)** preset button).
4. Results appear showing:
   - `Address_List_1.pdf` (3 occurrences: Page 1 [2x], Page 3 [1x])
   - `Address_List_2.pdf` (1 occurrence: Page 2 [1x])
   - `Address_List_3.pdf` (1 occurrence: Page 2 [1x])
5. `Address_List_1.pdf` opens automatically.
6. Click **Switch PDF** on `Address_List_2.pdf`:
   - The viewer seamlessly replaces the PDF without reloading the web page.
   - Automatically navigates to **Page 2** where `400001` is located.
   - Highlights the PIN occurrence.
   - The search results list remains active so you can immediately switch to `Address_List_3.pdf`!

### Quick API Testing via cURL:

#### 1. Upload PDFs:
```bash
curl -F "files=@sample-data/Address_List_1.pdf" -F "files=@sample-data/Address_List_2.pdf" http://localhost:5000/api/pdf/upload
```

#### 2. Search by PIN Code:
```bash
curl "http://localhost:5000/api/pdf/search?pinCode=400001"
```

#### 3. Stream PDF with Byte Range Request (HTTP 206):
```bash
curl -i -r 0-512 "http://localhost:5000/api/pdf/5/open"
```

#### 4. Invalid PIN Validation Test:
```bash
curl -i "http://localhost:5000/api/pdf/search?pinCode=012345"
# Returns 400 Bad Request: "Invalid Indian PIN code format. Must be a 6-digit number starting with 1-9."
```

---

## 9. OCR Integration for Scanned PDFs

While standard text-based PDFs extract text in milliseconds using `PdfPig`, scanned or image-based PDFs do not have an embedded text stream. DocPIN Finder incorporates an extensible OCR pipeline via `IOcrService` and `TesseractOcrService`.

### How to Enable Full Tesseract OCR:
1. **Install Tesseract OCR**:
   - **Windows**: Download installer from [UB-Mannheim/tesseract](https://github.com/UB-Mannheim/tesseract/wiki) (default: `C:\Program Files\Tesseract-OCR`).
   - **Linux**: `sudo apt install tesseract-ocr libtesseract-dev`
2. **Configure `appsettings.json`**:
   ```json
   "Ocr": {
     "Enabled": true,
     "TessdataPath": "C:\\Program Files\\Tesseract-OCR\\tessdata"
   }
   ```
3. When `PdfPigTextExtractor` detects `HasTextContent == false`, `PinCodeIndexerService` automatically falls back to `IOcrService.PerformOcrAsync` to extract text from the rasterized pages and indexes detected PIN codes.

---

## 10. Security & Performance Best Practices

- **Zero Path Traversal**: Files are stored with random GUID keys (`{guid}_{sanitizedOriginalName}.pdf`) in an isolated directory. Path parameters use strict integer IDs and `Path.GetFileName`.
- **Magic Byte Verification**: Verifies `%PDF-` (`0x25, 0x50, 0x44, 0x46, 0x2D`) at the byte stream level, rejecting renamed malicious executables or scripts.
- **SQL Injection Immune**: All queries use Entity Framework Core LINQ parameterized queries.
- **Byte-Range Streaming**: `PhysicalFile(..., enableRangeProcessing: true)` returns `Accept-Ranges: bytes` and `206 Partial Content`, enabling PDF.js to download only necessary page chunks on demand.
- **Non-blocking UI**: State management is powered by RxJS `BehaviorSubject` streams, ensuring smooth rendering without UI freezes or redundant full-page reloads.
