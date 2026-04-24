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

    const { accountId } = await req.json();

    const { data: account, error: accError } = await supabase
      .from('email_accounts')
      .select('*')
      .eq('id', accountId)
      .eq('user_id', user.id)
      .single();

    if (accError || !account) {
      return new Response(JSON.stringify({ error: 'Account not found' }), { status: 404, headers: corsHeaders });
    }

    // Connect to IMAP
    const { ImapClient } = await import('https://deno.land/x/imap@v0.0.5/mod.ts');

    const imap = new ImapClient({
      host: account.imap_host,
      port: account.imap_port,
      tls: account.imap_secure,
      username: account.username,
      password: account.password_encrypted,
    });

    await imap.connect();
    const mailbox = await imap.selectMailbox('INBOX');
    const totalMessages = mailbox.exists ?? 0;

    // Fetch last 50 unseen messages
    const fetchCount = Math.min(50, totalMessages);
    if (fetchCount === 0) {
      await imap.logout();
      await supabase.from('email_accounts').update({ last_synced_at: new Date().toISOString() }).eq('id', accountId);
      return new Response(JSON.stringify({ synced: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const messages = await imap.fetch(`${Math.max(1, totalMessages - fetchCount + 1)}:${totalMessages}`, {
      envelope: true,
      bodyStructure: true,
      body: ['TEXT', 'HEADER'],
    });

    let synced = 0;

    for (const msg of messages) {
      try {
        const messageId = msg.envelope?.messageId ?? `uid-${msg.uid}@${account.imap_host}`;
        const subject = msg.envelope?.subject ?? '(no subject)';
        const fromAddr = msg.envelope?.from?.[0]?.address ?? '';
        const fromName = msg.envelope?.from?.[0]?.name ?? fromAddr;
        const toAddrs = (msg.envelope?.to ?? []).map((a: { address: string }) => a.address).filter(Boolean);
        const date = msg.envelope?.date ? new Date(msg.envelope.date).toISOString() : new Date().toISOString();
        const bodyText = msg.body?.TEXT ?? '';

        const { error: upsertError } = await supabase.from('emails').upsert({
          user_id: user.id,
          account_id: accountId,
          message_id: messageId,
          folder: 'inbox',
          from_address: fromAddr,
          from_name: fromName,
          to_addresses: toAddrs,
          subject,
          body_text: bodyText,
          is_read: false,
          sent_at: date,
        }, { onConflict: 'account_id,message_id', ignoreDuplicates: true });

        if (!upsertError) synced++;
      } catch (msgErr) {
        console.error('Error processing message:', msgErr);
      }
    }

    await imap.logout();

    // Update last synced timestamp
    await supabase
      .from('email_accounts')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('id', accountId);

    return new Response(
      JSON.stringify({ synced, total: totalMessages }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Sync error:', err);
    return new Response(
      JSON.stringify({ synced: 0, error: err instanceof Error ? err.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
