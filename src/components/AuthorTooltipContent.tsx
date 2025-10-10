import Image from "next/image";
import type { Author } from "@/types";

const AuthorTooltipContent = ({ author }: { author: Author }) => {
    return (
        <div className="flex items-center gap-1.5">
            <span className="font-semibold">Last edited by:</span>
            {author.avatar_url && <Image src={author.avatar_url} alt="" draggable={false} width={20} height={20} className="rounded-full" />}
            <span>{author.name}</span>
        </div>
    );
}

export default AuthorTooltipContent;
