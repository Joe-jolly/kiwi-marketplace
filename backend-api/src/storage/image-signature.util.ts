/**
 * Minimal magic-byte content sniffing for exactly the three image types the
 * Image Storage V1 spec allows (JPEG, PNG, WebP) — deliberately not a
 * general-purpose file-type detection library.
 *
 * Two candidate npm dependencies were evaluated for this and rejected:
 * - `file-type` v17+ is pure ESM; this project compiles to CommonJS and
 *   runs its unit tests under Jest's default (non-experimental) module
 *   system, which cannot execute a real dynamic `import()` of an ESM
 *   package without `--experimental-vm-modules` — a project-wide Jest
 *   config change far outside this step's scope.
 * - `file-type` v16.5.4 (the last CommonJS-compatible release) is
 *   CJS-safe, but carries a known moderate-severity vulnerability
 *   (GHSA-5v7r-6r5c-r473: infinite loop in its ASF parser on malformed
 *   input), reachable by any authenticated user submitting a crafted
 *   buffer to the upload endpoint — an unacceptable trade-off for a
 *   feature whose entire purpose is validating untrusted input.
 *
 * A hand-rolled check against only the three supported signatures has no
 * such vulnerability class (no general-purpose multi-format parser, no
 * loops over attacker-influenced lengths), no dependency/supply-chain
 * surface, and is plain, fully deterministic logic — consistent with the
 * Technical Constitution's "Simple > Complex" principle.
 */

export type AllowedImageMimeType = 'image/jpeg' | 'image/png' | 'image/webp';

const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff]);
const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const RIFF_SIGNATURE = Buffer.from('RIFF', 'ascii');
const WEBP_SIGNATURE = Buffer.from('WEBP', 'ascii');

/**
 * Detects the real content type of `buffer` from its leading bytes.
 * Returns `null` if the buffer does not match any allowed image signature —
 * callers must treat `null` as "reject", never as "assume an allowed type".
 */
export function detectImageMimeType(
  buffer: Buffer,
): AllowedImageMimeType | null {
  if (buffer.subarray(0, 3).equals(JPEG_SIGNATURE)) {
    return 'image/jpeg';
  }

  if (buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return 'image/png';
  }

  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).equals(RIFF_SIGNATURE) &&
    buffer.subarray(8, 12).equals(WEBP_SIGNATURE)
  ) {
    return 'image/webp';
  }

  return null;
}
