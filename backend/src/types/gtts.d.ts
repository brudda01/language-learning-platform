declare module 'gtts' {
  interface GTTSOptions {
    lang?: string;
    slow?: boolean;
  }

  class GTTS {
    constructor(text: string, lang?: string, slow?: boolean);
    constructor(text: string, options?: GTTSOptions);
    
    save(filename: string, callback: (error: any, result?: any) => void): void;
    stream(): any;
    base64(): string;
  }

  export = GTTS;
} 