// Minimal declaration for bun:sqlite so tsc (with Node types) can check the Bun
// code path in src/db/connect.ts without pulling in all Bun globals.
declare module "bun:sqlite" {
  export class Database {
    constructor(path: string, options?: { create?: boolean; readonly?: boolean });
    exec(sql: string): void;
    close(): void;
  }
}
