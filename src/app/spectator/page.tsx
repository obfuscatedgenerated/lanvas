import type {Metadata} from "next";

import SpectatorView from "@/components/SpectatorView";

export const metadata: Metadata = {
    title: "Spectator",
};

export default function SpectatorPage() {
    return <SpectatorView />;
}
