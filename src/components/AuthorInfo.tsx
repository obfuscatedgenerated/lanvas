import Image from "next/image";

import {Author} from "@/types";

const AuthorInfo = ({ author }: { author: Author }) => (
    <>
        {author.avatar_url && <Image src={author.avatar_url} alt="" draggable={false} width={20} height={20} className="rounded-full" />}
        <span>{author.name}</span>
    </>
);

export default AuthorInfo;
