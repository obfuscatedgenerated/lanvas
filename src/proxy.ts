import {NextRequest, NextResponse} from "next/server";

import {withAuth} from "next-auth/middleware";

export function proxy(request: NextRequest) {
    if (request.nextUrl.pathname === "/opengraph-image" || request.nextUrl.pathname === "/icon.ico") {
        return NextResponse.next()
    }

    // static images in public/ are fetched without cookies by the image optimiser, so they can't sit behind auth
    const is_public_image = /\.(png|jpe?g|gif|webp|svg|ico)$/i.test(request.nextUrl.pathname);

    if (is_public_image || request.nextUrl.pathname === "/opengraph-image") {
        return NextResponse.next();
    }

    const url = request.nextUrl.clone();
    if (request.method === "GET" && url.pathname === "/api/auth/callback/discord") {
        // explicitly handle errors from the oauth callback to give more info to the sign in page

        const query = new URL(request.url).searchParams;
        if (query.get("error")) {
            url.pathname = "/api/auth/signin";

            // delete all existing search params
            url.search = "";
            url.searchParams.set("error", "Callback");
            url.searchParams.set("callback_error", query.get("error") || "");
            return NextResponse.redirect(url);
        }
    }

    //@ts-expect-error seems to be the only way it works, and this should be a valid signature, just it doesnt have "nextauth" as a field?
    return withAuth(request);
}
