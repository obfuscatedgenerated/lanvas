import { LRUCache } from "lru-cache";

const BANNED_LABELS = ["severe_toxic", "obscene", "threat", "identity_hate"];
const FLAG_THRESHOLD = 0.7;

const CACHE_MAX = 10000;
const CACHE_TTL_MS = 1000 * 60 * 60 * 6; // 6 hours

// stores (message, true) for known good messages
const known_good_cache = new LRUCache<string, boolean>({
    max: CACHE_MAX,
    ttl: CACHE_TTL_MS,

    // set max size for safety. maximum message length is 100 chars
    maxSize: 100 * CACHE_MAX,
    sizeCalculation: (_value, key) => key.length,
});

// stores (message, [violating_labels]) for known bad messages
const known_bad_cache = new LRUCache<string, string[]>({
    max: CACHE_MAX,
    ttl: CACHE_TTL_MS,

    // set max size for safety. maximum message length is 100 chars
    maxSize: 100 * CACHE_MAX,
    sizeCalculation: (_value, key) => key.length,
});

export enum AutoModStatus {
    CLEAN, // the text is clean
    FLAGGED, // the text is flagged as inappropriate
    UNSUPPORTED, // automod is not supported
    ERROR // there was an error checking the text
}

type AutoModStatusNotCleanOrFlagged = Exclude<AutoModStatus, AutoModStatus.CLEAN | AutoModStatus.FLAGGED>;

interface AutomodResultCleanOrFlaggedBase {
    status: AutoModStatus.CLEAN | AutoModStatus.FLAGGED;
    cache_hit: boolean;
}

interface AutoModResultClean extends AutomodResultCleanOrFlaggedBase {
    status: AutoModStatus.CLEAN;
}

interface AutoModResultFlagged extends AutomodResultCleanOrFlaggedBase {
    status: AutoModStatus.FLAGGED;
    violating_labels: string[];
}

interface AutoModResultNotCleanOrFlagged {
    status: AutoModStatusNotCleanOrFlagged;
}

export type AutoModResult = AutoModResultClean | AutoModResultFlagged | AutoModResultNotCleanOrFlagged;

// can't guarantee having hugging face types at build, so make our own minimal types here
type ClassifierFunc = (text: string, options?: {top_k?: number | null}) => Promise<Array<{label: string; score: number}>>;
type PipelineFunc = (task: string, model: string) => Promise<ClassifierFunc>;

export const is_automod_supported = (): boolean => {
    try {
        import.meta.resolve("@huggingface/transformers");
        return true;
    } catch (_e) {
        return false;
    }
}

export const preload_model = async (): Promise<boolean> => {
    let pipeline: PipelineFunc;

    try {
        const hf = await import("@huggingface/transformers");

        //@ts-expect-error assuming types unavailable, and overriding
        pipeline = hf.pipeline;
    } catch (_e) {
        return false;
    }

    if (typeof pipeline !== "function") {
        return false;
    }

    try {
        await pipeline("text-classification", "Xenova/toxic-bert");
        return true;
    } catch (e) {
        console.error("Automod model preload error", e);
        return false;
    }
};

export const check_text = async (text: string): Promise<AutoModResult> => {
    // check known good cache
    if (known_good_cache.has(text)) {
        return {status: AutoModStatus.CLEAN, cache_hit: true};
    }

    // check known bad cache
    const cached_bad = known_bad_cache.get(text);
    if (cached_bad) {
        return {status: AutoModStatus.FLAGGED, violating_labels: cached_bad, cache_hit: true};
    }

    let pipeline: PipelineFunc;

    try {
        const hf = await import("@huggingface/transformers");
        
        //@ts-expect-error assuming types unavailable, and overriding
        pipeline = hf.pipeline;
    } catch (_e) {
        return {status: AutoModStatus.UNSUPPORTED};
    }

    if (typeof pipeline !== "function") {
        return {status: AutoModStatus.UNSUPPORTED};
    }

    try {
        const classifier = await pipeline("text-classification", "Xenova/toxic-bert");
        const results = await classifier(text, {top_k: null});

        // collect all violating labels
        const violating_labels = results
            .filter(result =>
                BANNED_LABELS.includes(result.label.toLowerCase())
                && result.score >= FLAG_THRESHOLD
            )
            .map(result => result.label);

        if (violating_labels.length > 0) {
            // add to known bad cache
            known_bad_cache.set(text, violating_labels);

            return {status: AutoModStatus.FLAGGED, violating_labels, cache_hit: false};
        }

        // add to known good cache
        known_good_cache.set(text, true);

        return {status: AutoModStatus.CLEAN, cache_hit: false};
    } catch (e) {
        console.error("Automod error", e);
        return {status: AutoModStatus.ERROR};
    }
};

// TODO: fall back to dictionary based filtering
// TODO: let admin configure labels and threshold
// TODO: way for admins to manually revoke messages in the ui. if we generate message snowflakes on the server then we can just broadcast "revoke this id"
