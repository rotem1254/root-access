/** A `?sealed` import returns the file's bytes scrambled at build time (see scripts/vite-plugins.ts). */
declare module '*?sealed' {
  import type { Sealed } from '../engine/util/seal';
  const sealed: Sealed;
  export default sealed;
}
