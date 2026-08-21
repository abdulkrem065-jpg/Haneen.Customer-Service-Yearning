export class HeaderSchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HeaderSchemaError';
  }
}

export class HeaderMap {
  private colIndexMap = new Map<string, number>();
  private indexColMap = new Map<number, string>();
  
  constructor(
    headerRow: string[], 
    private requiredHeaders: string[] = [],
    private aliases: Record<string, string[]> = {}
  ) {
    const seen = new Set<string>();
    
    headerRow.forEach((rawHeader, index) => {
      const header = rawHeader.trim();
      if (!header) return; 
      if (seen.has(header)) {
        throw new HeaderSchemaError(`Duplicate header detected: "${header}"`);
      }
      seen.add(header);
      this.colIndexMap.set(header, index);
      this.indexColMap.set(index, header);
    });
    
    const missing = requiredHeaders.filter(h => {
      if (this.colIndexMap.has(h)) return false;
      const hAliases = this.aliases[h] || [];
      return !hAliases.some(alias => this.colIndexMap.has(alias));
    });
    
    if (missing.length > 0) {
      throw new HeaderSchemaError(`Missing required headers: ${missing.join(', ')}`);
    }
  }
  
  getValue(rowValues: string[], headerName: string): string | undefined {
    let index = this.colIndexMap.get(headerName);
    
    if (index === undefined && this.aliases[headerName]) {
      for (const alias of this.aliases[headerName]) {
        index = this.colIndexMap.get(alias);
        if (index !== undefined) break;
      }
    }
    
    if (index === undefined) return undefined;
    return rowValues[index];
  }

  getIndex(headerName: string): number | undefined {
    let index = this.colIndexMap.get(headerName);
    if (index === undefined && this.aliases[headerName]) {
      for (const alias of this.aliases[headerName]) {
        index = this.colIndexMap.get(alias);
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

  buildRow(data: Record<string, string>): string[] {
    const indices = Array.from(this.indexColMap.keys());
    const maxIndex = indices.length > 0 ? Math.max(...indices) : -1;
    
    const row: string[] = new Array(maxIndex + 1).fill('');
    
    for (const [header, index] of this.colIndexMap.entries()) {
      if (data[header] !== undefined) {
        row[index] = data[header];
      } else {
        let foundCanonical: string | undefined;
        for (const [canonical, aliasesList] of Object.entries(this.aliases)) {
          if (aliasesList.includes(header) && data[canonical] !== undefined) {
            foundCanonical = canonical;
            break;
          }
        }
        row[index] = foundCanonical ? data[foundCanonical] : '';
      }
    }
    return row;
  }
}
