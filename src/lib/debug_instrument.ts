const instrument: Record<string, any> = {};

export const add_debug_instrument = (key: string, value: any) => {
    instrument[key] = value;
}

if (process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_INSTRUMENT_IN_PROD) {
    (globalThis as any).debug = instrument;
}
