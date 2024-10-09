export function pipe<T>(initial: T): T;
export function pipe<T, A>(initial: T, fn1: (arg: T) => A): A;
export function pipe<T, A, B>(
  initial: T,
  fn1: (arg: T) => A,
  fn2: (arg: A) => B,
): B;
export function pipe<T, A, B, C>(
  initial: T,
  fn1: (arg: T) => A,
  fn2: (arg: A) => B,
  fn3: (arg: B) => C,
): C;
export function pipe<T, A, B, C, D>(
  initial: T,
  fn1: (arg: T) => A,
  fn2: (arg: A) => B,
  fn3: (arg: B) => C,
  fn4: (arg: C) => D,
): D;
export function pipe<T, A, B, C, D, E>(
  initial: T,
  fn1: (arg: T) => A,
  fn2: (arg: A) => B,
  fn3: (arg: B) => C,
  fn4: (arg: C) => D,
  fn5: (arg: D) => E,
): E;
export function pipe<T, A, B, C, D, E, F>(
  initial: T,
  fn1: (arg: T) => A,
  fn2: (arg: A) => B,
  fn3: (arg: B) => C,
  fn4: (arg: C) => D,
  fn5: (arg: D) => E,
  fn6: (arg: E) => F,
): F;
export function pipe<T, A, B, C, D, E, F, G>(
  initial: T,
  fn1: (arg: T) => A,
  fn2: (arg: A) => B,
  fn3: (arg: B) => C,
  fn4: (arg: C) => D,
  fn5: (arg: D) => E,
  fn6: (arg: E) => F,
  fn7: (arg: F) => G,
): G;
export function pipe<T, A, B, C, D, E, F, G, H>(
  initial: T,
  fn1: (arg: T) => A,
  fn2: (arg: A) => B,
  fn3: (arg: B) => C,
  fn4: (arg: C) => D,
  fn5: (arg: D) => E,
  fn6: (arg: E) => F,
  fn7: (arg: F) => G,
  fn8: (arg: G) => H,
): H;
export function pipe<T, A, B, C, D, E, F, G, H, I>(
  initial: T,
  fn1: (arg: T) => A,
  fn2: (arg: A) => B,
  fn3: (arg: B) => C,
  fn4: (arg: C) => D,
  fn5: (arg: D) => E,
  fn6: (arg: E) => F,
  fn7: (arg: F) => G,
  fn8: (arg: G) => H,
  fn9: (arg: H) => I,
): I;
export function pipe(
  initial: unknown,
  ...fns: Array<(arg: unknown) => unknown>
): unknown {
  switch (fns.length) {
    case 0:
      return initial;
    case 1:
      return fns[0](initial);
    case 2:
      return fns[1](fns[0](initial));
    case 3:
      return fns[2](fns[1](fns[0](initial)));
    case 4:
      return fns[3](fns[2](fns[1](fns[0](initial))));
    default:
      return fns.reduce((acc, fn) => fn(acc), initial);
  }
}
