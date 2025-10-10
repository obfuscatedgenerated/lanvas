import {NextRequest, NextResponse} from "next/server";

import {withAuth} from "next-auth/middleware";

export function middleware(request: NextRequest) {
    if (request.nextUrl.pathname === "/opengraph-image" || request.nextUrl.pathname === "/icon.ico") {
        return NextResponse.next()
    }

    //@ts-expect-error seems to be the only way it works, and this should be a valid signature, just it doesnt have "nextauth" as a field?
    return withAuth(request);
}
