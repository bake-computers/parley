/** Minimal Result type replacing neverthrow for this package. */

export type Result<T, E> = Ok<T, E> | Err<T, E>;

export class Ok<T, E> {
  readonly ok = true as const;
  readonly error?: undefined;

  constructor(readonly value: T) {}

  isOk(): this is Ok<T, E> {
    return true;
  }

  isErr(): this is Err<T, E> {
    return false;
  }
}

export class Err<T, E> {
  readonly ok = false as const;
  readonly value?: undefined;

  constructor(readonly error: E) {}

  isOk(): this is Ok<T, E> {
    return false;
  }

  isErr(): this is Err<T, E> {
    return true;
  }
}

export function ok<T, E = never>(value: T): Result<T, E> {
  return new Ok(value);
}

export function err<T = never, E = unknown>(error: E): Result<T, E> {
  return new Err(error);
}
