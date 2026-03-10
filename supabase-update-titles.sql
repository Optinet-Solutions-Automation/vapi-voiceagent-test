-- Update existing conversation titles to "date, time - reviewer" format.
-- Run this once in Supabase SQL Editor to fix old conversations.

update conversations
set title = to_char(created_at at time zone 'Asia/Manila', 'Mon DD, YYYY, HH12:MIam') || ' - reviewer'
where title not like '% - %';

-- If you want to preview before updating, run this SELECT first:
-- select id, title,
--   to_char(created_at at time zone 'Asia/Manila', 'Mon DD, YYYY, HH12:MIam') || ' - reviewer' as new_title
-- from conversations
-- where title not like '% - %';

-- To rename a specific conversation:
-- update conversations set title = 'your new title here' where id = 'conversation-uuid-here';
