export type CardData = {
  name: string;
  id: string;
  riftbound_id: string;
  tcgplayer_id: string | null;
  public_code: string | null;
  collector_number: number | null;
  attributes: {
    energy: number | null;
    might: number | null;
    power: number | null;
  };
  classification: {
    type: string | null;
    supertype: string | null;
    rarity: string | null;
    domain: string[];
  };
  text: {
    rich: string | null;
    plain: string | null;
  };
  set: {
    set_id: string | null;
    label: string | null;
  };
  media: {
    image_url: string;
    artist: string | null;
    accessibility_text: string | null;
  };
  tags: string[];
  orientation: string | null;
  metadata: {
    alternate_art: boolean;
    overnumbered: boolean;
    signature: boolean;
  };
};

export type ReturnData = {
  items: CardData[];
  total: number;
  page: number;
  size: number;
  pages: number;
};