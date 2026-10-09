const PrivacyPolicy = () => (
    <div className="flex flex-col gap-3 mt-2 max-h-75 pr-3 overflow-y-scroll">
        <p>Only the minimum scopes required to operate the service are collected:</p>

        <ul className="list-disc">
            <li>
                <strong>Access your username, avatar and banner (<code>identify</code>)</strong> to get your unique Discord ID, username, and avatar. This information is used to show who placed which pixel.
            </li>
            <li>
                <strong>Know what servers you&apos;re in (<code>guilds</code>)</strong> to verify that you are a member of the required Discord server to gain access. This check is performed when you log in and <strong>your list of servers is never stored</strong>.
            </li>
        </ul>

        <p>When you place a pixel, the following data is stored:</p>

        <ul className="list-disc">
            <li><strong>Your Discord User ID, username, and avatar URL</strong> to attribute pixel placements to you.</li>
            <li><strong>The coordinates (x, y) of the pixel</strong> you placed.</li>
            <li><strong>The color value</strong> of the pixel you placed.</li>
            <li><strong>A time based identifier</strong> to determine the order of pixel placements.</li>
        </ul>

        <p>Historical pixel data is also stored, including the same data as above, in order to facilitate rollbacks and time lapses.</p>

        <p>Statistics and leaderboards derived from this data, such as how many pixels you have placed, may be shown to other signed-in users alongside <strong>your username and avatar</strong>.</p>

        <p>At the end of the event, all pixels will be anonymised, records of interactions between users will be erased, and all user details on record will be erased.</p>

        <p>Users have the ability to place live comments on the canvas. <strong>Comments are ephemeral and are not stored.</strong> They are only transmitted to other connected users in real-time. The data included in a comment is:</p>
        <ul className="list-disc">
            <li><strong>Your Discord User ID, username, and avatar URL</strong> to attribute comments to you.</li>
            <li><strong>The coordinates (x, y) of the pixel</strong> the comment is attached to (including decimal offsets).</li>
            <li><strong>The content of the comment</strong> you wrote.</li>
        </ul>

        <p>Comments may be filtered by automatic moderation systems. These systems are local to the service and do not transmit data to third parties.</p>

        <p>Known &quot;good&quot; and &quot;bad&quot; comment content may be temporarily cached to improve moderation performance. This cache is ephemeral and is discarded when the service is restarted. The contents of the cache cannot be viewed, it simply exists to speed up the automatic moderation process.</p>

        <p>Some game features let users interact with each other. When these are used, <strong>a record of each interaction is stored</strong>, including the Discord User IDs of the users involved, what took place, and when, in order to run the feature and show statistics. The other users involved may be shown <strong>your username and avatar</strong> as part of the interaction.</p>

        <p>Anything held temporarily for these features, such as items waiting to be used and their expiry times, <strong>is kept in memory only</strong> and discarded when it expires or the service restarts.</p>

        <p>Some features announce what happened to all connected users, including <strong>your username, avatar, and the outcome</strong>, and may temporarily change how your name appears to others. These announcements are not stored.</p>

        <p>When you vote in a poll, <strong>your vote is held in memory against your Discord User ID</strong> only until the poll ends, so you can change it. Only the total counts are shown to others, and votes are not stored.</p>

        <p>While some features are enabled, other signed-in users may be able to see your <strong>username, avatar, and whether you are currently active or AFK</strong>. This is not stored, and is only shared while you are connected to the canvas.</p>

        <p>For service integrity, prevent abuse, and facilitate moderation, site administrators have access to real-time session data. This includes your <strong>Socket ID, Discord User ID, username, avatar URL, whether you are currently active or AFK, and the specific page you are currently viewing</strong>.</p>

        <p><strong>This session data is ephemeral.</strong> It is retained only for the duration of your active WebSocket connection and is immediately discarded when you disconnect or close the page.</p>

        <p>If your account is banned from the service, your user ID will be stored indefinitely to prevent access to the service. For private, internal records, your username as it was at the time of the ban may be stored.</p>

        <p>To facilitate live previews, the canvas image data may be publicly accessible in certain circumstances.</p>

        <p>By using the service, you acknowledge the above. You also acknowledge the base <a target="_blank" rel="noreferrer noopener" className="text-blue-500" href="https://ollieg.codes/privacy">ollieg.codes Privacy Policy</a>.</p>
    </div>
);

export default PrivacyPolicy;