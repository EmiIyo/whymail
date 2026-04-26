import { motion } from 'framer-motion';
import { Star, Paperclip } from 'lucide-react';
import { useEmailStore } from '@/hooks/useEmailStore';
import { useEmailMutations } from '@/hooks/useEmailMutations';
import { formatEmailDate, getInitials } from '@/lib/index';
import type { Email } from '@/lib/index';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { staggerContainer, staggerItem } from '@/lib/motion';

interface EmailListProps {
  emails: Email[];
  title: string;
  emptyMessage?: string;
  onSelect?: (email: Email) => void;
}

export function EmailList({ emails, title, emptyMessage = 'No emails here.', onSelect }: EmailListProps) {
  const { selectedEmailId, setSelectedEmail } = useEmailStore();
  const { markRead, toggleStar } = useEmailMutations();

  const handleSelect = (email: Email) => {
    if (onSelect) { onSelect(email); return; }
    setSelectedEmail(email.id);
    if (!email.read) void markRead(email.id);
  };

  return (
    <div className="flex flex-col h-full">
      {/* List header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-background">
        <h2 className="font-semibold text-foreground text-sm capitalize">{title}</h2>
        <span className="text-xs text-muted-foreground">{emails.length} message{emails.length !== 1 ? 's' : ''}</span>
      </div>

      {emails.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground gap-2">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
            <Star className="w-5 h-5" />
          </div>
          <p className="text-sm">{emptyMessage}</p>
        </div>
      ) : (
        <motion.div
          className="flex-1 overflow-y-auto divide-y divide-border"
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
        >
          {emails.map(email => (
            <motion.div
              key={email.id}
              variants={staggerItem}
              onClick={() => handleSelect(email)}
              className={`flex items-start gap-3 px-4 py-3.5 cursor-pointer transition-colors active:bg-accent hover:bg-accent/50 overflow-hidden w-full ${
                selectedEmailId === email.id ? 'bg-accent border-l-2 border-l-primary' : ''
              } ${!email.read ? 'bg-primary/3' : ''}`}
            >
              {/* Avatar — bigger on mobile for touch friendliness */}
              <Avatar className="w-10 h-10 lg:w-8 lg:h-8 shrink-0 mt-0.5">
                <AvatarFallback className={`text-sm lg:text-xs font-semibold ${!email.read ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                  {getInitials(email.fromName)}
                </AvatarFallback>
              </Avatar>

              <div className="flex-1 min-w-0 overflow-hidden">
                <div className="flex items-center justify-between gap-2 mb-0.5 overflow-hidden">
                  <span className={`text-[15px] lg:text-sm truncate min-w-0 flex-1 ${!email.read ? 'font-semibold text-foreground' : 'font-medium text-foreground/80'}`}>
                    {email.fromName}
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0 ml-1">
                    {email.attachments.length > 0 && <Paperclip className="w-3 h-3 text-muted-foreground" />}
                    <span className="text-xs text-muted-foreground whitespace-nowrap">{formatEmailDate(email.date)}</span>
                  </div>
                </div>
                <p className={`text-[14px] lg:text-sm truncate mb-0.5 w-full ${!email.read ? 'font-medium text-foreground' : 'text-foreground/75'}`}>
                  {email.subject}
                </p>
                <p className="text-[13px] lg:text-xs text-muted-foreground line-clamp-1 w-full">{email.bodyText.slice(0, 120)}</p>
              </div>

              {/* Star — larger touch target on mobile */}
              <button
                onClick={e => { e.stopPropagation(); void toggleStar(email.id, email.starred); }}
                className="shrink-0 -m-2 p-2 rounded-full hover:text-foreground transition-colors"
                aria-label={email.starred ? 'Unstar' : 'Star'}
              >
                <Star className={`w-4 h-4 lg:w-3.5 lg:h-3.5 ${email.starred ? 'fill-foreground text-foreground' : 'text-muted-foreground/30'}`} />
              </button>

              {/* Unread dot */}
              {!email.read && (
                <div className="w-2 h-2 rounded-full bg-primary shrink-0 mt-2" />
              )}
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  );
}
