// Pasar page object: loads warungs.json, shows one card per warung, and gives the
// assistant the same list through site-actions.js. The cards work with no assistant.
export class PasarPage {
  /**
   * The warung list the cards and the assistant share, once loaded.
   */
  #warungs = [];

  /**
   * Resolves when the list is loaded, so an action never reads an empty list.
   */
  ready = Promise.resolve();

  /**
   * Fetch the warung list and show the cards.
   *
   * :param url: Address of warungs.json.
   * :return: A promise that resolves when the cards are shown. A failure is shown on the page.
   */
  load(url) {
    this.ready = this.#fetchList(url).then(this.use.bind(this), this.#showFailure.bind(this));
    return this.ready;
  }

  /**
   * Set the list and show the cards.
   *
   * :param list: An array of warungs, each with name, area, foods, network_url and page_url.
   * :raises Error: When the list is not an array of valid warungs.
   */
  use(list) {
    this.#warungs = PasarPage.validate(list);
    this.render();
  }

  /**
   * Return a copy of the list, so callers cannot change the page's own.
   *
   * :return: The warungs as plain JSON data.
   */
  getWarungs() {
    return structuredClone(this.#warungs);
  }

  /**
   * Check the list has the fields the cards and the assistant need.
   *
   * :param list: The parsed warungs.json.
   * :return: A copy of the list.
   * :raises Error: When an entry is missing a field.
   */
  static validate(list) {
    if (!Array.isArray(list)) {
      throw new Error("warungs.json must be an array.");
    }
    return list.map((entry) => {
      const ok = ["name", "area", "network_url", "page_url"].every((key) => typeof entry?.[key] === "string" && entry[key])
        && Array.isArray(entry.foods);
      if (!ok) {
        throw new Error(`warungs.json has an incomplete entry: ${JSON.stringify(entry)}`);
      }
      return { ...entry, foods: [...entry.foods] };
    });
  }

  /**
   * Show one card per warung. Text is set with textContent, never as HTML.
   */
  render() {
    const grid = document.querySelector("#warung-list");
    grid.replaceChildren(...this.#warungs.map(PasarPage.card));
    document.querySelector("#warung-status").textContent = `${this.#warungs.length} warung listed.`;
  }

  /**
   * Build the card for one warung.
   *
   * :param warung: One entry of the list.
   * :return: The card element.
   */
  static card(warung) {
    const card = document.createElement("article");
    card.className = "warung-card";
    const name = document.createElement("h3");
    name.textContent = warung.name;
    const area = document.createElement("p");
    area.className = "warung-area";
    area.textContent = warung.area;
    const foods = document.createElement("p");
    foods.textContent = warung.foods.join(", ");
    const link = document.createElement("a");
    link.href = warung.page_url;
    link.textContent = `Open ${warung.name}'s page`;
    card.append(name, area, foods, link);
    return card;
  }

  async #fetchList(url) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`warungs.json answered ${response.status}.`);
    }
    return response.json();
  }

  #showFailure(error) {
    document.querySelector("#warung-status").textContent = "The warung list could not be loaded. Please try again later.";
    this.#warungs = [];
    throw error;
  }
}

export class App {
  static page = new PasarPage();
}

// Load only in a browser. Node tests import this file and call App.page.use().
if (typeof window !== "undefined") {
  App.page.load(new URL("./warungs.json", import.meta.url)).catch((error) => {
    console.error("Pasar could not load its warung list", error);
  });
}
