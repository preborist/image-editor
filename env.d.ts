/// <reference types="vite/client" />

// ICSS `:export` blocks in SCSS modules resolve to a string-keyed object.
declare module '*.module.scss' {
  const classes: Record<string, string>
  export default classes
}
