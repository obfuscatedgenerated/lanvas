const BANNED_LABELS = ["severe_toxic", "obscene", "threat", "identity_hate"];
const FLAG_THRESHOLD = 0.7;

export enum AutoModStatus {
    CLEAN, // the text is clean
    FLAGGED, // the text is flagged as inappropriate
    UNSUPPORTED, // automod is not supported
    ERROR // there was an error checking the text
}

type AutoModStatusNotFlagged = Exclude<AutoModStatus, AutoModStatus.FLAGGED>;

interface AutoModResultNotFlagged {
    status: AutoModStatusNotFlagged;
}

interface AutoModResultFlagged {
    status: AutoModStatus.FLAGGED;
    violating_labels: string[];
}

type AutoModResult = AutoModResultNotFlagged | AutoModResultFlagged;

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
            return {status: AutoModStatus.FLAGGED, violating_labels};
        }

        return {status: AutoModStatus.CLEAN};
    } catch (e) {
        console.error("Automod error", e);
        return {status: AutoModStatus.ERROR};
    }
};
