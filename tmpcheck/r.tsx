import React from "react";
import { render } from "@react-email/render";
import { TEMPLATES } from "@/lib/email-templates/registry";
const t = TEMPLATES["thank-you-card"]!;
const html = await render(React.createElement(t.component as any, {...t.previewData, photo: "https://x.supabase.co/a.jpg"}));
console.log(html);
