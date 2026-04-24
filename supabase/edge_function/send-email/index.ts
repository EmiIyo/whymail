import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const authHeader = req.headers.get('Authorization');
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader?.replace('Bearer ', '') ?? ''
    );
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const { accountId, to, cc, bcc, subject, body } = await req.json();

    // Fetch account credentials
    const { data: account, error: accError } = await supabase
      .from('email_accounts')
      .select('*')
      .eq('id', accountId)
      .eq('user_id', user.id)
      .single();

    if (accError || !account) {
      return new Response(JSON.stringify({ error: 'Account not found' }), { status: 404, headers: corsHeaders });
    }

    // Send via SMTP using Deno's built-in fetch to an SMTP relay
    // Using smtp client for Deno
    const SmtpClient = (await import('https://deno.land/x/denomailer@1.6.0/mod.ts')).SMTPClient;

    const client = new SmtpClient({
      connection: {
        hostname: account.smtp_host,
        port: account.smtp_port,
        tls: account.smtp_secure,
        auth: {
          username: account.username,
          password: account.password_encrypted,
        },
      },
    });

    const toList = to.split(',').map((t: string) => t.trim()).filter(Boolean);

    await client.send({
      from: account.email,
      to: toList,
      cc: cc ? cc.split(',').map((t: string) => t.trim()).filter(Boolean) : [],
      bcc: bcc ? bcc.split(',').map((t: string) => t.trim()).filter(Boolean) : [],
      subject: subject ?? '(no subject)',
      content: body,
      html: body,
    });

    await client.close();

    // Save to sent folder in DB
    const messageId = `<${Date.now()}@${account.email.split('@')[1]}>`;
    const { data: savedEmail, error: saveError } = await supabase.from('emails').insert({
      user_id: user.id,
      account_id: accountId,
      message_id: messageId,
      folder: 'sent',
      from_address: account.email,
      from_name: account.display_name ?? account.email,
      to_addresses: toList,
      cc_addresses: cc ? cc.split(',').map((t: string) => t.trim()).filter(Boolean) : null,
      bcc_addresses: bcc ? bcc.split(',').map((t: string) => t.trim()).filter(Boolean) : null,
      subject: subject ?? '(no subject)',
      body_text: body,
      is_read: true,
      sent_at: new Date().toISOString(),
    }).select().single();

    if (saveError) console.error('Save to sent failed:', saveError);

    return new Response(
      JSON.stringify({ success: true, messageId, emailId: savedEmail?.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Send email error:', err);
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
