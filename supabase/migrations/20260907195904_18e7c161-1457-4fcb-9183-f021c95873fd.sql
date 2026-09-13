CREATE TABLE public.refund_copy (
  id boolean NOT NULL PRIMARY KEY DEFAULT true CHECK (id),
  headline text NOT NULL,
  points jsonb NOT NULL,
  footnote text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

GRANT ALL ON public.refund_copy TO service_role;
ALTER TABLE public.refund_copy ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.refund_copy_history (
  id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  headline text NOT NULL,
  points jsonb NOT NULL,
  footnote text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by uuid
);

GRANT ALL ON public.refund_copy_history TO service_role;
ALTER TABLE public.refund_copy_history ENABLE ROW LEVEL SECURITY;

CREATE INDEX refund_copy_history_changed_at_idx ON public.refund_copy_history (changed_at DESC);

INSERT INTO public.refund_copy (id, headline, points, footnote) VALUES (
  true,
  'Before you pay, here is the deal on money',
  '["Auditions are free. Listen as many times as your daily allowance lets you, and pay only when you want the full length.","Rewriting the words is always free. You approve the words before a single cent is spent, and you can send them back for another pass as often as you like.","If the piece leaves out something you asked for, the retry is free. Tell us it missed, we check the words that were actually composed, and your payment goes back as a credit you spend on a fresh attempt.","If our composer fails or the file never arrives, you are refunded in full automatically. You do not have to ask.","What is not refundable: a finished piece you simply do not like. The words were yours to approve and the audition was free, so taste is not a fault we can charge back. No refunds once a piece has been downloaded, shared by link, or sent on a card."]'::jsonb,
  'Every piece comes with a personal use licence. Resale and commercial broadcast are not included.'
);