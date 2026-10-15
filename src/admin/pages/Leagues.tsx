// The league pages live in ./leagues — one file per page, with their shared
// parts and queries beside them. Re-exported here so routes and tests keep
// importing from "./Leagues".
export { LeaguesPage } from "./leagues/LeaguesPage";
export { LeagueDetailPage } from "./leagues/LeagueDetailPage";
export { UnassignedMembersPage } from "./leagues/UnassignedMembersPage";
