import { fetchJsonWithTimeout } from "../util/helpers";
import type { CardData, ReturnData } from "../util/types";

// // ---- Config (env) ----
const PAGE_SIZE = 100;
const API_TIMEOUT_MS = 60_000;

export async function updateCardData(): Promise<void> {
  let currentPage = 1;

  const url = `https://api.riftcodex.com/cards?sort=public_code&dir=1&page=${currentPage}&size=${PAGE_SIZE}`;
  console.log(`Fetching (for # of pages): ${url}`);
  const data = await fetchJsonWithTimeout<ReturnData>(url, API_TIMEOUT_MS);
  const numPages = data.pages;

  const mapData: Map<string, CardData[]> = new Map();

  for (; currentPage <= numPages; currentPage++) {
    const pageUrl = `https://api.riftcodex.com/cards?sort=public_code&dir=1&page=${currentPage}&size=${PAGE_SIZE}`;
    console.log(`Fetching: ${pageUrl}`);
    const pageData = await fetchJsonWithTimeout<ReturnData>(pageUrl, API_TIMEOUT_MS);

    for (const card of pageData.items) {
      if (card.set.set_id) {
        if (!mapData.has(card.set.set_id)) {
          mapData.set(card.set.set_id, []);
        }
        mapData.get(card.set.set_id)?.push(card);
        console.log(`Added card ${card.public_code} to set ${card.set.set_id}`);
      }
    };
  }

  for (const [setId, cards] of mapData.entries()) {
    console.log(`Set ID: ${setId} has ${cards.length} cards.`);
  };
}

// ---- CLI runner ----
updateCardData().catch((err) => {
  console.error(err);
  process.exit(1);
});
