import { motion } from 'framer-motion';
import {
  Reply, Forward, Trash2, Star, MailOpen, MoreHorizontal,
  Paperclip, Download, ChevronLeft, AlertTriangle, Inbox, RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { useEmailStore } from '@/hooks/useEmailStore';
import { useEmailActions } from '@/hooks/useEmailActions';
import { useEmailMutations } from '@/hooks/useEmailMutations';
import { getInitials, formatBytes, formatDateTime } from '@/lib/index';
import type { Email } from '@/lib/index';
import { fadeInUp } from '@/lib/motion';
import { useToast } from '@/hooks/use-toast';

interface EmailViewProps {
  email: Email;
}

export function EmailView({ email }: EmailViewProps) {
  const { setSelectedEmail } = useEmailStore();
  const { toggleStar, deleteEmail, markUnread, moveToFolder } = useEmailMutations();
  const { replyTo, forwardEmail } = useEmailActions();
  const { toast } = useToast();

  const isInTrash = email.folder === 'trash';
  const isInSpam = email.folder === 'spam';

  const handleDelete = async () => {
    await deleteEmail(email.id, email.folder);
    setSelectedEmail(null);
    toast({ title: isInTrash ? 'Permanently deleted' : 'Moved to Trash' });
  };

  const handleSpam = async () => {
    await moveToFolder(email.id, 'spam');
    setSelectedEmail(null);
    toast({ title: 'Marked as spam' });
  };

  const handleNotSpam = async () => {
    await moveToFolder(email.id, 'inbox');
    setSelectedEmail(null);
    toast({ title: 'Moved back to Inbox' });
  };

  const handleRestore = async () => {
    // Outgoing mail in trash should restore to sent; everything else to inbox.
    const target = email.from && email.to && email.from !== ''
      // Heuristic: an outbound trash item has the user as sender. We default
      // to inbox; users can manually move to sent if needed.
      ? 'inbox' as const
      : 'inbox' as const;
    await moveToFolder(email.id, target);
    setSelectedEmail(null);
    toast({ title: 'Restored to Inbox' });
  };

  return (
    <motion.div
      className="flex flex-col h-full bg-background"
      variants={fadeInUp}
      initial="hidden"
      animate="visible"
    >
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-2 lg:px-4 py-2.5 border-b border-border shrink-0">
        <Button variant="ghost" size="sm" onClick={() => setSelectedEmail(null)} className="text-muted-foreground gap-1 px-2">
          <ChevronLeft className="w-4 h-4" />
          <span className="hidden sm:inline text-xs">Back</span>
        </Button>
        <Separator orientation="vertical" className="h-4 mx-1 hidden lg:block" />

        <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={() => replyTo(email)} aria-label="Reply">
          <Reply className="w-4 h-4 lg:w-3.5 lg:h-3.5" />
          <span className="hidden lg:inline">Reply</span>
        </Button>
        <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={() => forwardEmail(email)} aria-label="Forward">
          <Forward className="w-4 h-4 lg:w-3.5 lg:h-3.5" />
          <span className="hidden lg:inline">Forward</span>
        </Button>

        <div className="flex-1" />

        <Button
          variant="ghost" size="sm"
          onClick={() => void toggleStar(email.id, email.starred)}
          className={email.starred ? 'text-foreground' : 'text-muted-foreground'}
          aria-label={email.starred ? 'Unstar' : 'Star'}
        >
          <Star className={`w-4 h-4 lg:w-3.5 lg:h-3.5 ${email.starred ? 'fill-foreground' : ''}`} />
        </Button>

        {isInTrash ? (
          <Button variant="ghost" size="sm" onClick={handleRestore} className="text-muted-foreground hover:text-foreground" aria-label="Restore to Inbox">
            <RotateCcw className="w-4 h-4 lg:w-3.5 lg:h-3.5" />
          </Button>
        ) : (
          <Button variant="ghost" size="sm" onClick={handleDelete} className="text-muted-foreground hover:text-destructive" aria-label="Delete">
            <Trash2 className="w-4 h-4 lg:w-3.5 lg:h-3.5" />
          </Button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="text-muted-foreground">
              <MoreHorizontal className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => void markUnread(email.id)}>
              <MailOpen className="w-3.5 h-3.5 mr-2" /> Mark as unread
            </DropdownMenuItem>
            {isInSpam ? (
              <DropdownMenuItem onClick={handleNotSpam}>
                <Inbox className="w-3.5 h-3.5 mr-2" /> Not spam — move to Inbox
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={handleSpam} className="text-destructive">
                <AlertTriangle className="w-3.5 h-3.5 mr-2" /> Report spam
              </DropdownMenuItem>
            )}
            {isInTrash && (
              <DropdownMenuItem onClick={handleDelete} className="text-destructive">
                <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete permanently
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ScrollArea className="flex-1">
        <div className="max-w-3xl mx-auto px-4 py-5 lg:px-6 lg:py-6">
          {/* Subject */}
          <h1 className="text-xl font-semibold text-foreground mb-5 leading-snug">
            {email.subject || '(no subject)'}
          </h1>

          {/* Sender info */}
          <div className="flex items-start gap-3 mb-6">
            <Avatar className="w-10 h-10">
              <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                {getInitials(email.fromName)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-foreground text-sm">{email.fromName}</span>
                <span className="text-xs text-muted-foreground font-mono">&lt;{email.from}&gt;</span>
              </div>
              <div className="text-xs text-muted-foreground mt-0.5 space-y-0.5">
                <p>To: {email.to.join(', ')}</p>
                {email.cc && email.cc.length > 0 && <p>CC: {email.cc.join(', ')}</p>}
                <p className="pt-1">{formatDateTime(email.date)}</p>
              </div>
            </div>
          </div>

          <Separator className="mb-6" />

          {/* Body */}
          {email.bodyHtml ? (
            <div
              className="prose prose-sm max-w-none text-foreground"
              dangerouslySetInnerHTML={{ __html: email.bodyHtml }}
            />
          ) : (
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground">
              {email.bodyText}
            </pre>
          )}

          {/* Attachments */}
          {email.attachments.length > 0 && (
            <div className="mt-8">
              <Separator className="mb-4" />
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <Paperclip className="w-4 h-4" />
                {email.attachments.length} Attachment{email.attachments.length !== 1 ? 's' : ''}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {email.attachments.map(att => (
                  <div
                    key={att.id}
                    className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/30 hover:bg-accent/50 transition-colors group"
                  >
                    <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                      <Paperclip className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{att.filename}</p>
                      <p className="text-xs text-muted-foreground">{formatBytes(att.size)}</p>
                    </div>
                    <a
                      href={att.url}
                      download={att.filename}
                      className="p-1.5 rounded-md hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quick Reply */}
          <div className="mt-8">
            <Separator className="mb-4" />
            <div className="flex gap-3">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => replyTo(email)}>
                <Reply className="w-3.5 h-3.5" /> Reply
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => forwardEmail(email)}>
                <Forward className="w-3.5 h-3.5" /> Forward
              </Button>
            </div>
          </div>
        </div>
      </ScrollArea>
    </motion.div>
  );
}
