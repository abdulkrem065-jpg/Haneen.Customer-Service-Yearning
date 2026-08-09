export class DataProviderError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'DataProviderError';
  }
}

export class DataNotFoundError extends DataProviderError {
  constructor(message: string = 'Data not found') { 
    super(message, 'DATA_NOT_FOUND'); 
  }
}

export class DataUnavailableError extends DataProviderError {
  constructor(message: string = 'Data is currently unavailable') { 
    super(message, 'DATA_UNAVAILABLE'); 
  }
}

export class UnauthorizedDataAccessError extends DataProviderError {
  constructor(message: string = 'Unauthorized data access') { 
    super(message, 'UNAUTHORIZED_DATA_ACCESS'); 
  }
}

export class ValidationError extends DataProviderError {
  constructor(message: string) { 
    super(message, 'VALIDATION_ERROR'); 
  }
}

export class ConflictError extends DataProviderError {
  constructor(message: string) { 
    super(message, 'CONFLICT_ERROR'); 
  }
}

export class ProviderError extends DataProviderError {
  constructor(message: string) { 
    super(message, 'PROVIDER_ERROR'); 
  }
}
