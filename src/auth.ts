import NextAuth, {User} from "next-auth"
import DiscordProvider from "next-auth/providers/discord";

if (!process.env.DISCORD_CLIENT_ID || !process.env.DISCORD_CLIENT_SECRET) {
    throw new Error("Missing DISCORD_CLIENT_ID or DISCORD_CLIENT_SECRET environment variable");
}

export interface UserWithAdminFlag extends User {
    is_admin?: boolean;
}

export const handler = NextAuth({
    providers: [
        DiscordProvider({
            clientId: process.env.DISCORD_CLIENT_ID,
            clientSecret: process.env.DISCORD_CLIENT_SECRET,
            authorization: { params: { scope: "identify guilds" } }, // need access to guilds
        })
    ],

    callbacks: {
        // verify that the user is in a specific guild
        async signIn({ user, account }) {
            // if the user is the DISCORD_ADMIN_USER_ID, allow sign in regardless
            if (process.env.DISCORD_ADMIN_USER_ID && user.id === process.env.DISCORD_ADMIN_USER_ID) {
                return true;
            }

            const guild_id = process.env.DISCORD_GUILD_ID;
            if (!guild_id) {
                throw new Error("Missing DISCORD_GUILD_ID environment variable");
            }

            try {
                const res = await fetch(`https://discord.com/api/users/@me/guilds`, {
                    headers: {
                        Authorization: `Bearer ${account?.access_token}`,
                    },
                });

                if (!res.ok) {
                    console.error("Failed to fetch user's guilds:", res.statusText);
                    return false; // deny sign in if we can't fetch guilds
                }

                const guilds = await res.json();
                const is_member = guilds.some((guild: {id: string}) => guild.id === guild_id);

                if (!is_member) {
                    console.warn(`User ${user.id} is not a member of the required guild ${guild_id}`);
                }

                return is_member; // allow sign in only if user is in the guild
            } catch (error) {
                console.error("Error checking guild membership:", error);
                return false; // deny sign in on error
            }
        },

        async session({ session, token }) {
            // add user id to session
            if (session.user && token.sub) {
                (session.user as User).id = token.sub;
            }

            // add admin flag to session if the user is the admin
            if (process.env.DISCORD_ADMIN_USER_ID && token.sub === process.env.DISCORD_ADMIN_USER_ID) {
                (session.user as UserWithAdminFlag).is_admin = true;
            }
            return session;
        }
    }
})
