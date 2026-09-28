-- Yelp's Fusion/Places API dropped its free tier and the account was
-- quoted a $229/mo committed plan to keep the vendor-discovery search
-- working. Replacing with Google Places API (New), which stays free at
-- this app's usage level (5,000 free Text Search calls/month) and bills
-- pay-as-you-go beyond that, instead of a flat monthly commitment.
--
-- Renaming rather than adding new columns/tables: zero real rows existed
-- in either (0 rfq_invitations had a yelp_business_id set; yelp_cache only
-- held stale dead-provider search results), so this is a safe rename with
-- no data migration needed.
ALTER TABLE public.rfq_invitations RENAME COLUMN yelp_business_id TO external_business_id;
ALTER TABLE public.yelp_cache RENAME TO vendor_search_cache;
