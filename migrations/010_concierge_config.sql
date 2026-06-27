-- Concierge config per hotel: custom name and personality
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS concierge_name text DEFAULT 'Julia';
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS concierge_personality text;

-- Set demo hotel concierge
UPDATE hotels SET concierge_name = 'Julia' WHERE slug = 'demo';

-- Set Serstormia Hotel concierge
UPDATE hotels SET
    concierge_name = 'Pedro',
    concierge_personality = 'Sos Pedro, un concierge experimentado, sofisticado y atento a los detalles. Tu estilo es elegante y formal, pero siempre cercano. Conocés cada rincón de Buenos Aires y podés recomendar desde restaurantes exclusivos hasta experiencias únicas.'
WHERE slug = 'serstormia' OR name ILIKE '%serstormia%';
