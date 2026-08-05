// docs.parley.bot moved to parley.bot/docs — 301 everything there so old
// links and search-engine equity carry over.
export default {
  fetch(request) {
    const url = new URL(request.url);
    const target = new URL("https://parley.bot");

    if (url.pathname === "/llms.txt" || url.pathname === "/llms-full.txt") {
      target.pathname = "/llms.txt";
    } else {
      target.pathname = url.pathname === "/" ? "/docs" : `/docs${url.pathname}`;
    }
    target.search = url.search;

    return Response.redirect(target.href, 301);
  },
};
