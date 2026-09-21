-- Reverts 00000000000050_chat_channels.sql — Chat is going back to direct
-- messages only, no team-wide channels.

drop table if exists chat_channel_messages;
drop table if exists chat_channels;
