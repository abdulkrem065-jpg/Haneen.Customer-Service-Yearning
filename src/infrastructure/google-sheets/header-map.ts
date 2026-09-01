export class HeaderSchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HeaderSchemaError';
  }
}

export class HeaderMap {
  private colIndexMap = new Map<string, number>();
  private indexColMap = new Map<number, string>();
  private normalizedIndexMap = new Map<string, number>();
  
  constructor(
    headerRow: string[], 
    private requiredHeaders: string[] = [],
    private aliases: Record<string, string[]> = {}
  ) {
    const seen = new Set<string>();
    
    headerRow.forEach((rawHeader, index) => {
      const header = rawHeader.trim();
      if (!header) return; 
      const norm = header.toLowerCase();
      if (seen.has(norm)) {
        throw new HeaderSchemaError(`Duplicate header detected: "${header}"`);
      }
      seen.add(norm);
      this.colIndexMap.set(header, index);
      this.indexColMap.set(index, header);
      this.normalizedIndexMap.set(norm, index);
    });
    
    const missing = requiredHeaders.filter(h => {
      if (this.hasHeader(h)) return false;
      const hAliases = this.aliases[h] || [];
      return !hAliases.some(alias => this.hasHeader(alias));
    });
    
    if (missing.length > 0) {
      throw new HeaderSchemaError(`Missing required headers: ${missing.join(', ')}`);
    }
  }

  hasHeader(headerName: string): boolean {
    const clean = headerName.trim();
    if (this.colIndexMap.has(clean) || this.normalizedIndexMap.has(clean.toLowerCase())) return true;
    const hAliases = this.aliases[clean] || [];
    return hAliases.some(alias => this.colIndexMap.has(alias) || this.normalizedIndexMap.has(alias.toLowerCase()));
  }

  getValue(rowValues: string[], headerName: string): string | undefined {
    let index = this.getIndex(headerName);
    if (index === undefined) return undefined;
    return rowValues[index];
  }

  getIndex(headerName: string): number | undefined {
    const clean = headerName.trim();
    let index = this.colIndexMap.get(clean);
    if (index === undefined) {
      index = this.normalizedIndexMap.get(clean.toLowerCase());
    }
    if (index === undefined && this.aliases[clean]) {
      for (const alias of this.aliases[clean]) {
        index = this.colIndexMap.get(alias) || this.normalizedIndexMap.get(alias.toLowerCase());
        if (index !== undefined) break;
      }
    }
    return index;
  }

  setValue(rowValues: string[], headerName: string, value: string): boolean {
    const index = this.getIndex(headerName);
    if (index === undefined) return false;
    while (rowValues.length <= index) {
      rowValues.push('');
    }
    rowValues[index] = value;
    return true;
  }

  requireValue(rowValues: string[], headerName: string): string {
    const val = this.getValue(rowValues, headerName);
    if (val === undefined || val === null || val === '') {
      throw new Error(`Missing value for required header: "${headerName}"`);
    }
    return val;
  }

  buildRow(data: Record<string, string>, options?: { allowUnmappedFields?: boolean }): string[] {
    if (!options?.allowUnmappedFields) {
      for (const [key, val] of Object.entries(data)) {
        if (val !== undefined && val !== null && val !== '') {
          if (!this.hasHeader(key)) {
            throw new HeaderSchemaError(`Column "${key}" does not exist in header map. Silent field drop prevented.`);
          }
        }
      }
    }

    const indices = Array.from(this.indexColMap.keys());
    const maxIndex = indices.length > 0 ? Math.max(...indices) : -1;
    
    const row: string[] = new Array(maxIndex + 1).fill('');
    
    for (const [header, index] of this.colIndexMap.entries()) {
      if (data[header] !== undefined) {
        row[index] = data[header];
      } else {
        let foundKey: string | undefined;
        for (const k of Object.keys(data)) {
          if (k.toLowerCase() === header.toLowerCase()) {
            foundKey = k;
            break;
          }
        }
        if (!foundKey) {
          for (const [canonical, aliasesList] of Object.entries(this.aliases)) {
            if (aliasesList.map(a => a.toLowerCase()).includes(header.toLowerCase()) && data[canonical] !== undefined) {
              foundKey = canonical;
              break;
            }
          }
        }
        row[index] = foundKey ? data[foundKey] : '';
      }
    }
    return row;
  }
}
