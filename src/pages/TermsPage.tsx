import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { ROUTE_PATHS } from '@/lib/index';

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background px-6 py-10">
      <div className="max-w-2xl mx-auto">
        <Link to={ROUTE_PATHS.LOGIN} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-6">
          <ChevronLeft className="w-3.5 h-3.5" /> Back
        </Link>

        <h1 className="text-2xl font-semibold mb-2">Terms of Service</h1>
        <p className="text-xs text-muted-foreground mb-8">Last updated: 2026-04-29</p>

        <div className="prose prose-sm max-w-none space-y-5 text-foreground/90 text-sm leading-relaxed">
          <section>
            <h2 className="text-base font-semibold">1. The service</h2>
            <p>WhyMail is a self-hosted email service operated by the platform owner for their own domains. By signing up you create an account that lets you read and send mail through addresses your administrator assigns to you.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold">2. Account access</h2>
            <p>Sign-ups are open but new accounts have no mailbox or domain rights until the platform administrator grants them. You are responsible for keeping your password safe and for all activity from your account.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold">3. Acceptable use</h2>
            <p>You agree not to use WhyMail for spam, harassment, malware, phishing, or any unlawful purpose. We may suspend or remove any account that violates this rule, including emails that get reported as abuse by the receiving provider.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold">4. Content</h2>
            <p>You retain ownership of the email content you send and receive. Inbound mail is stored encrypted-at-rest in our database; we do not read your content except as required to deliver and display it.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold">5. Service availability</h2>
            <p>We aim for high availability but make no SLA guarantee. Mail delivery depends on third parties (Cloudflare for inbound, Resend for outbound) and may be delayed or rejected by them.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold">6. Termination</h2>
            <p>You can request account deletion at any time. Upon deletion, your mailbox content and personal data are removed within 30 days.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold">7. Changes</h2>
            <p>These terms may evolve. Material changes will be communicated via the email on file. Continued use after a change implies acceptance.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold">8. Contact</h2>
            <p>For questions about these terms or the service, contact the platform administrator.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
