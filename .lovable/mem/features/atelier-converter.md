---
name: Media Converter add-on (v3)
description: Image converter + media library — folders/tags, alt text, replace-in-place, storage meter, private signed URLs, responsive WebP sets, trash/restore. Included with Atelier OR $5 one-time unlock
type: feature
---
- Route: /tools/converter (`src/routes/_authenticated/tools.converter.tsx`)
- Tabs: Convert · My uploads · Trash
- Gating: `entitlements.hasConverter` = isAtelier OR `profile.converter_enabled` (set by webhook on `converter_addon` purchase). Owners always have access.
- Private uploads (Atelier/Studio Collective/owner only) → bucket `atelier-media-private`, served via `getSignedMediaUrl` (1h signed URL).
- Public bucket: `atelier-media`. Both buckets store under `${userId}/...` enforced by RLS on storage.objects.
- Storage caps (soft, by tier, owner unlimited): Postcard/Trial 200MB · Whisper 1GB · Host 5GB · Atelier/Studio Collective 25GB. Enforced in `uploadAndRecord`.
- Responsive set: encodes 480/960/1440/1920 widths, shares `responsive_group_id`, library collapses to one card with "SET" badge; delete cascades the group.
- Replace-in-place: `uploadAndRecord` with `replaceObjectPath` + `replaceId` upserts to same path, `?v=ts` cache-busts.
- Trash: soft-delete via `deleted_at`; `restoreMyUpload` + `deleteMyUpload({permanent:true})` for purge.
- `MediaPickerButton` contract: `onPick(url, meta?: { alt?, width?, height? })` — backward compatible.
- Server fns in `src/lib/media-uploads.functions.ts`: `uploadAndRecord, listMyUploads, deleteMyUpload, restoreMyUpload, updateMyUpload, bulkUpdateUploads, listMyFolders, getStorageUsage, getSignedMediaUrl`.
- DB: `public.media_uploads` has `folder, tags[], alt_text, visibility, responsive_group_id, deleted_at` on top of v1 columns.
- 20 MB upload cap; PNG quality slider disabled (lossless); AVIF feature-detected.
