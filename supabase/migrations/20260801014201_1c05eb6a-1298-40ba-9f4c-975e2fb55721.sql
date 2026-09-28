-- The earlier re-home only moved the metadata row, not the stored bytes, leaving a
-- dangling key in atelier-shared. Nothing references this object, so point the row
-- back at the bucket that actually holds the file (now private, owner-only access).
UPDATE storage.objects
SET bucket_id = 'atelier-media'
WHERE bucket_id = 'atelier-shared'
  AND name = '97f3faca-8a1b-4067-9792-5fa82c00707a/ai-packages/1783840751197-ipmze2-watermark-example.png';