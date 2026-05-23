declare module "natural/lib/natural/tfidf/tfidf.js" {
  export default class TfIdf {
    addDocument(document: string[] | string, key?: string | number, restoreCache?: boolean): void;
    listTerms(index: number): Array<{ term: string; tfidf: number }>;
  }
}
