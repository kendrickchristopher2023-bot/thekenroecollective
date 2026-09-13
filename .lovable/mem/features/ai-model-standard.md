---
name: AI model standard
description: All Lovable AI Gateway text calls in this app use google/gemini-3.6-flash — one model across every AI feature
type: preference
---
Every AI Gateway chat/text call site uses `google/gemini-3.6-flash` (current GA default).
Do not mix models: announcements, AI packages, design studio, translation, and the
Concierge support chatbot must all reference the same id. Never use `-preview` models
in shipped code, and don't leave older ids (e.g. `gemini-2.5-flash`) behind when upgrading.
Image generation models are exempt (they use their own `*-image` ids).
