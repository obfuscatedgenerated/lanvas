import { cookies } from "next/headers";
import { unauthorized } from "next/navigation";
import {getToken} from "next-auth/jwt";
import {Suspense} from "react";
import {revalidateTag} from "next/cache";

import AdminPageInteractivity from "@/components/AdminPageInteractivity";
import FancyButton, {fancy_button_class} from "@/components/FancyButton";
import Link from "next/link";

const revalidate_og = async () => {
    "use server";
    const cookie_store = await cookies();

    // @ts-expect-error need to get original jwt so to inspect user id, but we dont get a full request object in app router
    const token = await getToken({ req: {cookies: cookie_store}, secret: process.env.NEXTAUTH_SECRET });
    if (!token) {
        return unauthorized();
    }

    if (!process.env.DISCORD_ADMIN_USER_ID || token.sub !== process.env.DISCORD_ADMIN_USER_ID) {
        return unauthorized();
    }

    console.log("Will revalidate OG image");
    revalidateTag("og-image");
}

export default async function AdminPage() {
    const cookie_store = await cookies();

    // @ts-expect-error need to get original jwt so to inspect user id, but we dont get a full request object in app router
    const token = await getToken({ req: {cookies: cookie_store}, secret: process.env.NEXTAUTH_SECRET });
    if (!token) {
        return unauthorized();
    }

    if (!process.env.DISCORD_ADMIN_USER_ID || token.sub !== process.env.DISCORD_ADMIN_USER_ID) {
        return unauthorized();
    }

    return (
        <div className="p-8 flex flex-col gap-4 items-start overflow-y-scroll">
            <h1 className="text-3xl font-bold">Admin Page</h1>

            <Suspense fallback="Loading...">
                <AdminPageInteractivity />
            </Suspense>

            <div className="flex">
                <FancyButton onClick={revalidate_og}>
                    Revalidate OG image
                </FancyButton>

                <Link href="/opengraph-image" download="canvas.png" className={fancy_button_class}>
                    Download canvas (revalidate first)
                </Link>
            </div>
        </div>
    );
}
