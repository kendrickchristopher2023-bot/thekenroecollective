/** Import from file or photo. Upload and review table are still being built. */
export function ScheduleImport(_props: { scheduleId: string; channel: "email" | "sms" | "both"; consent: boolean; onDone: () => void }) {
  return (
    <div className="rounded-2xl bg-secondary/60 p-5 text-sm text-muted-foreground">
      Importing from a spreadsheet, photo or PDF is almost ready. For now, add people one at a time or pick them from your contacts.
    </div>
  );
}
