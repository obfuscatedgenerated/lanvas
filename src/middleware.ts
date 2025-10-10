export {default} from "next-auth/middleware"

export const config = {
    matcher: [
        "/",
        "/admin",
        "/((?!api|_next/static|favicon.ico|opengraph-image).*)",
    ]
}
