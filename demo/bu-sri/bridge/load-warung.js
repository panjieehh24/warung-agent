// Loads warung.json afresh for the bridge, which has no warung page, and checks it.
import { validateWarung } from "../warung-data.mjs";

const DATA_URL = new URL("../warung.json", import.meta.url).href;

/**
 * :return: A promise of the valid warung.json value.
 * :raises Error: When the file cannot be read or is invalid.
 */
export async function loadWarung() {
  const response = await fetch(DATA_URL, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`warung.json answered ${response.status}.`);
  }
  const data = await response.json();
  const problems = validateWarung(data);
  if (problems.length > 0) {
    throw new Error(`warung.json bermasalah: ${problems.join(" ")}`);
  }
  return data;
}
