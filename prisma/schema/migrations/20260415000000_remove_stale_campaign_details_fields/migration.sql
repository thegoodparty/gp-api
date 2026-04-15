-- Remove legacy positionId, office, otherOffice, and officeName keys
-- from campaign.details JSONB. These fields are no longer part of
-- the CampaignDetails type and have been superseded by Organization
-- and normalizedOffice.
UPDATE campaign
SET details = details - 'positionId' - 'office' - 'otherOffice' - 'officeName'
WHERE details ?| ARRAY['positionId', 'office', 'otherOffice', 'officeName'];
