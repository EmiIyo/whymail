import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Minimize2, Maximize2, Paperclip, Send, ChevronDown, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useEmailActions } from '@/hooks/useEmailActions';
import { useToast } from '@/hooks/use-toast';
import type { ComposeData } from '@/lib/index';
import { formatBytes } from '@/lib/index';
import { springPresets } from '@/lib/motion';

interface ComposeModalProps {
  open: boolean;
  onClose: () => void;
  initialData?: Partial<ComposeData> | null;
}

export function ComposeModal({ open, onClose, initialData }: ComposeModalProps) {
  const { sendEmail, sending } = useEmailActions();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [minimized, setMinimized] = useState(false);
  const [showCC, setShowCC] = useState(!!initialData?.cc);
  const [showBCC, setShowBCC] = useState(!!initialData?.bcc);
  const [form, setForm] = useState<ComposeData>({
    to: initialData?.to ?? '',
    cc: initialData?.cc ?? '',
    bcc: initialData?.bcc ?? '',
    subject: initialData?.subject ?? '',
    body: initialData?.body ?? '',
    attachments: [],
  });

  const update = (k: keyof ComposeData, v: string | File[]) => setForm(f => ({ ...f, [k]: v }));

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    setForm(f => ({ ...f, attachments: [...f.attachments, ...files] }));
    if (fileRef.current) fileRef.current.value = '';
  };

  const removeFile = (idx: number) =>
    setForm(f => ({ ...f, attachments: f.attachments.filter((_, i) => i !== idx) }));

  const handleSend = async () => {
    if (!form.to.trim()) {
      toast({ title: 'Recipient required', description: 'Please enter a "To" address.', variant: 'destructive' });
      return;
    }
    const result = await sendEmail(form);
    if (result.success) {
      toast({ title: 'Email sent!', description: `Your message to ${form.to} was sent successfully.` });
      onClose();
    } else {
      toast({ title: 'Failed to send', description: result.error, variant: 'destructive' });
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed bottom-4 right-4 z-50 w-[560px] max-w-[calc(100vw-2rem)] bg-card border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden"
          initial={{ opacity: 0, y: 40, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1, height: minimized ? 48 : 'auto' }}
          exit={{ opacity: 0, y: 40, scale: 0.95 }}
          transition={springPresets.gentle}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3 bg-foreground/5 border-b border-border cursor-pointer select-none"
            onClick={() => minimized && setMinimized(false)}
          >
            <span className="text-sm font-semibold text-foreground">New Message</span>
            <div className="flex items-center gap-1">
              <button
                className="p-1 rounded hover:bg-muted transition-colors"
                onClick={e => { e.stopPropagation(); setMinimized(m => !m); }}
              >
                {minimized ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
              </button>
              <button
                className="p-1 rounded hover:bg-destructive/10 hover:text-destructive transition-colors"
                onClick={e => { e.stopPropagation(); onClose(); }}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {!minimized && (
            <>
              {/* Fields */}
              <div className="divide-y divide-border">
                <div className="flex items-center px-4">
                  <label className="text-xs text-muted-foreground w-8 shrink-0">To</label>
                  <Input
                    value={form.to}
                    onChange={e => update('to', e.target.value)}
                    placeholder="recipient@example.com"
                    className="border-0 shadow-none focus-visible:ring-0 text-sm h-10 px-2"
                  />
                  <button
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors ml-auto flex gap-1"
                    onClick={() => { setShowCC(c => !c); setShowBCC(b => !b); }}
                  >
                    CC/BCC <ChevronDown className="w-3 h-3 mt-0.5" />
                  </button>
                </div>

                <AnimatePresence>
                  {showCC && (
                    <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
                      <div className="flex items-center px-4">
                        <label className="text-xs text-muted-foreground w-8 shrink-0">CC</label>
                        <Input
                          value={form.cc}
                          onChange={e => update('cc', e.target.value)}
                          placeholder="cc@example.com"
                          className="border-0 shadow-none focus-visible:ring-0 text-sm h-10 px-2"
                        />
                      </div>
                    </motion.div>
                  )}
                  {showBCC && (
                    <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
                      <div className="flex items-center px-4">
                        <label className="text-xs text-muted-foreground w-8 shrink-0">BCC</label>
                        <Input
                          value={form.bcc}
                          onChange={e => update('bcc', e.target.value)}
                          placeholder="bcc@example.com"
                          className="border-0 shadow-none focus-visible:ring-0 text-sm h-10 px-2"
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="flex items-center px-4">
                  <label className="text-xs text-muted-foreground w-8 shrink-0">Sub</label>
                  <Input
                    value={form.subject}
                    onChange={e => update('subject', e.target.value)}
                    placeholder="Subject"
                    className="border-0 shadow-none focus-visible:ring-0 text-sm h-10 px-2"
                  />
                </div>
              </div>

              {/* Body */}
              <Textarea
                value={form.body}
                onChange={e => update('body', e.target.value)}
                placeholder="Write your message..."
                className="flex-1 min-h-[220px] border-0 shadow-none focus-visible:ring-0 resize-none text-sm px-4 py-3 rounded-none"
              />

              {/* Attachments */}
              {form.attachments.length > 0 && (
                <div className="px-4 py-2 border-t border-border flex flex-wrap gap-2">
                  {form.attachments.map((file, i) => (
                    <Badge key={i} variant="secondary" className="flex items-center gap-1.5 pr-1">
                      <Paperclip className="w-3 h-3" />
                      <span className="max-w-[120px] truncate text-xs">{file.name}</span>
                      <span className="text-muted-foreground text-xs">({formatBytes(file.size)})</span>
                      <button onClick={() => removeFile(i)} className="ml-1 hover:text-destructive transition-colors">
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}

              {/* Footer */}
              <div className="flex items-center gap-2 px-4 py-3 border-t border-border">
                <Button onClick={handleSend} disabled={sending} className="gap-2 bg-primary text-primary-foreground" size="sm">
                  <Send className="w-3.5 h-3.5" />
                  {sending ? 'Sending...' : 'Send'}
                </Button>
                <input ref={fileRef} type="file" multiple className="hidden" onChange={handleFiles} />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => fileRef.current?.click()}
                  className="gap-1.5 text-muted-foreground"
                >
                  <Paperclip className="w-3.5 h-3.5" />
                  Attach
                </Button>
                <div className="flex-1" />
                <Button variant="ghost" size="sm" onClick={onClose} className="text-muted-foreground">
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
