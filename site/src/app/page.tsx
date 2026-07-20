import { loadCatalog, summarize } from "@/lib/catalog";
import { AppsClient } from "./apps-client";

export const revalidate = 300;

export default async function Home() {
  const catalog = await loadCatalog();
  const apps = catalog.map(summarize);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Cortex Registry",
    url: "https://registry.cortex.eco",
    description:
      "The public catalog of apps that run inside a Cortex instance — sandboxed, least-privilege, sha256-pinned.",
    publisher: { "@type": "Organization", name: "MOCA", url: "https://museumofcryptoart.com" },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <header className="site">
        <h1>
          CORTEX <span className="accent">REGISTRY</span>
        </h1>
        <p className="tagline">
          Apps that run <em>inside</em> your Cortex instance — sandboxed,
          least-privilege, checksum-pinned. Install from your admin panel in
          one click.
        </p>
        <p className="crumbs">
          <a href="https://github.com/mocaOS/cortex-registry">github</a>
          {" · "}
          <a href="https://raw.githubusercontent.com/mocaOS/cortex-registry/main/index.json">
            index.json
          </a>
          {" · "}
          <a href="/api/apps">json api</a>
          {" · "}
          <a href="https://cortexskills.org/builder/app/SKILL.md">build your own</a>
        </p>
      </header>

      <AppsClient apps={apps} />

      <footer className="site">
        Every listing carries its manifest verbatim and a sha256-pinned release
        artifact. CI re-verifies checksums; installing instances verify again
        before unpacking. Publish yours:{" "}
        <a href="https://github.com/mocaOS/cortex-registry#publishing-your-app">
          one PR
        </a>
        .
      </footer>
    </>
  );
}
