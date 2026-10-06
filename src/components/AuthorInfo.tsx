"use client";

import Image from "next/image";

import {Author} from "@/types";
import {useIsClowned} from "@/lib/clowned";

const AuthorInfo = ({ author }: { author: Author }) => {
    const is_clowned = useIsClowned(author.user_id);

    return (
        <>
            {author.avatar_url && <Image src={author.avatar_url} alt="" draggable={false} width={20} height={20} className="rounded-full" />}
            <span>{author.name}</span>
            {is_clowned && <span title="Clowned by the casino">🤡</span>}
        </>
    );
};

export default AuthorInfo;