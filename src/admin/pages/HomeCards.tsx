// The banner page lives in ./homeCards: the page, the editor (with its image
// dropzone) and the banner hooks. No source path says "banner": in dev every
// file is a browser-visible URL, and ad-blocker lists block such paths, which
// kills the whole module graph. Re-exported here so routes and tests keep
// importing from "./HomeCards".
export { BannersPage } from "./homeCards/HomeCardsPage";
