declare module 'fuse.js' {
  export interface IFuseOptions<T> {
    keys?: Array<string | { name: string; weight?: number }>;
    threshold?: number;
    ignoreLocation?: boolean;
  }

  export interface FuseResult<T> {
    item: T;
    refIndex: number;
    score?: number;
  }

  class Fuse<T> {
    constructor(list: readonly T[], options?: IFuseOptions<T>);
    search(pattern: string): FuseResult<T>[];
  }

  export default Fuse;
}

