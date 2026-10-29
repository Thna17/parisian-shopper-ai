export const PASSWORD_HASHER = Symbol('PASSWORD_HASHER');

export interface PasswordHasherOptions {
  readonly memorySize?: number;
  readonly iterations?: number;
  readonly parallelism?: number;
  readonly hashLength?: number;
}

export interface PasswordHasher {
  hash(password: string, options?: PasswordHasherOptions): Promise<string>;
  verify(password: string, encodedHash: string): Promise<boolean>;
}
