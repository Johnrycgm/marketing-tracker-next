import { clsx } from 'clsx';

/**
 * Utility for joining class names conditionally. Uses the `clsx` library
 * under the hood. See https://www.npmjs.com/package/clsx for details.
 *
 * @param inputs Any list of class names, arrays or objects.
 * @returns A space‑separated string of class names.
 */
export function cn(...inputs: any[]): string {
  return clsx(inputs);
}