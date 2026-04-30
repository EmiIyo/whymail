import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { ROUTE_PATHS } from '@/lib/index';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background px-6 py-10">
      <div className="max-w-2xl mx-auto">
        <Link to={ROUTE_PATHS.LOGIN} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-6">
          <ChevronLeft className="w-3.5 h-3.5" /> Back
        </Link>

        <h1 className="text-2xl font-semibold mb-2">Privacy Policy</h1>
        <p className="text-xs text-muted-foreground mb-8">Last updated: 2026-04-29</p>

        <div className="prose prose-sm max-w-none space-y-5 text-foreground/90 text-sm leading-relaxed">
          <section>
            <h2 className="text-base font-semibold">1. What we store</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Your sign-up email and securely hashed password (Supabase Auth).</li>
              <li>The mailboxes assigned to you and any aliases you configure.</li>
              <li>Email content (subject, sender, recipients, body, attachments) for messages sent or received via WhyMail.</li>
              <li>Optional recovery email so you can reset your password without administrator help.</li>
              <li>Audit metadata: timestamps of last sign-in, last activity, password change events.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold">2. Where it's stored</h2>
            <p>All structured data lives in a Supabase Postgres database; attachments live in a private Supabase Storage bucket with row-level security restricting access to the mailbox owner and platform administrator.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold">3. Third parties</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Cloudflare Email Routing</strong> handles inbound mail before forwarding it to our system.</li>
              <li><strong>ForwardEmail</strong> delivers outbound mail and password reset notifications.</li>
              <li><strong>Supabase</strong> hosts our database and authentication.</li>
            </ul>
            <p>We do not sell your data, and these providers process it solely to operate the service.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold">4. Who can see your mail</h2>
            <p>Only you can read your mailbox content. Administrators can manage your account (reset password, disable mailbox, delete account) but cannot read your messages — row-level security ties email rows to your user identity.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold">5. Cookies and analytics</h2>
            <p>WhyMail uses local storage and a Supabase session cookie to keep you signed in. We do not run third-party analytics or advertising trackers.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold">6. Your rights</h2>
            <p>You can request access, correction or deletion of your data at any time via your administrator. Once you delete your account, your data is removed within 30 days.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold">7. Security</h2>
            <p>Passwords are hashed by Supabase Auth. Sessions are protected by HTTPS. Outbound mail is signed with DKIM via the configured domain.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold">8. Contact</h2>
            <p>Questions or data requests can be sent to the platform administrator.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
