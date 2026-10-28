-- Môn Mỹ thuật (tô màu) cho các bản cài đã seed trước khi có môn này. Khớp SUBJECTS trong seed-data.ts.
INSERT INTO "subject" ("family_id", "code", "name", "tts_lang") VALUES (NULL, 'art', 'Mỹ thuật', 'vi-VN') ON CONFLICT DO NOTHING;
