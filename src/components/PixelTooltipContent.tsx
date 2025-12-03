import AuthorInfo from "@/components/AuthorInfo";
import type { Author } from "@/types";

const PixelTooltipContent = ({ author, x, y }: { author: Author, x: number, y: number }) => {
    return (
        <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
                <span className="font-semibold">Last edited by:</span>
                <AuthorInfo author={author} />
            </div>

            <span><span className="font-semibold">Cell:</span> ({x}, {y})</span>

            <span className="text-neutral-400 text-sm">Right-click to add a live comment</span>
        </div>
    );
}

export default PixelTooltipContent;
