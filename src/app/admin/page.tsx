import { cookies } from "next/headers";
import { unauthorized } from "next/navigation";
import {getToken} from "next-auth/jwt";
import {Suspense} from "react";
import AdminPageInteractivity from "@/components/AdminPageInteractivity";

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
        <div className="p-8">
            <h1 className="text-3xl font-bold mb-4">Admin Page</h1>
            <Suspense fallback="Loading...">
                <AdminPageInteractivity />
            </Suspense>
        </div>
    );
}
