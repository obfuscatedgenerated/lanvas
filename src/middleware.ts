import { withAuth } from "next-auth/middleware";
import {handler} from "@/auth";

export default withAuth(handler);

export const config = {
    matcher: [
        "/",
        "/admin",
        // exclude api routes, public, and special paths explicitly
        "/((?!api|_next/static|favicon.ico|opengraph-image).*)",
    ],
};
