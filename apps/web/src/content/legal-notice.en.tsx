export function LegalNoticeContentEn() {
  return (
    <>
      <section>
        <h2 className="mb-3 text-base font-medium text-foreground">Source archive notice</h2>
        <p>
          This site belongs to the public source archive of Parley, a Discord matchmaking and
          tournament project. The code published here is deprecated and unmaintained; it is kept for
          reference and reuse, not as a running product.
        </p>
        <p className="mt-3">
          The personal contact details of the people who worked on the project are intentionally
          omitted from this archive, and no support is promised for the archived source.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-base font-medium text-foreground">Licensing</h2>
        <p>
          The source code in this repository is licensed under the MIT License; the full text is in
          the <code>LICENSE</code> file at the repository root. The license covers the code only. It
          does not grant rights to the Parley name, logo, or other marks.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-base font-medium text-foreground">Trademarks &amp; attribution</h2>
        <p>
          Rainbow Six Siege, Ubisoft, and related marks are trademarks of Ubisoft Entertainment.
          Discord is a trademark of Discord Inc. Parley is an independent project and is not
          affiliated with, endorsed by, or sponsored by Ubisoft or Discord. Player statistics shown
          by the software originate from third-party providers and remain the property of their
          respective owners.
        </p>
      </section>

      <div className="!mt-14 border-t border-border/60 pt-6">
        <p className="text-xs text-muted-foreground/60">
          This page replaces the earlier legal notice and Imprint previously published on this site.
        </p>
      </div>
    </>
  );
}
