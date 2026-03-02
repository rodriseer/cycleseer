declare module "pngjs" {
  export const PNG: {
    sync: {
      read(data: Buffer | Uint8Array): { data: Uint8Array | Uint8ClampedArray };
    };
  };
}

