export type DomainErrorCode = "not_found" | "validation" | "conflict";

export class DomainError extends Error {
  readonly code: DomainErrorCode;

  constructor(code: DomainErrorCode, message: string) {
    super(message);
    this.name = "DomainError";
    this.code = code;
  }
}

export function notFound(what: string): DomainError {
  return new DomainError("not_found", `${what} not found`);
}
