import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";
import SignInForm from "@/components/SignInForm";

export default async function SignInPage() {
    const session = await getServerSession();
    if (session) {
        redirect("/");
    }

    return (
        <div className="flex flex-col items-center justify-center flex-1">
            <SignInForm />
        </div>
    );
}
