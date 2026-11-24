import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, shareReplay } from 'rxjs';
import { SymbolLibraryEntry } from '../models/symbol.model';

export const LIBRARY_MANIFEST_URL = '/assets/symbol-designer/library.json';

/** Sample-symbol library backed by the generated manifest (log D4). */
@Injectable({ providedIn: 'root' })
export class SymbolLibraryService {
  private readonly http = inject(HttpClient);
  private manifest$?: Observable<SymbolLibraryEntry[]>;

  entries(): Observable<SymbolLibraryEntry[]> {
    this.manifest$ ??= this.http
      .get<SymbolLibraryEntry[]>(LIBRARY_MANIFEST_URL)
      .pipe(shareReplay(1));
    return this.manifest$;
  }

  /** URL-encoded asset URL (the folder name contains a space). */
  assetUrl(entry: SymbolLibraryEntry): string {
    return encodeURI(entry.url);
  }

  load(entry: SymbolLibraryEntry): Observable<string> {
    return this.http.get(this.assetUrl(entry), { responseType: 'text' });
  }
}
