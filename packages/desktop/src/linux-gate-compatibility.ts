import { LINUX_UPGRADE_MESSAGE } from "@telepath-computer/television-shared";

/** Compatibility with the known upstream gate; preserve Lit's outer range. */
export function installLinuxGateCompatibility(document: Document): () => void {
  const patch = (): void => {
    for (const body of document.querySelectorAll(".desktop-upgrade-gate .upgrade-gate-body")) {
      for (const link of body.querySelectorAll<HTMLAnchorElement>("a[href]")) {
        let url: URL;
        try { url = new URL(link.href); } catch { continue; }
        if (url.hostname !== "dl.todesktop.com" || !url.pathname.includes("/mac/")) continue;
        // unsafeHTML's managed comment anchors surround its h1/p elements.
        // Change only the paragraph, so the server can later rerender a
        // downloaded-update message and the restart action normally.
        const paragraph = link.closest("p");
        if (paragraph && body.contains(paragraph)) paragraph.textContent = LINUX_UPGRADE_MESSAGE;
      }
    }
  };
  const observer = new MutationObserver(patch);
  observer.observe(document, { childList: true, subtree: true });
  patch();
  return () => observer.disconnect();
}
