// Points the developer door and the "Join Pasar" link at the repository.
import { REPO_URL } from "./config.js";

for (const link of document.querySelectorAll("a[data-repo]")) {
  const path = link.getAttribute("data-repo");
  link.href = `${REPO_URL}${path}`;
}
for (const text of document.querySelectorAll("[data-repo-text]")) {
  text.textContent = REPO_URL;
}
