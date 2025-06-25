-- Delete legacy campaign templates we no longer send
DELETE FROM "scheduled_message" AS sm
WHERE (sm.message_config->'message'->>'template') IN (
    'campagin-launch',
    'end-of-pro-subscription',
    'campaign-countdown-week-1',
    'campaign-countdown-week-2',
    'campaign-countdown-week-3',
    'campaign-countdown-week-4',
    'campaign-countdown-week-5',
    'campaign-countdown-week-6',
    'campaign-countdown-week-7',
    'campaign-countdown-week-8'
);