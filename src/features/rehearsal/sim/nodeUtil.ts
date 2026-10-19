/** REHEARSAL ONLY. The `promisify` the server's auth module imports. */
export function promisify<A extends unknown[], R>(
  fn: (...args: [...A, (error: unknown, value: R) => void]) => void,
) {
  return (...args: A) =>
    new Promise<R>((resolve, reject) =>
      fn(...args, (error, value) => (error ? reject(error) : resolve(value))),
    );
}

export default { promisify };
